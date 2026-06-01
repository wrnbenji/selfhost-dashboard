import { isValidHttpUrl } from './validate.js'

export type WidgetType = 'embed' | 'note'

export interface EmbedConfig {
  url: string
  height: number
}
export interface NoteConfig {
  text: string
}
export type WidgetConfig = EmbedConfig | NoteConfig

export interface Widget {
  id: string
  type: WidgetType
  title: string
  config: WidgetConfig
  sort_order: number
}

const MIN_HEIGHT = 120
const MAX_HEIGHT = 1200
const DEFAULT_HEIGHT = 320

export function validateWidget(
  input: Record<string, unknown>,
):
  | { ok: true; type: WidgetType; title: string; config: WidgetConfig }
  | { ok: false; error: string } {
  const type = input.type
  if (type !== 'embed' && type !== 'note') {
    return { ok: false, error: 'type must be embed or note' }
  }
  const title = String(input.title ?? '').trim()
  const cfg = (input.config ?? {}) as Record<string, unknown>

  if (type === 'embed') {
    const url = String(cfg.url ?? '').trim()
    if (!isValidHttpUrl(url)) {
      return { ok: false, error: 'embed requires a valid http(s) url' }
    }
    let height = Number(cfg.height ?? DEFAULT_HEIGHT)
    if (!Number.isFinite(height)) height = DEFAULT_HEIGHT
    height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(height)))
    return { ok: true, type, title, config: { url, height } }
  }

  const text = String(cfg.text ?? '').trim()
  if (!text) return { ok: false, error: 'note requires text' }
  return { ok: true, type, title, config: { text } }
}
