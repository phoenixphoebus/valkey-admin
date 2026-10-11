import { useEffect, useState } from "react"
import { ChartModal } from "../ui/chart-modal"
import { Button } from "../ui/button"
import { NumberInput } from "../ui/number-input"
import { Typography } from "../ui/typography"
import { TooltipIcon } from "../ui/tooltip-icon"

export interface ScanAllParams {
  maxKeys: number
  delayMs: number
}

interface ScanAllModalProps {
  open: boolean
  onClose: () => void
  params: ScanAllParams
  pattern?: string
  onScan: (params: ScanAllParams) => void
}

export function ScanAllModal({ open, onClose, params, pattern, onScan }: ScanAllModalProps) {
  const [draftMaxKeys, setDraftMaxKeys] = useState(params.maxKeys)
  const [draftDelayMs, setDraftDelayMs] = useState(params.delayMs)

  useEffect(() => {
    setDraftMaxKeys(params.maxKeys)
    setDraftDelayMs(params.delayMs)
  }, [params, open])

  const handleScan = () => {
    onScan({ maxKeys: draftMaxKeys, delayMs: draftDelayMs })
    onClose()
  }

  return (
    <ChartModal
      onClose={onClose}
      open={open}
      subtitle={`Keep loading batches${pattern && pattern !== "*" ? ` matching "${pattern}"` : ""} until the scan finishes`
        + " or the key limit is reached. Each batch runs SCAN on every primary, so large scans add load to the server."}
      title="Scan All Keys"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Typography variant="bodySm">Max Keys</Typography>
            <TooltipIcon
              description={"Stop once this many keys are loaded. The last batch can go over by up to about 1,000 keys."
                + " Higher values use more browser memory."}
              size={16}
            />
          </div>
          <NumberInput
            aria-label="Max Keys"
            min={1}
            onChange={setDraftMaxKeys}
            step={10000}
            style={{ width: "120px" }}
            value={draftMaxKeys}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Typography variant="bodySm">Delay Between Batches (ms)</Typography>
            <TooltipIcon
              description="Pause between batches to limit load on the server."
              size={16}
            />
          </div>
          <NumberInput
            aria-label="Delay Between Batches"
            min={0}
            onChange={setDraftDelayMs}
            step={100}
            style={{ width: "120px" }}
            value={draftDelayMs}
          />
        </div>

        <div className="flex justify-end mt-2 gap-2">
          <Button onClick={onClose} size="sm" type="button" variant="ghost">
            Cancel
          </Button>
          <Button onClick={handleScan} size="sm" type="button" variant="default">
            Scan All
          </Button>
        </div>
      </div>
    </ChartModal>
  )
}
