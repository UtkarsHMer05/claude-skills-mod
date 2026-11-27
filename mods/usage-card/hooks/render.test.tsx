import { expect, mock, test } from 'claude-code/testing'

type Lim = { kind: string; percentUsed: number; resetsAt?: string }

function engine(on: any, usage: Lim[] = []) {
  return engine0(on, usage)
}
function engine0(on: any, usage: Lim[]) {
  const clock = mock.clock(on)
  mock.store(on)
  on('ui.render', ($: any, e: any) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('session.measure', (_$: any, e: any) => ({ changed: e.changed }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: usage } }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }))
  on('session.info', () => ({ value: { isHosted: false } }))
  return clock
}

/** Mounts the band above the prompt and the line below it, read top to bottom. */
const mount = async ($: any, surface: 'terminal' | 'desktop') => {
  const viewport = { columns: 120, rows: 40 }
  const parts = [
    await $.ui.mount({
      plugin: 'usage-card', component: 'AbovePrompt', surface, viewport,
      props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 115 },
    }),
    await $.ui.mount({
      plugin: 'usage-card', component: 'PromptHint', surface, viewport,
      props: { isDraft: false, isWorking: false, hint: '' },
    }),
  ]
  return {
    findAll: async (q: any) => (await Promise.all(parts.map(p => p.findAll(q)))).flat(),
    band: parts[0],
    hint: parts[1],
  }
}
const texts = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join('|')

for (const surface of ['terminal', 'desktop'] as const) {
  test(`nothing before any data (${surface})`, async ($, on) => {
    engine(on)
    await $.session.start({ cwd: '/', surface, isInteractive: true } as never)
    const ui = await mount($, surface)
    expect(await texts(ui)).not.toContain('%')
  })

  test(`5-hour above weekly, % left, reset, glide (${surface})`, async ($, on) => {
    const clock = engine(on)
    await $.session.start({ cwd: '/', surface, isInteractive: true } as never)
    await $.session.measure({
      context: {},
      rateLimits: [
        { kind: 'seven_day', percentUsed: 92 },
        { kind: 'five_hour', percentUsed: 44, resetsAt: new Date((2 * 60 + 2) * 60_000).toISOString() },
      ],
      changed: ['rateLimits'],
    } as never)
    // Mid-glide the bar is on its way up from empty.
    await clock.advance(150)
    let t = await texts(await mount($, surface))
    expect(t).not.toMatch(/56% left\|\s*(resets|↻)/) // visible figure still climbing
    // Once the glide is done the bars rest at what is left.
    await clock.advance(1000)
    t = await texts(await mount($, surface))
    expect(t).toMatch(/56% left\|\s*(resets|↻)/)
    expect(t).toContain('8% left')
    expect(t).toContain('2h 02m')
    expect(t.indexOf('56% left')).toBeLessThan(t.indexOf('8% left'))
    if (surface === 'desktop') {
      const ui = await mount($, surface)
      // 5-hour above the chat box, weekly on the line below it.
      // Both on one line above the chat box; nothing below it.
      expect((await ui.band.findAll({ type: 'Svg' })).length).toBe(2)
      expect(JSON.stringify((await ui.band.findAll({ type: 'Text' })).map((x: any) => x.text))).toContain('5h')
      expect(JSON.stringify((await ui.band.findAll({ type: 'Text' })).map((x: any) => x.text))).toContain('Weekly')
      expect(JSON.stringify((await ui.hint.findAll({ type: 'Text' })).map((x: any) => x.text))).not.toContain('Weekly')
      const svgs = await ui.findAll({ type: 'Svg' })
      expect(svgs[0].props.source).toContain('stop-color')
      expect(svgs[0].props.source).not.toContain('<script')
      expect(svgs[0].props.source.length).toBeLessThan(131072)
    }
  })
}

test('account usage (Chat included) fills the bars without a Code reply', async ($, on) => {
  const clock = engine(on)
  const asked: string[] = []
  on('session.authorize', () => ({ value: { handle: 'h1', kind: 'bearer' } }))
  on('http.fetch', (_$: any, e: any) => {
    asked.push(`${e.url} auth=${e.init?.auth}`)
    return {
      value: {
        status: 200, ok: true, headers: {},
        text: JSON.stringify({
          five_hour: { utilization: 35, resets_at: new Date(90 * 60_000).toISOString() },
          seven_day: { utilization: 60, resets_at: null },
        }),
      },
    }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true } as never)
  await new Promise(r => setTimeout(r, 20))
  await clock.advance(1000)
  const ui = await mount($, 'desktop')
  const t = await texts(ui)
  expect(asked[0]).toBe('https://api.anthropic.com/api/oauth/usage auth=h1')
  expect(t).toContain('65% left')
  expect(t).toContain('40% left')
})
