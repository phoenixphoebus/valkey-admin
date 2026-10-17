import { Badge } from "../../ui/badge"

/**
 * Marks a key part whose bytes aren't valid UTF-8; the server sends it escaped (\xNN). The per-key
 * BinaryNotice explains what that means, so the badge itself carries no tooltip.
 */
export function BinaryBadge() {
  return (
    <Badge className="shrink-0 self-start text-[10px] px-2 py-0" variant="secondary">
      binary
    </Badge>
  )
}
