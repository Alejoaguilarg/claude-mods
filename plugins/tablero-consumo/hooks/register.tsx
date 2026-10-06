// Tablero de consumo: /consumo abre o cierra un panel con cinco datos en vivo.
//   1. Tokens del último pedido y total de la sesión
//   2. Uso del plan (cada ventana, cuándo se reinicia, equivalente en API)
//   3. Contexto lleno
//   4. Herramientas usadas
//   5. Tiempo de sesión
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Stats } from '../types'

const PANE = 'consumo'
const EMPTY: Stats = { sessionTokens: 0, requests: 0, toolCalls: 0, last: null }
const stats = atom({ plugin: 'tablero-consumo', key: 'stats' } as const, EMPTY)

export const formatTokens = (n: number | undefined): string => {
  if (n === undefined || !Number.isFinite(n)) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(Math.round(n))
}

export const formatDuration = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (v: number) => String(v).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export const formatReset = (resetsAt: string | undefined, now: number): string => {
  if (!resetsAt) return ''
  const target = Date.parse(resetsAt)
  if (!Number.isFinite(target)) return ''
  const minutes = Math.ceil((target - now) / 60_000)
  if (minutes <= 0) return 'se reinicia ya'
  if (minutes < 60) return `se reinicia en ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `se reinicia en ${hours} h ${minutes % 60} min`
  return `se reinicia en ${Math.floor(hours / 24)} d ${hours % 24} h`
}

const limitLabel = (kind: string): string => {
  if (kind === 'five_hour') return 'Ventana de 5 horas'
  if (kind === 'seven_day') return 'Semanal'
  if (kind === 'spend_limit') return 'Límite de gasto'
  return kind
}

const bar = (percent: number, width: number): string => {
  const p = Math.min(100, Math.max(0, percent))
  const filled = Math.round((p / 100) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

const colorFor = (percent: number) => (percent >= 90 ? 'red' : percent >= 70 ? 'yellow' : 'green')

const isOpen = async ($: EngineInterface) => (await $.ui.panes()).some(pane => pane.id === PANE)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'consumo',
      description: 'Abre o cierra el tablero de consumo de la sesión',
      immediate: true,
    })
    // El reloj de la sesión avanza aunque no cambie nada más
    $.clock.every(1000, () => $.ui.invalidate('ui.render'))
    return next(e)
  })

  on('command.run', { command: 'consumo' }, async $ => {
    if (await isOpen($)) {
      await $.ui.close({ id: PANE })
      return {}
    }
    const placed = await $.ui.open({ id: PANE, title: 'Consumo', closeOnEscape: true, columns: 44 })
    if (!placed.isPlaced) $.ui.toast('El tablero espera una terminal más ancha')
    return {}
  })

  on('tool.call', async ($, e, next) => {
    await update($, stats, s => ({ ...s, toolCalls: s.toolCalls + 1 }))
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const usage = result.usage
    if (usage) {
      const input = usage.input_tokens ?? 0
      const output = usage.output_tokens ?? 0
      const cacheRead = usage.cache_read_input_tokens ?? 0
      const cacheWrite = usage.cache_creation_input_tokens ?? 0
      await update($, stats, s => ({
        sessionTokens: s.sessionTokens + input + output + cacheRead + cacheWrite,
        requests: s.requests + 1,
        toolCalls: s.toolCalls,
        // El último pedido es el de la conversación principal, no el de un subagente
        last: e.agentId ? s.last : { input, output, cacheRead, cacheWrite, model: usage.model },
      }))
    }
    return result
  })

  on('session.measure', async ($, e, next) => {
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await update($, stats, () => EMPTY)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const s = await read($, stats)
    const usage = await $.session.usage()
    const now = await $.clock.now()
    const columns = Math.max(24, e.props.bodyColumns || 40)
    const width = Math.max(10, Math.min(24, columns - 16))

    const meter = (percent: number) => (
      <Box flexDirection="row" columnGap={1}>
        <Text color={colorFor(percent)}>{bar(percent, width)}</Text>
        <Text>{`${Math.round(percent)}%`}</Text>
      </Box>
    )
    const last = s.last
    const usd = usage.cost?.usd
    const context = usage.context

    return (
      <Box flexDirection="column">
        <Text bold>1. Tokens</Text>
        {last ? (
          <Box flexDirection="column">
            <Text>{`Último pedido   ${formatTokens(last.input + last.output + last.cacheRead + last.cacheWrite)}`}</Text>
            <Text dimColor>{`entrada ${formatTokens(last.input)}  salida ${formatTokens(last.output)}`}</Text>
            <Text dimColor>{`caché leída ${formatTokens(last.cacheRead)}  escrita ${formatTokens(last.cacheWrite)}`}</Text>
          </Box>
        ) : (
          <Text dimColor>Todavía no hay pedidos</Text>
        )}
        <Text>{`Sesión          ${formatTokens(s.sessionTokens)} en ${s.requests} pedidos`}</Text>
        <Text> </Text>

        <Text bold>2. Uso del plan</Text>
        {usage.rateLimits.length === 0 && <Text dimColor>Sin datos del plan en esta sesión</Text>}
        {usage.rateLimits.map(limit => (
          <Box flexDirection="column">
            <Text>{limitLabel(limit.kind)}</Text>
            {meter(limit.percentUsed)}
            {limit.resetsAt && <Text dimColor>{formatReset(limit.resetsAt, now)}</Text>}
          </Box>
        ))}
        {usd !== undefined && usd > 0 && <Text dimColor>{`Equivalente en API  US$ ${usd.toFixed(2)}`}</Text>}
        <Text> </Text>

        <Text bold>3. Contexto lleno</Text>
        {context.percent !== undefined ? (
          <Box flexDirection="column">
            {meter(context.percent)}
            <Text dimColor>{`${formatTokens(context.tokens)} de ${formatTokens(context.window)} tokens`}</Text>
          </Box>
        ) : (
          <Text dimColor>Sin datos de contexto todavía</Text>
        )}
        <Text> </Text>

        <Text bold>4. Herramientas usadas</Text>
        <Text>{`${s.toolCalls} llamadas`}</Text>
        <Text> </Text>

        <Text bold>5. Tiempo de sesión</Text>
        <Text>{formatDuration(now - usage.startedAt)}</Text>
      </Box>
    )
  })
}
