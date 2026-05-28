import { useState } from 'react'

interface Props {
  name: string
  icon: string | null
  size?: number
}

// stable hue from name
function hueFromName(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0
  }
  return h % 360
}

function iconSrc(icon: string): string {
  if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('/')) {
    return icon
  }
  // homarr-labs dashboard-icons CDN — covers most homelab services
  return `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/${icon}.svg`
}

export function ServiceIcon({ name, icon, size = 40 }: Props) {
  const [errored, setErrored] = useState(false)
  const hue = hueFromName(name)
  const letter = name[0]?.toUpperCase() ?? '?'

  const bg = `oklch(0.38 0.10 ${hue})`
  const fg = `oklch(0.95 0.06 ${hue})`

  if (icon && !errored) {
    return (
      <div
        className="shrink-0 flex items-center justify-center bg-surface-hover border border-border"
        style={{ width: size, height: size, borderRadius: '8px' }}
      >
        <img
          src={iconSrc(icon)}
          alt=""
          onError={() => setErrored(true)}
          style={{ width: size * 0.62, height: size * 0.62, objectFit: 'contain' }}
        />
      </div>
    )
  }

  return (
    <div
      className="shrink-0 flex items-center justify-center font-display font-semibold"
      style={{
        width: size,
        height: size,
        borderRadius: '8px',
        background: bg,
        color: fg,
        fontSize: size * 0.42,
      }}
      aria-hidden
    >
      {letter}
    </div>
  )
}
