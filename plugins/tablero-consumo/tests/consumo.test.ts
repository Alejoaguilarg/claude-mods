import { describe, expect, mock, test } from 'claude-code/testing'

import { formatDuration, formatReset, formatTokens } from '../hooks/register'

describe('formato', () => {
  test('tokens en k y M', async () => {
    expect(formatTokens(950)).toBe('950')
    expect(formatTokens(12_345)).toBe('12.3k')
    expect(formatTokens(2_500_000)).toBe('2.5M')
    expect(formatTokens(undefined)).toBe('0')
  })

  test('duración de la sesión', async () => {
    expect(formatDuration(65_000)).toBe('01:05')
    expect(formatDuration(3_725_000)).toBe('1:02:05')
  })

  test('cuándo se reinicia un límite', async () => {
    const now = Date.parse('2026-10-06T10:00:00Z')
    expect(formatReset('2026-10-06T10:30:00Z', now)).toBe('se reinicia en 30 min')
    expect(formatReset('2026-10-06T12:15:00Z', now)).toBe('se reinicia en 2 h 15 min')
    expect(formatReset('2026-10-08T13:00:00Z', now)).toBe('se reinicia en 2 d 3 h')
    expect(formatReset('2026-10-06T09:00:00Z', now)).toBe('se reinicia ya')
  })
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`cuenta cada herramienta que se usa (${surface})`, async ($, on) => {
    const clock = mock.clock(on)
    const startedAt = clock.now() - 65_000
    on('tool.call', async () => ({ result: 'ok', text: 'ok' }))
    on('session.usage', async () => ({
      value: { startedAt, context: { window: 200_000 }, rateLimits: [] },
    }))
    await $.tool.call({ tool: 'Read', file_path: '/x' })
    await $.tool.call({ tool: 'Read', file_path: '/y' })
    const ui = await $.ui.mount({
      plugin: 'tablero-consumo',
      surface,
      component: 'Pane',
      requestId: 'consumo',
      props: { title: 'Consumo', isFocused: true, bodyColumns: 44, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
    })
    expect(await ui.find({ type: 'Text', text: '2 llamadas' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Todavía no hay pedidos' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '01:05' })).toBeDefined()
    await ui.unmount()
  })
}
