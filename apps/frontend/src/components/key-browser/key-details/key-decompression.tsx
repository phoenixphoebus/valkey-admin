import { useState } from "react"
import { useSelector } from "react-redux"
import { TriangleAlert } from "lucide-react"
import { COMPRESSION_CODECS, COMPRESSION_CODEC_LABELS } from "@common/src/compression"
import { formatBytes } from "@common/src/bytes-conversion"
import { Button } from "../../ui/button"
import { Select } from "../../ui/select"
import { Typography } from "../../ui/typography"
import { Alert, AlertDescription } from "../../ui/alert"
import { useAppDispatch } from "@/hooks/hooks"
import {
  decompressCleared,
  rawValueRequested,
  type CodecChoice,
  type DecompressionResult
} from "@/state/valkey-features/keys/keyDecompressionSlice"
import { selectKeyDecompression } from "@/state/valkey-features/keys/keyDecompressionSelectors"
import { cn } from "@/lib/utils"

interface KeyDecompressionProps {
  connectionId: string;
  keyName: string;
  // "Load and decompress" for values over the display limit, whose bytes haven't been loaded yet.
  actionLabel?: string;
}

function DecompressedValue({ result, onContinue }: { result: DecompressionResult; onContinue: () => void }) {
  const label = COMPRESSION_CODEC_LABELS[result.codec]
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <Typography variant="label">Decompressed ({label}): read-only view</Typography>
        <Typography className="text-muted-foreground" variant="bodyXs">
          {formatBytes(result.inputBytes)} stored, {formatBytes(result.outputBytes)} decoded
          {result.view === "hex" && " · not readable text, shown as hex"}
        </Typography>
      </div>

      {result.truncated && (
        <Alert variant="warning">
          <TriangleAlert className="w-4 h-4" />
          <AlertDescription>
            <span>
              Output truncated at {formatBytes(result.outputLimit)}
              {result.declaredSize !== undefined && ` of ${formatBytes(result.declaredSize)}`}.
              {result.view !== "hex" && " Truncated output is shown as plain text."}
            </span>
            <Button className="mt-1 w-fit" onClick={onContinue} size="sm" variant="outline">
              Continue to {formatBytes(result.outputLimit + result.maxOutputBytes)}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {result.previewTruncated && (
        <Typography className="text-muted-foreground" variant="bodyXs">
          Showing the first {formatBytes(result.previewBytes)} of {formatBytes(result.outputBytes)}.
        </Typography>
      )}

      <Typography
        as="pre"
        className={cn(
          "max-h-[60vh] overflow-auto rounded-md bg-muted/40 p-3",
          result.view === "hex" ? "whitespace-pre" : "whitespace-pre-wrap wrap-anywhere",
        )}
        data-testid="decompressed-value"
        variant="code"
      >
        {result.preview}
      </Typography>
    </div>
  )
}

/**
 * Opt-in, read-only decompression of a string value. Nothing is fetched or decoded until the user asks.
 */
export default function KeyDecompression({ connectionId, keyName, actionLabel = "Decompress" }: KeyDecompressionProps) {
  const dispatch = useAppDispatch()
  const entry = useSelector(selectKeyDecompression(connectionId, keyName))
  const [codecChoice, setCodecChoice] = useState<CodecChoice>("auto")
  const busy = entry?.status === "loading" || entry?.status === "decoding"
  const target = { connectionId, key: keyName }
  const clear = () => dispatch(decompressCleared(target))

  return (
    <div className="flex flex-col gap-3 px-4 pb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Select
          aria-label="Compression format"
          className="h-8 py-1"
          disabled={busy}
          onChange={(e) => setCodecChoice(e.target.value as CodecChoice)}
          value={codecChoice}
        >
          <option value="auto">Detect format</option>
          {COMPRESSION_CODECS.map((codec) => (
            <option key={codec} value={codec}>{COMPRESSION_CODEC_LABELS[codec]}</option>
          ))}
        </Select>
        {busy ? (
          <>
            <Typography role="status" variant="bodySm">
              {entry.status === "loading" ? "Loading value…" : "Decompressing…"}
            </Typography>
            <Button onClick={clear} size="sm" variant="outline">Cancel</Button>
          </>
        ) : (
          <Button onClick={() => dispatch(rawValueRequested({ ...target, codecChoice }))} size="sm" variant="outline">
            {actionLabel}
          </Button>
        )}
        {entry?.status === "decoded" && (
          <Button onClick={clear} size="sm" variant="ghost">Hide decompressed value</Button>
        )}
      </div>

      {entry?.status === "failed" && (
        <Alert variant="destructive">
          <TriangleAlert className="w-4 h-4" />
          <AlertDescription>{entry.error}</AlertDescription>
        </Alert>
      )}

      {entry?.status === "decoded" && entry.result && (
        <DecompressedValue
          onContinue={() => {
            const { codec, outputLimit, maxOutputBytes } = entry.result!
            dispatch(rawValueRequested({ ...target, codecChoice: codec, outputLimit: outputLimit + maxOutputBytes }))
          }}
          result={entry.result}
        />
      )}
    </div>
  )
}
