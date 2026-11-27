/**
 * The gradient progress bar, rebuilt from "Progress Bar - Gradient" (the
 * Lottie / SVG export): the same nine-stop gradient and its 6 s flowing
 * motion, a soft track, and white bubbles rising through the filled part.
 * Pure SVG + SMIL, no script, a few KB.
 *
 * Also `gradientAt`, the same gradient as colours for a text-built bar where
 * a surface draws no SVG (the desktop's lines under the prompt).
 */

export const GRADIENT_STOPS: [number, string][] = [
  [0, '#7fb2ff'],
  [0.102, '#745fea'],
  [0.204, '#690bd5'],
  [0.337, '#3a70d5'],
  [0.417, '#0bd4d5'],
  [0.547, '#7b72ea'],
  [0.677, '#eb11ff'],
  [0.839, '#7684ff'],
  [1, '#00f6ff'],
]

const hex = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0')

/** The gradient's colour at t (0..1, wrapping), as #rrggbb. */
export function gradientAt(t: number): string {
  const x = ((t % 1) + 1) % 1
  for (let i = 1; i < GRADIENT_STOPS.length; i++) {
    const hi = GRADIENT_STOPS[i]!
    const lo = GRADIENT_STOPS[i - 1]!
    if (x <= hi[0]) {
      const k = (x - lo[0]) / (hi[0] - lo[0] || 1)
      const a = hex(lo[1])
      const b = hex(hi[1])
      return `#${[0, 1, 2].map(j => toHex(a[j]! + (b[j]! - a[j]!) * k)).join('')}`
    }
  }
  return '#00f6ff'
}

/** Colour by how much is LEFT (0..100): red → orange → yellow → lime → green. */
export const STATUS_STOPS: [number, string][] = [
  [0, '#ef4444'],
  [25, '#f97316'],
  [50, '#facc15'],
  [75, '#a3e635'],
  [100, '#22c55e'],
]

const mix = (c: string, to: string, k: number) => {
  const a = hex(c)
  const b = hex(to)
  return `#${[0, 1, 2].map(j => toHex(a[j]! + (b[j]! - a[j]!) * k)).join('')}`
}

/** The ramp's colour at `left` percent, blended smoothly between stops. */
export function statusColor(left: number): string {
  const x = Math.min(100, Math.max(0, left))
  for (let i = 1; i < STATUS_STOPS.length; i++) {
    const hi = STATUS_STOPS[i]!
    const lo = STATUS_STOPS[i - 1]!
    if (x <= hi[0]) return mix(lo[1], hi[1], (x - lo[0]) / (hi[0] - lo[0] || 1))
  }
  return '#22c55e'
}

/** Deeper tone for the start of the fill, brighter tone for its tip. */
const deep = (c: string) => mix(c, '#000000', 0.32)
const bright = (c: string) => mix(c, '#ffffff', 0.18)

// Bar geometry, in the original's coordinates (an 851-unit line).
const X0 = -426
const X1 = 425
const LEN = X1 - X0

// Bubbles: x as a fraction of the bar, radius, rise time, delay.
const ALL_BUBBLES: [number, number, number, number][] = [
  [0.04, 2.6, 2.8, 0.0], [0.09, 1.6, 3.6, 1.1], [0.15, 2.2, 3.1, 0.4],
  [0.21, 1.4, 2.5, 1.9], [0.27, 2.8, 3.9, 0.8], [0.33, 1.8, 2.7, 2.3],
  [0.39, 2.4, 3.4, 0.2], [0.45, 1.5, 2.9, 1.5], [0.51, 2.9, 3.7, 2.8],
  [0.57, 1.7, 2.6, 0.6], [0.63, 2.3, 3.3, 1.7], [0.69, 1.5, 2.8, 0.1],
  [0.75, 2.7, 3.8, 2.0], [0.81, 1.9, 3.0, 0.9], [0.87, 2.2, 2.7, 1.3],
  [0.93, 1.6, 3.5, 2.5], [0.97, 2.5, 3.2, 0.5],
]

/** Lively but calm: every bubble, rising a third slower than the original. */
const BUBBLES = ALL_BUBBLES.map(
  ([x, r, rise, delay]) => [x, r, rise * 1.35, delay * 1.35] as [number, number, number, number],
)

const clamp = (n: number) => Math.min(100, Math.max(0, n))
const f = (n: number) => Math.round(n * 100) / 100

export function gradientBarSvg(from: number, to: number, glideMs = 900, aspect = 150 / 7): string {
  // Fit the drawing to the box it is shown in (width : height), so the bar's
  // round ends and bubbles stay round: the bar is ~72 % of the height.
  const vbH0 = (LEN + 8) / (aspect - 0.72)
  const THICK = f(vbH0 * 0.72)
  const k = THICK / 20
  const a = clamp(from)
  const b = clamp(to)
  const dur = `${(glideMs / 1000).toFixed(2)}s`
  const ca = statusColor(a)
  const cb = statusColor(b)
  const w = (p: number) => f((LEN * p) / 100 + THICK / 2 + 1)

  const bubbles = BUBBLES.map(([fx, r, rise, delay]) => {
    const x = f(X0 + LEN * fx)
    const drift = f(((fx * 97) % 1) * 8 - 4)
    return `<circle cx="${x}" cy="${THICK / 2 + 3}" r="${f(r * k)}" fill="#fff" opacity="0">
<animate attributeName="cy" values="${THICK / 2 + 3};${-THICK / 2 - 3}" dur="${rise}s" begin="${delay}s" repeatCount="indefinite"/>
<animate attributeName="cx" values="${x};${f(x + drift)}" dur="${rise}s" begin="${delay}s" repeatCount="indefinite"/>
<animate attributeName="opacity" values="0;0.55;0.42;0" keyTimes="0;0.25;0.7;1" dur="${rise}s" begin="${delay}s" repeatCount="indefinite"/>
</circle>`
  }).join('')

  const end = (p: number) => f(X0 + (LEN * p) / 100)
  const fill = (extra: string) =>
    `<line x1="${X0}" y1="0" x2="${end(b)}" y2="0" stroke="url(#g)" stroke-width="${THICK}" stroke-linecap="round" ${extra}>` +
    `<animate attributeName="x2" from="${end(a)}" to="${end(b)}" dur="${dur}" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.22 1 0.36 1"/></line>`

  const padX = THICK / 2 + 4
  const vbX = f(X0 - padX)
  const vbW = f(LEN + padX * 2)
  const vbH = f(vbW / aspect)
  const vbY = f(-vbH / 2)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" preserveAspectRatio="none" width="100%" height="100%">
<defs>
<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="${X0}" y1="0" x2="${end(b)}" y2="0">
<stop offset="0" stop-color="${deep(cb)}">${ca !== cb ? `<animate attributeName="stop-color" from="${deep(ca)}" to="${deep(cb)}" dur="${dur}" fill="freeze"/>` : ''}</stop>
<stop offset="0.7" stop-color="${cb}">${ca !== cb ? `<animate attributeName="stop-color" from="${ca}" to="${cb}" dur="${dur}" fill="freeze"/>` : ''}</stop>
<stop offset="1" stop-color="${bright(cb)}">${ca !== cb ? `<animate attributeName="stop-color" from="${bright(ca)}" to="${bright(cb)}" dur="${dur}" fill="freeze"/>` : ''}</stop>
<animate attributeName="x2" from="${end(a)}" to="${end(b)}" dur="${dur}" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.22 1 0.36 1"/>
</linearGradient>
<linearGradient id="sheen" gradientUnits="userSpaceOnUse" x1="${X0 - 260}" y1="0" x2="${X0}" y2="0">
<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.32"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
<animateTransform attributeName="gradientTransform" type="translate" values="0 0;${LEN + 520} 0;${LEN + 520} 0" keyTimes="0;0.5;1" dur="5s" repeatCount="indefinite"/>
</linearGradient>
<clipPath id="c"><rect x="${X0 - THICK / 2 - 1}" y="${vbY}" height="${vbH}" width="${w(b)}">
<animate attributeName="width" from="${w(a)}" to="${w(b)}" dur="${dur}" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.22 1 0.36 1"/>
</rect></clipPath>
<filter id="glow" x="-10%" y="-200%" width="120%" height="500%"><feGaussianBlur stdDeviation="${f(3 * k)}"/></filter>
</defs>
<line x1="${X0}" y1="0" x2="${X1}" y2="0" stroke="#ffffff" stroke-opacity="0.12" stroke-width="${THICK}" stroke-linecap="round"/>
${b <= 0 && a <= 0 ? '' : `${fill('filter="url(#glow)" opacity="0.45"')}${fill('')}${fill('').replace('url(#g)', 'url(#sheen)')}`}
<g clip-path="url(#c)" opacity="0.9">${bubbles}</g>
</svg>`
}
