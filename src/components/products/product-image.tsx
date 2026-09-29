import Image from 'next/image'
import { useTranslations } from 'next-intl'

/** The product's poster at its own proportions, or a note that it has none. The name is the page's heading, so the image is decorative. */
export function ProductImage({ src, width, height }: { src: string | null; width: number; height: number }) {
  const t = useTranslations('products.detail')
  if (!src) {
    return <div className="grid aspect-[5/7] w-full max-w-60 place-items-center rounded-md bg-muted text-[13px] text-muted-foreground">{t('noImage')}</div>
  }
  return (
    <Image
      src={src}
      alt=""
      width={width}
      height={height}
      unoptimized
      className="h-auto w-full max-w-60 rounded-md shadow-[0_0_0_1px_var(--border)]"
    />
  )
}
