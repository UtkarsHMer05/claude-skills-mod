import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Limit } from '../types'
import { gradientAt, gradientBarSvg, statusColor } from './bar'

/**
 * usage-card: how much of your 5-hour and weekly limits is LEFT, as a small
 * translucent card in the band above the prompt box. 5-hour on top, weekly
 * below. Bars fill in when a session starts and glide when the numbers move.
 * Numbers come from the rate-limit figures Claude Code receives with each
 * answer; nothing is fetched.
 */

const limitsA = atom({ plugin: 'usage-card', key: 'limits' } as const, [] as Limit[])

const WINDOWS = [
  { kind: 'five_hour', title: '5-hour limit', short: '5h' },
  { kind: 'seven_day', title: 'Weekly limit', short: 'Weekly' },
] as const

const GLIDE_MS = 900
/** Cells in the weekly text-built bar. */
const TEXT_CELLS = 24
/**
 * Spaces that survive on the desktop's text-only line (it collapses runs of
 * ordinary spaces into one): an en space plus a no-break space, and a wider
 * one between "% left" and the reset time.
 */
const GAP = '\u2002\u00a0'
const WIDE_GAP = '\u2003\u2002'
/** How often the weekly bar's colours move along, and by how much. */
const FLOW_MS = 160
const FLOW_STEP = 0.012
const FRAME_MS = 33

const isLimit = (l: unknown): l is Limit =>
  !!l && typeof (l as Limit).kind === 'string' && typeof (l as Limit).percentUsed === 'number'

const keep = (list: readonly unknown[] | undefined): Limit[] =>
  (list ?? [])
    .filter(isLimit)
    .filter(l => WINDOWS.some(w => w.kind === l.kind))
    .map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt }))

/** A window whose reset time has passed starts again from zero used. */
const fresh = (l: Limit, now: number): Limit =>
  l.resetsAt && Date.parse(l.resetsAt) <= now ? { kind: l.kind, percentUsed: 0 } : l

const leftOf = (l: Limit) => Math.min(100, Math.max(0, 100 - l.percentUsed))

/** Colour by what is left: green, then amber under 30 %, red under 10 %. */
/** Text colour by what is left: the same green → yellow → red ramp as the bars. */
function tone(left: number): string {
  return statusColor(left)
}

function resetText(l: Limit, now: number): string {
  if (!l.resetsAt) return ''
  const at = Date.parse(l.resetsAt)
  const ms = at - now
  if (!(ms > 0)) return 'resetting…'
  const mins = Math.round(ms / 60_000)
  if (mins < 60) return `resets in ${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h < 24) return `resets in ${h}h ${String(m).padStart(2, '0')}m`
  const d = new Date(at)
  const day = d.toLocaleDateString('en-US', { weekday: 'short' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `resets ${day} ${time}`
}

/** Compact reset time for the desktop line: "↻ 1h 11m", "↻ Wed 4:30 AM". */
function shortReset(l: Limit, now: number): string {
  const t = resetText(l, now)
  return t ? `↻ ${t.replace(/^resets (in )?/, '')}` : ''
}

// ── animation ────────────────────────────────────────────────────────────────
// Each window's bar glides from the value it showed to the new one, eased.

type Glide = { from: number; to: number; at: number }
const glides = new Map<string, Glide>()
/** The last glide per window, kept so the SVG markup only changes when a value does. */
const svgGlide = new Map<string, { from: number; to: number }>()
let frames: Timer | undefined
let framesUntil = 0

const ease = (t: number) => 1 - Math.pow(1 - t, 3) // ease-out cubic

function shownLeft(kind: string, target: number, now: number): number {
  const g = glides.get(kind)
  if (!g) return target
  const t = Math.min(1, Math.max(0, (now - g.at) / GLIDE_MS))
  if (t >= 1) {
    glides.delete(kind)
    return target
  }
  return g.from + (g.to - g.from) * ease(t)
}

function glideTo($: EngineInterface, kind: string, from: number, to: number, now: number): void {
  const last = svgGlide.get(kind)
  if (!last || Math.abs(last.to - to) >= 0.05) svgGlide.set(kind, { from: Math.round(from * 10) / 10, to })
  if (Math.abs(from - to) < 0.05) return
  glides.set(kind, { from, to, at: now })
  framesUntil = Math.max(framesUntil, now + GLIDE_MS + FRAME_MS)
  if (frames) return
  frames = $.clock.every(FRAME_MS, () => {
    $.ui.invalidate('ui.render')
    void $.clock.now().then(t => {
      if (t > framesUntil && frames) {
        frames.cancel()
        frames = undefined
        $.ui.invalidate('ui.render')
      }
    })
  })
}

/** Move to a new list of readings, gliding each bar from where it stands now. */
async function show($: EngineInterface, next: Limit[], fromEmpty = false): Promise<void> {
  const now = await $.clock.now()
  const before = (await read($, limitsA)).map(l => fresh(l, now))
  await update($, limitsA, () => next)
  for (const l of next) {
    const to = leftOf(fresh(l, now))
    const old = before.find(b => b.kind === l.kind)
    const from = fromEmpty ? 0 : old ? shownLeft(l.kind, leftOf(old), now) : 0
    glideTo($, l.kind, from, to, now)
  }
}

/** Readings shared between sessions, so a new session shows numbers at once. */
async function shared($: EngineInterface): Promise<Limit[]> {
  const v = await $.store.get('latest').catch(() => undefined)
  return Array.isArray(v) ? keep(v) : []
}

/** The window's reading, or nothing yet. */
async function reading($: EngineInterface, kind: string) {
  const now = await $.clock.now()
  const l = (await read($, limitsA)).map(x => fresh(x, now)).find(x => x.kind === kind)
  return l ? { l, now } : undefined
}

/**
 * One slim line on the desktop: label · gradient bar · % left · reset.
 * No card and no background of its own, so it sits as lightly as the
 * model / effort / mode pills.
 */
function slimRow($: EngineInterface, e: any, w: (typeof WINDOWS)[number], l: Limit, now: number, barWidth = 150, barHeight = 7) {
  const { Box, Text, Svg } = $.ui.resolve(e) as any
  const left = leftOf(l)
  const live = shownLeft(w.kind, left, now)
  const g = svgGlide.get(w.kind)
  return (
    <Box key={`usage-${w.kind}`} flexDirection="row" alignItems="center" gap="sm">
      <Box key="t" flexShrink={0}>
        <Text size="caption" weight="medium" color="#a9a9b3" wrap="truncate-end">
          {w.short}
        </Text>
      </Box>
      <Box key="bar" flexShrink={0}>
        <Svg
          source={gradientBarSvg(g?.from ?? left, g?.to ?? left, GLIDE_MS, barWidth / barHeight)}
          alt={`${w.title}: ${Math.round(left)}% left`}
          width={barWidth}
          height={barHeight}
          isInteractive
        />
      </Box>
      <Box key="p" flexShrink={0}>
        <Text size="caption" weight="semibold" tabular color={tone(left)} wrap="truncate-end">
          {`${Math.round(live)}% left`}
        </Text>
      </Box>
      <Box key="r" flexShrink={0}>
        <Text size="caption" dimColor tabular wrap="truncate-end">
          {shortReset(l, now)}
        </Text>
      </Box>
    </Box>
  )
}



/** Where the weekly bar's colours stand in their slow flow (0..1). */
let flowPhase = 0
let flowTimer: Timer | undefined

/**
 * The weekly limit as one line of text, for the desktop's line under the
 * prompt, which draws text only (no SVG): label, a bar of heavy-line cells
 * coloured along the same gradient, % left and the reset. Everything sits in
 * one Text so the cells touch with no gaps between them.
 */
function weeklyLine($: EngineInterface, e: any, l: Limit, now: number) {
  const { Text } = $.ui.resolve(e) as any
  const w = WINDOWS[1]
  const left = leftOf(l)
  const live = shownLeft(w.kind, left, now)
  const filled = Math.round((live / 100) * TEXT_CELLS)
  const cells = Array.from({ length: TEXT_CELLS }, (_, i) =>
    i < filled ? (
      <Text key={`c${i}`} color={gradientAt((i / TEXT_CELLS) * 0.85 - flowPhase)}>
        {'▬'}
      </Text>
    ) : (
      <Text key={`c${i}`} color="#ffffff2e">
        {'▬'}
      </Text>
    ),
  )
  const reset = resetText(l, now)
  return (
    <Text key="usage-weekly">
      <Text key="t" color="#a9a9b3">{`Weekly${GAP}`}</Text>
      {cells}
      <Text key="p" bold color={tone(left)}>{`${GAP}${Math.round(live)}% left`}</Text>
      {reset ? <Text key="r" color="#8e8e96">{`${WIDE_GAP}${reset}`}</Text> : null}
    </Text>
  )
}

let ticker: Timer | undefined

// ── account-wide usage ───────────────────────────────────────────────────────
// The rate-limit figures on Claude Code's own replies only move when Code is
// used. The account's usage (what claude.ai's Settings → Usage shows) also
// counts Chat, so the mod asks for it once a minute with the session's own
// login: `$.session.authorize()` hands back an opaque handle and the engine
// adds the credential itself, so the mod never sees it.

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const POLL_MS = 60_000
let poller: Timer | undefined

/** `{ five_hour: { utilization, resets_at }, seven_day: {...} }` → Limit[]. */
function fromAccount(body: unknown): Limit[] {
  const out: Limit[] = []
  for (const w of WINDOWS) {
    const v = (body as Record<string, any> | null)?.[w.kind]
    if (!v || typeof v.utilization !== 'number') continue
    out.push({ kind: w.kind, percentUsed: v.utilization, resetsAt: typeof v.resets_at === 'string' ? v.resets_at : undefined })
  }
  return out
}

/** Asks for the account's usage; shows and shares it when it changed. */
async function pollAccount($: EngineInterface): Promise<void> {
  const auth = await $.session.authorize().catch(() => null)
  if (!auth || auth.kind !== 'bearer') {
    diag.account = auth ? 'not available with an API key' : 'no Claude login in this session'
    return
  }
  const res = await $.http
    .fetch(USAGE_URL, { auth: auth.handle, headers: { 'anthropic-beta': 'oauth-2025-04-20' } })
    .catch((err: unknown) => ({ ok: false, status: 0, text: String(err) }))
  const now = new Date(await $.clock.now()).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (!res.ok) {
    diag.account = `failed at ${now} (HTTP ${res.status})`
    return
  }
  let list: Limit[] = []
  try {
    list = fromAccount(JSON.parse(res.text))
  } catch {
    // an answer we can't read leaves the last reading in place
  }
  if (!list.length) {
    diag.account = `answered at ${now} but with no 5-hour or weekly figures`
    return
  }
  diag.account = `ok at ${now}`
  const cur = await read($, limitsA)
  const same = (a: Limit[], b: Limit[]) =>
    a.length === b.length && a.every(x => b.some(y => y.kind === x.kind && Math.round(y.percentUsed) === Math.round(x.percentUsed) && y.resetsAt === x.resetsAt))
  if (same(list, cur)) return
  await show($, list)
  // Writing only on a change keeps the menu bar's file watcher quiet while idle.
  await $.store.set('latest', list).catch(() => undefined)
}

/** What /usage-card-status reports, to tell "not loaded" from "no data" from "wrong surface". */
const diag = {
  surface: '(not drawn yet)',
  isHosted: undefined as boolean | undefined,
  startKinds: [] as string[],
  measures: 0,
  measureKinds: [] as string[],
  account: 'not asked yet',
}
const kinds = (list: readonly unknown[] | undefined) =>
  (list ?? []).map(l => String((l as Limit)?.kind ?? '?'))

/** A muted placeholder while no reading has arrived, so the band shows the mod is alive. */
function waitingRow($: EngineInterface, e: any) {
  const { Box, Text } = $.ui.resolve(e)
  return (
    <Box key="usage-waiting" flexDirection="row" justifyContent="center" width="100%">
      <Text key="w" size="caption" dimColor wrap="truncate-end">
        {'Usage limits: waiting for the first reading'}
      </Text>
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'usage-card-status',
      description: 'Show what the usage-card mod sees (surface, rate-limit data)',
    })
    const info = await $.session.info().catch(() => undefined)
    diag.isHosted = info?.isHosted
    const usage = await $.session.usage().catch(() => undefined)
    diag.startKinds = kinds(usage?.rateLimits)
    const mine = keep(usage?.rateLimits)
    const start = mine.length ? mine : await shared($)
    // Fill the bars in from empty when the session opens.
    await show($, start, true)

    // Keep the countdown current and pick up readings other sessions heard.
    // (No colour-drift timer: both bars are SVGs that animate on their own.)
    flowTimer?.cancel()
    flowTimer = undefined

    // Account-wide usage (Chat included): once now, then every minute.
    poller?.cancel()
    void pollAccount($)
    poller = $.clock.every(POLL_MS, () => void pollAccount($))

    ticker?.cancel()
    ticker = $.clock.every(30_000, () => {
      void (async () => {
        const others = await shared($)
        const cur = await read($, limitsA)
        if (others.length && JSON.stringify(others) !== JSON.stringify(cur)) await show($, others)
        else $.ui.invalidate('ui.render')
      })()
    })
    return next(e)
  })

  on('command.run', { command: 'usage-card-status' }, async $ => {
    const shown = await read($, limitsA)
    const stored = await shared($)
    return {
      text: [
        'usage-card is loaded.',
        `surface: ${diag.surface}`,
        `hosted: ${diag.isHosted ?? 'unknown'}`,
        `rate limits at start: ${diag.startKinds.join(', ') || 'none'}`,
        `measure events: ${diag.measures} (rate-limit kinds: ${diag.measureKinds.join(', ') || 'none'})`,
        `shown now: ${shown.map(l => `${l.kind} ${Math.round(leftOf(l))}% left`).join(', ') || 'none'}`,
        `shared store: ${stored.length ? stored.map(l => l.kind).join(', ') : 'empty'}`,
        `account usage (includes Chat): ${diag.account}`,
      ].join('\n'),
    }
  })

  on('session.measure', async ($, e, next) => {
    diag.measures++
    if (e.changed.includes('rateLimits')) {
      diag.measureKinds = kinds(e.rateLimits)
      const list = keep(e.rateLimits)
      if (list.length) {
        await show($, list)
        await $.store.set('latest', list).catch(() => undefined)
      }
    }
    return next(e)
  })

  // ABOVE the chat box: the 5-hour limit (desktop), or both lines (terminal).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    diag.surface = String(e.surface)

    if (e.surface === 'desktop') {
      // One line: 5-hour, a divider, then weekly with a shorter bar.
      const five = await reading($, 'five_hour')
      const week = await reading($, 'seven_day')
      if (!five && !week) return waitingRow($, e)
      const { Box, Text } = $.ui.resolve(e)
      // Both bars the same size: 140 x 10 px. The line spreads across the strip
      // with equal space at both ends and between every part.
      const bar = 140
      const barH = 10
      return (
        <Box key="usage-line" flexDirection="row" alignItems="center" justifyContent="space-evenly" width="100%">
          {five ? slimRow($, e, WINDOWS[0], five.l, five.now, bar, barH) : null}
          {five && week ? (
            <Text key="sep" size="caption" color="#ffffff33">
              {'│'}
            </Text>
          ) : null}
          {week ? slimRow($, e, WINDOWS[1], week.l, week.now, bar, barH) : null}
        </Box>
      )
    }

    // Terminal: both windows, one line each, no frame.
    const now = await $.clock.now()
    const list = (await read($, limitsA)).map(l => fresh(l, now))
    const rows = WINDOWS.map(w => ({ w, l: list.find(l => l.kind === w.kind) })).filter(x => x.l) as {
      w: (typeof WINDOWS)[number]
      l: Limit
    }[]
    if (rows.length === 0) return waitingRow($, e)
    const { Box, Text } = $.ui.resolve(e)
    const cols = Math.max(30, (e.props.bodyColumns ?? 80) - 4)
    const barW = Math.max(10, Math.min(30, cols - 42))
    return (
      <Box key="usage-card" flexDirection="column">
        {rows.map(({ w, l }) => {
          const left = leftOf(l)
          const live = shownLeft(w.kind, left, now)
          const filled = Math.round((live / 100) * barW)
          const c = tone(left)
          return (
            <Box key={w.kind} flexDirection="row">
              <Text key="t" dimColor>{`${w.title.padEnd(13)}`}</Text>
              <Text key="f" color={c}>{'━'.repeat(filled)}</Text>
              <Text key="e" dimColor>{'━'.repeat(barW - filled)}</Text>
              <Text key="p" color={c} bold>{`  ${String(Math.round(live)).padStart(3)}% left`}</Text>
              <Text key="r" dimColor wrap="truncate-end">{`  ${resetText(l, now)}`}</Text>
            </Box>
          )
        })}
      </Box>
    )
  })

}
