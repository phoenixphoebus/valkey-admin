export type DecompressedView = "json" | "text" | "hex"

export type DecompressedPreview = {
  view: DecompressedView;
  preview: string;
  // The preview shows only part of the decoded output: its first `previewBytes` bytes.
  previewTruncated: boolean;
  previewBytes: number;
}

// A hex dump line shows 16 bytes in about 80 characters.
const HEX_CHARS_PER_BYTE = 5
const HEX_BYTES_PER_LINE = 16
// C0 controls other than tab, line feed, form feed and carriage return, plus DEL. NUL bytes are valid UTF-8 but render
// as nothing, so text containing these is shown as hex.
// eslint-disable-next-line no-control-regex
const NON_TEXT_CONTROL = /[\x00-\x08\x0b\x0e-\x1f\x7f]/

/**
 * Readable UTF-8 text, or undefined for invalid UTF-8 or control characters.
 * `allowCutOffEnd` accepts a multi-byte character cut off by truncation.
 */
function decodeText(bytes: Uint8Array, allowCutOffEnd: boolean): string | undefined {
  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes, { stream: allowCutOffEnd })
    return NON_TEXT_CONTROL.test(text) ? undefined : text
  } catch {
    return undefined
  }
}

function prettyJson(text: string): string | undefined {
  const trimmed = text.trimStart()
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return undefined
  }
}

function hexDump(bytes: Uint8Array): string {
  const lines: string[] = []
  for (let offset = 0; offset < bytes.length; offset += HEX_BYTES_PER_LINE) {
    const line = bytes.subarray(offset, offset + HEX_BYTES_PER_LINE)
    const hex = Array.from(line, (byte) => byte.toString(16).padStart(2, "0")).join(" ")
    const ascii = Array.from(line, (byte) => (byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : ".")).join("")
    lines.push(`${offset.toString(16).padStart(8, "0")}  ${hex.padEnd(HEX_BYTES_PER_LINE * 3 - 1)}  |${ascii}|`)
  }
  return lines.join("\n")
}

/**
 * Picks how decoded bytes are shown: pretty JSON, UTF-8 text, or a hex dump (also used for control characters), limited to `previewMaxBytes`.
 * JSON is only parsed when the whole output is present and fits in the preview, since truncated JSON
 * won't parse; anything else that is UTF-8 falls back to text.
 */
export function renderDecompressed(
  output: Uint8Array,
  { truncated, previewMaxBytes }: { truncated: boolean; previewMaxBytes: number },
): DecompressedPreview {
  const text = decodeText(output, truncated)
  if (text === undefined) {
    const shownBytes = Math.floor(previewMaxBytes / HEX_CHARS_PER_BYTE)
    const shown = output.subarray(0, shownBytes)
    return { view: "hex", preview: hexDump(shown), previewTruncated: output.length > shown.length, previewBytes: shown.length }
  }
  const json = !truncated && output.length <= previewMaxBytes ? prettyJson(text) : undefined
  if (json !== undefined) return { view: "json", preview: json, previewTruncated: false, previewBytes: output.length }
  if (text.length <= previewMaxBytes) return { view: "text", preview: text, previewTruncated: false, previewBytes: output.length }
  // The limit is applied to characters; previewBytes reports the UTF-8 size actually shown.
  const preview = text.slice(0, previewMaxBytes)
  return { view: "text", preview, previewTruncated: true, previewBytes: new TextEncoder().encode(preview).length }
}
