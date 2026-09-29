import 'server-only'
import { and, asc, count, desc, eq, ilike, inArray, ne, or, sql, type SQL } from 'drizzle-orm'
import { pageCount } from '@/lib/pagination'
import { SIZE_IDS, SIZE_SURCHARGE_CENTS } from '@/lib/products/price'
import type { ProductsQuery } from '@/lib/products/query'
import { PRODUCT_STATUSES, type ProductStatus } from '@/lib/products/status'
import { containsPattern } from '@/server/db/like'
import { collections, images, products, productVariants } from '@/server/db/schema'
import type { Tx } from '@/server/db/with-workspace'

export type ImageRef = { id: string; storagePath: string; source: 'static' | 'upload' }
export type CollectionOption = { id: string; slug: string; name: string }

export type ProductRow = {
  id: string; slug: string; name: string; status: ProductStatus
  collection: CollectionOption
  image: ImageRef | null
  /** The cheapest variant; null for a product without variants. */
  priceFromCents: number | null
  stock: number; variants: number
  /** Variants with no stock left, and variants at or below their threshold (the sold-out ones included). */
  soldOut: number; low: number
  updatedAt: Date
}

export type ProductsList = {
  rows: ProductRow[]
  /** Every product of the workspace, and the ones the filters keep. */
  total: number; filtered: number
  /** Per status, with every other filter applied (the chips, as on the orders list). */
  statusCounts: Record<ProductStatus, number>
  collections: CollectionOption[]
  page: number; pages: number
}

/** At most this many products per workspace, so a sandbox stays small (stage 5 amendment). */
export const PRODUCT_CAP = 200

/** The collections in their order (spec §8.3): the filter's choices and the product form's. */
export async function listCollectionOptions(tx: Tx, workspaceId: string): Promise<CollectionOption[]> {
  return tx.select({ id: collections.id, slug: collections.slug, name: collections.name }).from(collections)
    .where(eq(collections.workspaceId, workspaceId)).orderBy(asc(collections.position), asc(collections.name))
}

/** Variants join their product inside the same workspace (composite keys, spec §6.1). */
const variantJoin = and(eq(productVariants.workspaceId, products.workspaceId), eq(productVariants.productId, products.id))!

/** A variant's price in SQL, as `variantPriceCents` computes it: the override, else the base price plus the size's surcharge. */
const variantPriceSql = sql`coalesce(${productVariants.priceOverrideCents}, ${products.basePriceCents} + case ${productVariants.size} ${
  sql.join(SIZE_IDS.map(size => sql`when ${size} then ${SIZE_SURCHARGE_CENTS[size]}::int`), sql` `)} end)`

/** Archived products never count as sold out or low (spec §8.1), as on the overview. */
const soldOutSql = sql<number>`(case when ${products.status} <> 'archived' then count(*) filter (where ${productVariants.stock} = 0) else 0 end)::int`
const lowSql = sql<number>`(case when ${products.status} <> 'archived' then count(*) filter (where ${productVariants.stock} <= ${productVariants.lowStockThreshold}) else 0 end)::int`
const priceFromSql = sql<number | null>`min(${variantPriceSql})::int`
const stockSql = sql<number>`coalesce(sum(${productVariants.stock}), 0)::int`
/** Names sort in the Unicode root order, whatever the database's own collation is. */
const nameSql = sql`${products.name} collate "unicode"`

/** Every filter on the product's own columns; `withStatus: false` leaves the status out (the chip counts). */
function productFilters(workspaceId: string, query: ProductsQuery, collectionId: string | null, withStatus = true): SQL {
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
 * The products list (spec §8.3): one page, filtered, counted and sorted in the database.
 * Each query joins at most two tables — the products and their variants, grouped per
 * product — as spec §6.1 asks of queries over a new sandbox's rows; the collections and
 * the images of the page are read on their own and joined here.
 */
export async function listProducts(tx: Tx, workspaceId: string, query: ProductsQuery): Promise<ProductsList> {
  const collectionOptions = await listCollectionOptions(tx, workspaceId)
  const collectionId = collectionOptions.find(c => c.slug === query.collection)?.id ?? null
  const having = stockFilter(query)

  const kept = tx.select({ status: products.status }).from(products).leftJoin(productVariants, variantJoin)
    .where(productFilters(workspaceId, query, collectionId, false))
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
    .where(productFilters(workspaceId, query, collectionId))
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
