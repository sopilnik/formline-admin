import Image from 'next/image'
import { useTranslations } from 'next-intl'

/** A product's poster: where it is served and its own size. */
export type PosterImage = { src: string; width: number; height: number }

/** The product's poster at its own proportions, or a note that it has none. The name is the page's heading, so the image is decorative. */
export function ProductImage({ image }: { image: PosterImage | null }) {
  const t = useTranslations('products.detail')

  if (!image) {
    return <div className="grid aspect-[5/7] w-full max-w-60 place-items-center rounded-md bg-muted text-[13px] text-muted-foreground">{t('noImage')}</div>
  }

  return (
    <Image
      src={image.src}
      alt=""
      width={image.width}
      height={image.height}
      unoptimized
      // A tall image keeps its proportions within 15 × 24 rem, so the buttons under it stay in view; in a column it keeps its
      // own width instead of stretching to the column's.
      className="h-auto max-h-96 w-auto max-w-60 self-start rounded-md shadow-[0_0_0_1px_var(--border)]"
    />
  )
}
