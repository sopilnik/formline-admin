import Image from 'next/image'
import { cn } from '@/lib/utils'

/** A poster thumbnail at the posters' 1 : √2 ratio; a plain tile when the product has no image. Decorative: the name is beside it. */
export function ProductThumb({ src, size = 'sm' }: { src: string | null; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'h-[42px] w-[30px]' : 'h-[56px] w-10'
  const [width, height] = size === 'sm' ? [30, 42] : [40, 56]
  if (!src) return <span aria-hidden className={cn(box, 'shrink-0 rounded-[3px] bg-muted')} />
  return <Image src={src} alt="" width={width} height={height} unoptimized className={cn(box, 'shrink-0 rounded-[3px] object-cover shadow-[0_0_0_1px_var(--border)]')} />
}
