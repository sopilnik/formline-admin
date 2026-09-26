import { encode } from 'uqr'

/**
 * The otpauth URI as an SVG QR code: one path of dark modules on a white quiet
 * zone. Scanners need dark on light, so these two colours stay fixed in both themes.
 */
export function QrCode({ value, label }: { value: string; label: string }) {
  const { data, size } = encode(value, { ecc: 'M', border: 2 })
  let path = ''
  data.forEach((row, y) => row.forEach((dark, x) => {
    if (dark) path += `M${x} ${y}h1v1h-1z`
  }))
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" className="size-44 shrink-0 rounded-md">
      <rect width={size} height={size} fill="#FFFFFF" />
      <path d={path} fill="#000000" />
    </svg>
  )
}
