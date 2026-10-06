export type LastRequest = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  model: string
}

export type Stats = {
  sessionTokens: number
  requests: number
  toolCalls: number
  last: LastRequest | null
}

declare module 'claude-code' {
  interface PluginState {
    'tablero-consumo': { stats: Stats }
  }
}
