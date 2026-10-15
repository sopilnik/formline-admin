import 'server-only'
import { and, asc, count, desc, eq, ilike, inArray, ne, or, sql, type SQL } from 'drizzle-orm'
import { compareVariants } from '@/lib/catalog'
import { pageCount } from '@/lib/pagination'
import { SIZE_IDS, SIZE_SURCHARGE_CENTS, variantPriceCents, type SizeId } from '@/lib/products/price'
import type { ProductsQuery } from '@/lib/products/query'
import { canTransitionProduct, deleteBlocker, PRODUCT_STATUSES, type DeleteBlocker, type ProductStatus } from '@/lib/products/status'
import type { CollectionOption, ImageRef, ProductRow } from '@/lib/products/view'
import { lockCap, refuseTaken } from '@/server/dal/concurrency'
import { releaseImage } from '@/server/dal/images'
import { unicodeName } from '@/server/dal/sql'
import { containsPattern } from '@/server/db/like'
import { collections, images, orderLines, products, productVariants } from '@/server/db/schema'
import type { Tx } from '@/server/db/with-workspace'

export type ProductsList = {
  rows: ProductRow[]
  /** Every product of the workspace, and the ones the filters keep. */
  total: number; filtered: number
  /** Per status, with every other filter applied (the chips, as on the orders list). */
  statusCounts: Record<ProductStatus, number>
  collections: CollectionOption[]
  page: number; pages: number
}

/** At most this many products per workspace, so a sandbox stays small. */
export const PRODUCT_CAP = 200

/** The unique constraints a product save can break, and the refusal each one means. */
const SLUG_TAKEN = { products_workspace_id_slug_key: 'slug_taken' } as const
const SLUG_OR_SKU_TAKEN = { ...SLUG_TAKEN, product_variants_workspace_id_sku_key: 'sku_taken' } as const

/** The collections in their order: the filter's choices and the product form's. */
export async function listCollectionOptions(tx: Tx, workspaceId: string): Promise<CollectionOption[]> {
  return tx.select({ id: collections.id, slug: collections.slug, name: collections.name }).from(collections)
    .where(eq(collections.workspaceId, workspaceId)).orderBy(asc(collections.position), asc(collections.name))
}

/** Variants join their product inside the same workspace (composite keys). */
const variantJoin = and(eq(productVariants.workspaceId, products.workspaceId), eq(productVariants.productId, products.id))!

/** A variant's price in SQL, as `variantPriceCents` computes it: the override, else the base price plus the size's surcharge. */
const variantPriceSql = sql`coalesce(${productVariants.priceOverrideCents}, ${products.basePriceCents} + case ${productVariants.size} ${
  sql.join(SIZE_IDS.map(size => sql`when ${size} then ${SIZE_SURCHARGE_CENTS[size]}::int`), sql` `)} end)`

/** Archived products never count as sold out or low, as on the overview. */
const soldOutSql = sql<number>`(case when ${products.status} <> 'archived' then count(*) filter (where ${productVariants.stock} = 0) else 0 end)::int`
const lowSql = sql<number>`(case when ${products.status} <> 'archived' then count(*) filter (where ${productVariants.stock} <= ${productVariants.lowStockThreshold}) else 0 end)::int`
const priceFromSql = sql<number | null>`min(${variantPriceSql})::int`
const stockSql = sql<number>`coalesce(sum(${productVariants.stock}), 0)::int`
/** Names sort in the Unicode root order, whatever the database's own collation is. */
const nameSql = unicodeName(products.name)

/** Every filter on the product's own columns; `withStatus: false` leaves the status out (the chip counts). */
function productFilters(workspaceId: string, { query, collectionId }: { query: ProductsQuery; collectionId: string | null }, withStatus = true): SQL {
  const parts: SQL[] = [eq(products.workspaceId, workspaceId)]

  if (withStatus && query.status.length > 0) parts.push(inArray(products.status, query.status))
  if (query.q) {
    const pattern = containsPattern(query.q)

    parts.push(or(ilike(products.name, pattern), ilike(products.slug, pattern))!)
  }
  // A collection slug the workspace does not have keeps no product.
  if (query.collection) parts.push(collectionId ? eq(products.collectionId, collectionId) : sql`false`)
  if (query.stock !== 'any') parts.push(ne(products.status, 'archived'))

  return and(...parts)!
}

/** The stock filters test the product's variants, so they apply to the grouped rows. */
function stockFilter(query: ProductsQuery): SQL | undefined {
  if (query.stock === 'out') return sql`${soldOutSql} > 0`
  if (query.stock === 'low') return sql`${lowSql} > 0`

  return undefined
}

/** The ORDER BY of the query: its column, then the name and the id, so pages never overlap. */
function productSort(query: ProductsQuery): SQL[] {
  const direction = query.dir === 'asc' ? asc : desc
  const column: Record<ProductsQuery['sort'], SQL | undefined> = {
    name: undefined,
    price: sql`coalesce(${priceFromSql}, 0)`,
    stock: stockSql,
    updated: sql`${products.updatedAt}`,
  }
  const key = column[query.sort]

  return [...(key ? [direction(key)] : []), direction(nameSql), direction(products.id)]
}

/**
 * The products list: one page, filtered, counted and sorted in the database.
 * Each query joins at most two tables — the products and their variants, grouped per
 * product — which keeps the planner's estimates right for a new sandbox's rows; the collections and
 * the images of the page are read on their own and joined here.
 */
export async function listProducts(tx: Tx, workspaceId: string, query: ProductsQuery): Promise<ProductsList> {
  const collectionOptions = await listCollectionOptions(tx, workspaceId)
  const collectionId = collectionOptions.find(c => c.slug === query.collection)?.id ?? null
  const having = stockFilter(query)

  const kept = tx.select({ status: products.status }).from(products).leftJoin(productVariants, variantJoin)
    .where(productFilters(workspaceId, { query, collectionId }, false))
    .groupBy(products.workspaceId, products.id).having(having).as('kept')
  const byStatus = await tx.select({ status: sql<ProductStatus>`${kept.status}`, n: count() }).from(kept).groupBy(kept.status)
  const statusCounts = Object.fromEntries(PRODUCT_STATUSES.map(s => [s, 0])) as Record<ProductStatus, number>

  for (const row of byStatus) statusCounts[row.status] = row.n

  const shown: readonly ProductStatus[] = query.status.length > 0 ? query.status : PRODUCT_STATUSES
  const filtered = shown.reduce((sum, s) => sum + statusCounts[s], 0)
  const [totalRow] = await tx.select({ n: count() }).from(products).where(eq(products.workspaceId, workspaceId))

  const pageRows = await tx.select({
    id: products.id, slug: products.slug, name: products.name, status: products.status, collectionId: products.collectionId,
    imageId: products.imageId, updatedAt: products.updatedAt,
    priceFromCents: priceFromSql, stock: stockSql, variants: sql<number>`count(${productVariants.id})::int`,
    soldOut: soldOutSql, low: lowSql,
  }).from(products).leftJoin(productVariants, variantJoin)
    .where(productFilters(workspaceId, { query, collectionId }))
    .groupBy(products.workspaceId, products.id).having(having)
    .orderBy(...productSort(query)).limit(query.size).offset((query.page - 1) * query.size)

  const imageIds = pageRows.flatMap(p => (p.imageId ? [p.imageId] : []))
  const imageRows = imageIds.length === 0 ? [] : await tx
    .select({ id: images.id, storagePath: images.storagePath, source: images.source }).from(images)
    .where(and(eq(images.workspaceId, workspaceId), inArray(images.id, imageIds)))
  const collectionOf = new Map(collectionOptions.map(c => [c.id, c]))
  const imageOf = new Map(imageRows.map(i => [i.id, i]))
  const rows: ProductRow[] = pageRows.map(({ collectionId: id, imageId, ...row }) => ({
    ...row,
    collection: collectionOf.get(id)!,
    image: imageId ? (imageOf.get(imageId) ?? null) : null,
  }))

  return {
    rows, total: totalRow?.n ?? 0, filtered, statusCounts, collections: collectionOptions,
    page: query.page, pages: pageCount(filtered, query.size),
  }
}

export type VariantDetail = {
  id: string; sku: string; size: SizeId; palette: string
  priceOverrideCents: number | null
  /** What the variant sells for: the override, or the base price plus the size's surcharge. */
  priceCents: number
  stock: number; lowStockThreshold: number
}

export type ProductDetail = {
  id: string; slug: string; name: string; description: string; status: ProductStatus; tags: string[]; basePriceCents: number
  collection: CollectionOption
  image: (ImageRef & { width: number; height: number }) | null
  createdAt: Date; updatedAt: Date
  /** The details form's concurrency token: `updated_at` in microseconds, exact where a Date is not. */
  version: string
  /** In the store's order: by palette, then A3, A2, A1. */
  variants: VariantDetail[]
  /** Whether any order line points at one of the variants: such a product is archived, never deleted. */
  hasOrders: boolean
}

const versionSql = sql<string>`(extract(epoch from ${products.updatedAt}) * 1000000)::bigint::text`

/** One product by the slug in its address, with everything its page shows. One table per query. */
export async function getProduct(tx: Tx, workspaceId: string, slug: string): Promise<ProductDetail | null> {
  const [product] = await tx.select({
    id: products.id, slug: products.slug, name: products.name, description: products.description, status: products.status,
    tags: products.tags, basePriceCents: products.basePriceCents, collectionId: products.collectionId, imageId: products.imageId,
    createdAt: products.createdAt, updatedAt: products.updatedAt, version: versionSql,
  }).from(products).where(and(eq(products.workspaceId, workspaceId), eq(products.slug, slug)))

  if (!product) return null

  const [collection] = await tx.select({ id: collections.id, slug: collections.slug, name: collections.name }).from(collections)
    .where(and(eq(collections.workspaceId, workspaceId), eq(collections.id, product.collectionId)))
  const [image] = product.imageId === null ? [] : await tx
    .select({ id: images.id, storagePath: images.storagePath, source: images.source, width: images.width, height: images.height }).from(images)
    .where(and(eq(images.workspaceId, workspaceId), eq(images.id, product.imageId)))
  const variantRows = await tx.select({
    id: productVariants.id, sku: productVariants.sku, size: productVariants.size, palette: productVariants.palette,
    priceOverrideCents: productVariants.priceOverrideCents, stock: productVariants.stock, lowStockThreshold: productVariants.lowStockThreshold,
  }).from(productVariants).where(and(eq(productVariants.workspaceId, workspaceId), eq(productVariants.productId, product.id)))
  const ids = variantRows.map(v => v.id)
  const [ordered] = ids.length === 0 ? [] : await tx.select({ id: orderLines.id }).from(orderLines)
    .where(and(eq(orderLines.workspaceId, workspaceId), inArray(orderLines.variantId, ids))).limit(1)

  return {
    id: product.id, slug: product.slug, name: product.name, description: product.description, status: product.status,
    tags: product.tags, basePriceCents: product.basePriceCents,
    collection: collection!,
    image: image ?? null,
    createdAt: product.createdAt, updatedAt: product.updatedAt, version: product.version,
    variants: variantRows
      .map(v => ({ ...v, priceCents: variantPriceCents(product.basePriceCents, v.size, v.priceOverrideCents) }))
      .sort(compareVariants),
    hasOrders: ordered !== undefined,
  }
}

export type DetailsInput = { productId: string; version: string; name: string; slug: string; collectionId: string; basePriceCents: number; tags: string[]; description: string }

export type DetailsChange =
  | { ok: true; slug: string; previousSlug: string; changed: string[] }
  | { ok: false; reason: 'not_found' | 'conflict' | 'slug_taken' | 'collection_missing' }

/**
 * Saves the details form. The row is locked and its version compared, so a save
 * made from a page opened before someone else's change reports a conflict instead of
 * overwriting it. For a viewer, row-level security hides the row from the locking read.
 */
export async function updateProductDetails(tx: Tx, workspaceId: string, input: DetailsInput): Promise<DetailsChange> {
  const [row] = await tx.select({
    slug: products.slug, name: products.name, collectionId: products.collectionId, basePriceCents: products.basePriceCents,
    tags: products.tags, description: products.description, version: versionSql,
  }).from(products).where(and(eq(products.workspaceId, workspaceId), eq(products.id, input.productId))).for('update')

  if (!row) return { ok: false, reason: 'not_found' }
  if (row.version !== input.version) return { ok: false, reason: 'conflict' }

  const [collection] = await tx.select({ id: collections.id }).from(collections)
    .where(and(eq(collections.workspaceId, workspaceId), eq(collections.id, input.collectionId)))

  if (!collection) return { ok: false, reason: 'collection_missing' }
  if (input.slug !== row.slug) {
    const [other] = await tx.select({ id: products.id }).from(products).where(and(eq(products.workspaceId, workspaceId), eq(products.slug, input.slug)))

    if (other) return { ok: false, reason: 'slug_taken' }
  }

  const changed = [
    input.name !== row.name && 'name', input.slug !== row.slug && 'slug', input.collectionId !== row.collectionId && 'collection',
    input.basePriceCents !== row.basePriceCents && 'basePrice', input.tags.join(',') !== row.tags.join(',') && 'tags',
    input.description !== row.description && 'description',
  ].filter((field): field is string => typeof field === 'string')
  const saved = { ok: true as const, slug: input.slug, previousSlug: row.slug, changed }

  if (changed.length === 0) return saved

  return refuseTaken(tx, SLUG_TAKEN, async () => {
    await tx.update(products).set({
      name: input.name, slug: input.slug, collectionId: input.collectionId, basePriceCents: input.basePriceCents,
      tags: input.tags, description: input.description, updatedAt: sql`now()`,
    }).where(and(eq(products.workspaceId, workspaceId), eq(products.id, input.productId)))

    return saved
  })
}

export type NewProductInput = {
  name: string; slug: string; collectionId: string; basePriceCents: number; tags: string[]; description: string
  palettes: string[]; lowStockThreshold: number
}

export type ProductCreation =
  | { ok: true; id: string; slug: string; variants: number }
  | { ok: false; reason: 'cap' | 'slug_taken' | 'sku_taken' | 'collection_missing' }

/**
 * A new product: a draft with one variant per size and chosen palette, no stock,
 * and the store's low-stock threshold. SKUs are made from the slug once and never change, so
 * a product that later took another slug still holds them: a new slug may collide with its SKUs.
 */
export async function createProduct(tx: Tx, workspaceId: string, input: NewProductInput): Promise<ProductCreation> {
  await lockCap(tx, workspaceId, 'products')

  const [counted] = await tx.select({ n: count() }).from(products).where(eq(products.workspaceId, workspaceId))

  if ((counted?.n ?? 0) >= PRODUCT_CAP) return { ok: false, reason: 'cap' }

  const [collection] = await tx.select({ id: collections.id }).from(collections)
    .where(and(eq(collections.workspaceId, workspaceId), eq(collections.id, input.collectionId)))

  if (!collection) return { ok: false, reason: 'collection_missing' }

  const [other] = await tx.select({ id: products.id }).from(products).where(and(eq(products.workspaceId, workspaceId), eq(products.slug, input.slug)))

  if (other) return { ok: false, reason: 'slug_taken' }

  const variants = input.palettes.flatMap(palette => SIZE_IDS.map(size => ({ size, palette, sku: `${input.slug}-${size}-${palette}` })))
  const [taken] = await tx.select({ id: productVariants.id }).from(productVariants)
    .where(and(eq(productVariants.workspaceId, workspaceId), inArray(productVariants.sku, variants.map(v => v.sku))))

  if (taken) return { ok: false, reason: 'sku_taken' }

  return refuseTaken(tx, SLUG_OR_SKU_TAKEN, async () => {
    const [created] = await tx.insert(products).values({
      workspaceId, slug: input.slug, name: input.name, collectionId: input.collectionId, description: input.description,
      basePriceCents: input.basePriceCents, status: 'draft', tags: input.tags,
    }).returning({ id: products.id })

    await tx.insert(productVariants).values(variants.map(v => ({
      workspaceId, productId: created!.id, sku: v.sku, size: v.size, palette: v.palette, stock: 0, lowStockThreshold: input.lowStockThreshold,
    })))

    return { ok: true as const, id: created!.id, slug: input.slug, variants: variants.length }
  })
}

export type VariantRowInput = { id: string; priceOverrideCents: number | null; stock: number; stockWas: number; lowStockThreshold: number }
export type VariantChange = { sku: string; price?: [number | null, number | null]; stock?: [number, number]; threshold?: [number, number] }

export type VariantsSave =
  | { ok: true; slug: string; changes: VariantChange[] }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'stock_conflict'; skus: string[] }

/**
 * Saves the variant form. The variants are locked first. A stock the person changed
 * while the stored stock moved on since the page opened (a sale, another person) is a conflict,
 * and nothing is written; a stock the person left alone is not written at all, so a sale made
 * meanwhile stays counted.
 */
export async function saveVariants(
  tx: Tx,
  workspaceId: string,
  { productId, rows }: { productId: string; rows: readonly VariantRowInput[] },
): Promise<VariantsSave> {
  const [product] = await tx.select({ slug: products.slug }).from(products)
    .where(and(eq(products.workspaceId, workspaceId), eq(products.id, productId))).for('update')

  if (!product) return { ok: false, reason: 'not_found' }

  const stored = await tx.select({
    id: productVariants.id, sku: productVariants.sku, priceOverrideCents: productVariants.priceOverrideCents,
    stock: productVariants.stock, lowStockThreshold: productVariants.lowStockThreshold,
  }).from(productVariants)
    .where(and(eq(productVariants.workspaceId, workspaceId), eq(productVariants.productId, productId)))
    .orderBy(asc(productVariants.id)).for('update')
  const byId = new Map(stored.map(v => [v.id, v]))

  if (rows.some(row => !byId.has(row.id))) return { ok: false, reason: 'not_found' }

  const conflicts = rows.filter(row => row.stock !== row.stockWas && byId.get(row.id)!.stock !== row.stockWas).map(row => byId.get(row.id)!.sku)

  if (conflicts.length > 0) return { ok: false, reason: 'stock_conflict', skus: conflicts.sort() }

  const changes: VariantChange[] = []

  for (const row of rows) {
    const current = byId.get(row.id)!
    const change: VariantChange = { sku: current.sku }

    if (row.priceOverrideCents !== current.priceOverrideCents) change.price = [current.priceOverrideCents, row.priceOverrideCents]
    if (row.stock !== row.stockWas && row.stock !== current.stock) change.stock = [current.stock, row.stock]
    if (row.lowStockThreshold !== current.lowStockThreshold) change.threshold = [current.lowStockThreshold, row.lowStockThreshold]
    if (!change.price && !change.stock && !change.threshold) continue
    await tx.update(productVariants).set({
      priceOverrideCents: row.priceOverrideCents,
      lowStockThreshold: row.lowStockThreshold,
      ...(change.stock ? { stock: row.stock } : {}),
    }).where(and(eq(productVariants.workspaceId, workspaceId), eq(productVariants.id, row.id)))
    changes.push(change)
  }

  return { ok: true, slug: product.slug, changes: changes.sort((a, b) => a.sku.localeCompare(b.sku)) }
}

export type ProductStatusChange =
  | { ok: true; slug: string; from: ProductStatus; to: ProductStatus }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'invalid_transition'; from: ProductStatus }

/** One status step: the row is locked and the machine checked; the step counts as a change of the product. */
export async function changeProductStatus(tx: Tx, workspaceId: string, input: { productId: string; to: ProductStatus }): Promise<ProductStatusChange> {
  const [row] = await tx.select({ slug: products.slug, status: products.status }).from(products)
    .where(and(eq(products.workspaceId, workspaceId), eq(products.id, input.productId))).for('update')

  if (!row) return { ok: false, reason: 'not_found' }
  if (!canTransitionProduct(row.status, input.to)) return { ok: false, reason: 'invalid_transition', from: row.status }
  await tx.update(products).set({ status: input.to, updatedAt: sql`now()` })
    .where(and(eq(products.workspaceId, workspaceId), eq(products.id, input.productId)))

  return { ok: true, slug: row.slug, from: row.status, to: input.to }
}

export type ProductDeletion =
  | { ok: true; slug: string; name: string; variants: number; queued: string | null }
  | { ok: false; reason: 'not_found' | DeleteBlocker }

/**
 * Deletes a draft without orders with its variants and its image; the image's
 * stored file, if it is an upload, is queued for deletion. Anything else is archived instead.
 */
export async function deleteProduct(tx: Tx, workspaceId: string, productId: string): Promise<ProductDeletion> {
  const [row] = await tx.select({ slug: products.slug, name: products.name, status: products.status, imageId: products.imageId }).from(products)
    .where(and(eq(products.workspaceId, workspaceId), eq(products.id, productId))).for('update')

  if (!row) return { ok: false, reason: 'not_found' }

  const variantRows = await tx.select({ id: productVariants.id }).from(productVariants)
    .where(and(eq(productVariants.workspaceId, workspaceId), eq(productVariants.productId, productId)))
  const ids = variantRows.map(v => v.id)
  const [ordered] = ids.length === 0 ? [] : await tx.select({ id: orderLines.id }).from(orderLines)
    .where(and(eq(orderLines.workspaceId, workspaceId), inArray(orderLines.variantId, ids))).limit(1)
  const blocker = deleteBlocker(row.status, ordered !== undefined)

  if (blocker) return { ok: false, reason: blocker }
  await tx.delete(products).where(and(eq(products.workspaceId, workspaceId), eq(products.id, productId)))

  const queued = row.imageId ? await releaseImage(tx, workspaceId, row.imageId) : null

  return { ok: true, slug: row.slug, name: row.name, variants: ids.length, queued }
}
