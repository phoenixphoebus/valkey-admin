import { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import * as R from "ramda"
import { useParams } from "react-router"
import { TooltipProvider } from "@radix-ui/react-tooltip"
import { formatBytes } from "@common/src/bytes-conversion"
import { calculateTotalMemoryUsage } from "@common/src/memory-usage-calculation"
import {
  KeyRound,
  RefreshCw,
  ListFilter,
  ChartPie,
  Square
} from "lucide-react"
import { truncateText } from "@common/src/truncate-text"
import { toScanPattern } from "@common/src/scan-pattern"
import { AppHeader } from "../ui/app-header"
import { ChartModal } from "../ui/chart-modal"
import DonutChart from "../ui/donut-chart"
import AddNewKey from "./add-key"
import KeyDetails from "./key-details/key-details"
import { KeyTree } from "./key-tree"
import { ScanAllModal, type ScanAllParams } from "./scan-all-modal"
import { Button } from "../ui/button"
import { Select } from "../ui/select"
import { StatCard } from "../ui/stat-card"
import { SearchInput } from "../ui/search-input"
import RouteContainer from "../ui/route-container"
import { TooltipIcon } from "../ui/tooltip-icon"
import { Typography } from "../ui/typography"
import { SplitPanel } from "../ui/split-panel"
import { Panel } from "../ui/panel"
import { useAppDispatch } from "@/hooks/hooks"
import {
  selectKeys,
  selectLoading,
  selectError,
  selectTotalKeys,
  selectCursors,
  selectHasMoreKeys,
  selectPattern,
  selectLoadingMore,
  selectScanId,
  selectScanAllRunning
} from "@/state/valkey-features/keys/keyBrowserSelectors"
import {
  getKeysRequested,
  getKeyTypeRequested,
  scanAllRequested,
  scanAllStopped
} from "@/state/valkey-features/keys/keyBrowserSlice"
import { selectClusterAlias } from "@/state/valkey-features/connection/connectionSelectors"

interface KeyInfo {
  name: string;
  type: string;
  ttl: number;
  size: number;
  collectionSize?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  elements?: any;
}

/**
 * Key Browser page: lists keys from a bounded SCAN, with search, type filter, Load more and Scan all,
 * next to a details panel for the selected key.
 */
export function KeyBrowser() {
  const { id, clusterId } = useParams()
  const dispatch = useAppDispatch()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [isAddKeyOpen, setIsAddKeyOpen] = useState(false)
  const [isDistributionOpen, setIsDistributionOpen] = useState(false)
  const [searchPattern, setSearchPattern] = useState("")
  const [selectedType, setSelectedType] = useState<string>("all")
  const [isScanAllOpen, setIsScanAllOpen] = useState(false)
  const [scanAllParams, setScanAllParams] = useState<ScanAllParams>({ maxKeys: 50000, delayMs: 100 })
  const clusterAlias = useSelector(selectClusterAlias(id!))
  const keyTypes = [
    { value: "all", label: "All Key Types" },
    { value: "string", label: "String" },
    { value: "hash", label: "Hash" },
    { value: "list", label: "List" },
    { value: "set", label: "Set" },
    { value: "zset", label: "Zset" },
    { value: "stream", label: "Stream" },
    { value: "rejson-rl", label: "JSON" },
  ]

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (id) {
      dispatch(getKeysRequested({
        connectionId: id,
        pattern: toScanPattern(searchPattern),
      }))
    }
  }

  const handleClearSearch = () => {
    setSearchPattern("")
    if (id) {
      dispatch(getKeysRequested({
        connectionId: id,
        pattern: "*",
      }))
    }
  }

  const handleAddKeyModal = () => {
    setIsAddKeyOpen(!isAddKeyOpen)
  }

  const keys: KeyInfo[] = useSelector(selectKeys(id!))
  const loading = useSelector(selectLoading(id!))
  const error = useSelector(selectError(id!))
  const totalKeys = useSelector(selectTotalKeys(id!))
  const cursors = useSelector(selectCursors(id!))
  const hasMoreKeys = useSelector(selectHasMoreKeys(id!))
  const activePattern = useSelector(selectPattern(id!))
  const loadingMore = useSelector(selectLoadingMore(id!))
  const scanId = useSelector(selectScanId(id!))
  const scanAllRunning = useSelector(selectScanAllRunning(id!))
  const busy = loading
  const nodeCursors = Object.values(cursors)
  const nodesDone = nodeCursors.filter((cursor) => cursor === "0").length

  useEffect(() => {
    if (id) {
      dispatch(getKeysRequested({ connectionId: id! }))
    }
    // Leaving the page or switching connection cancels a running Scan all.
    return () => {
      if (id) dispatch(scanAllStopped({ connectionId: id, reason: "stopped" }))
    }
  }, [id, dispatch])

  /**
   * Starts a fresh scan from cursor 0, replacing the list and cancelling any Scan all.
   */
  const handleRefresh = () => {
    dispatch(getKeysRequested({ connectionId: id! }))
  }

  /**
   * Resumes the current scan (same pattern) from where the last batch stopped.
   */
  const handleLoadMore = () => {
    dispatch(getKeysRequested({ connectionId: id!, pattern: activePattern, cursors, scanId }))
  }

  /**
   * Remembers the chosen Scan all settings and starts loading batches until done or the limit.
   */
  const handleScanAll = (params: ScanAllParams) => {
    setScanAllParams(params)
    dispatch(scanAllRequested({ connectionId: id!, ...params }))
  }

  /**
   * Stops a running Scan all, keeping the keys loaded so far.
   */
  const handleStopScanAll = () => {
    dispatch(scanAllStopped({ connectionId: id!, reason: "stopped" }))
  }

  const handleKeyClick = (keyName: string) => {
    if (loading) return
    setSelectedKey(keyName)

    const keyInfo = keys.find((k) => k.name === keyName)
    if (R.isNotEmpty(keyInfo) && !keyInfo!.type) {
      dispatch(getKeyTypeRequested({ connectionId: id!, key: keyName }))
    }
  }

  // Get selected key info from the keys data
  const selectedKeyInfo = selectedKey
    ? keys.find((k) => k.name === selectedKey)
    : null

  // Calculate total memory usage
  const totalMemoryUsage = calculateTotalMemoryUsage(keys)

  const filteredKeys = selectedType === "all"
    ? keys
    : keys.filter((key) => key.type.toLowerCase() === selectedType.toLowerCase())

  return (
    <RouteContainer title="Key Browser">
      <AppHeader
        description={
          <>
            Add, View and Edit keys of{" "}
            {clusterId ? (
              <>
                cluster{" "} <span className="font-semibold text-primary">{truncateText(clusterAlias || clusterId!)}</span>
              </>
            ) : (
              <>instance <span className="font-semibold text-primary">{truncateText(id!)}</span></>
            )}
          </>
        }
        icon={<KeyRound size={20} />}
        title="Key Browser"
      />

      {error && (
        <Typography className="ml-2" variant="bodySm">
          Error loading keys: {error}
        </Typography>
      )}

      {/* Total Keys and Key Stats */}
      <TooltipProvider>
        <div className="flex justify-between gap-4">
          <StatCard
            className="flex-1"
            label="Total Keys"
            tooltip={
              <TooltipIcon description={`Total number of keys in the ${clusterId ? "cluster" : "instance"} "DBSIZE"`} size={14} />
            }
            value={totalKeys}
          />
          <StatCard
            className="flex-1"
            label="Memory Usage"
            tooltip={
              <TooltipIcon description="Memory used by keys sampled" size={14} />
            }
            value={formatBytes(totalMemoryUsage)}
          />
        </div>
      </TooltipProvider>
      {/* Search and Refresh */}
      <div className="flex items-center w-full gap-2">
        <Select
          className="w-48"
          disabled={busy}
          icon={<ListFilter size={16} />}
          onChange={(e) => setSelectedType(e.target.value)}
          value={selectedType}
        >
          {keyTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </Select>

        <Button
          className="font-normal"
          disabled={busy}
          onClick={() => setIsDistributionOpen(true)}
          type="button"
          variant={"outline"}
        >
          <ChartPie className="text-primary" /> Key Distribution Chart
        </Button>

        <form className="flex-1" onSubmit={handleSearch}>
          <SearchInput
            disabled={busy}
            onChange={(e) => setSearchPattern(e.target.value)}
            onClear={handleClearSearch}
            placeholder="Search keys (supports glob: * ? [ ])"
            value={searchPattern}
          />
        </form>

        <Button
          disabled={loading}
          onClick={handleAddKeyModal}
          type="button"
        >
          + Add Key
        </Button>

        <Button
          aria-label="Edit connection settings"
          disabled={busy}
          onClick={handleRefresh}
          size="icon"
          type="button"
        >
          <RefreshCw className={loading ? "animate-spin" : ""} />
        </Button>
      </div>

      {/* Add Key Modal */}
      {isAddKeyOpen && <AddNewKey onClose={handleAddKeyModal} />}

      <ScanAllModal
        onClose={() => setIsScanAllOpen(false)}
        onScan={handleScanAll}
        open={isScanAllOpen}
        params={scanAllParams}
        pattern={activePattern}
      />

      {/* Scan all progress */}
      {scanAllRunning && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border border-input rounded-md" role="status">
          <Typography variant="bodySm">
            Scanning all keys{activePattern && activePattern !== "*" ? ` matching "${activePattern}"` : ""}:{" "}
            {keys.length.toLocaleString()} loaded of {totalKeys.toLocaleString()} in database
            {nodeCursors.length > 1 && ` · ${nodesDone} of ${nodeCursors.length} nodes done`}
            {` · stops at ${scanAllParams.maxKeys.toLocaleString()}`}
          </Typography>
          <Button onClick={handleStopScanAll} size="sm" type="button" variant="outline">
            <Square size={14} /> Stop
          </Button>
        </div>
      )}

      {/* Key Type Distribution Modal */}
      <ChartModal
        onClose={() => setIsDistributionOpen(false)}
        open={isDistributionOpen}
        subtitle="Memory and count breakdown by key type"
        title="Key Type Distribution"
      >
        <DonutChart />
      </ChartModal>

      {/* Key Viewer */}
      <TooltipProvider>
        <SplitPanel
          left={
            <Panel
              emptyState={selectedType === "all" ? "No keys found" : `No ${selectedType} keys found`}
              isEmpty={filteredKeys.length === 0 && !loading && !hasMoreKeys}
              loading={loading}
            >
              <KeyTree
                footer={hasMoreKeys && !loading && (
                  <div className="flex flex-col items-center gap-1 py-2">
                    <div className="flex gap-2">
                      <Button
                        disabled={loadingMore || scanAllRunning}
                        onClick={handleLoadMore}
                        type="button"
                        variant="outline"
                      >
                        {loadingMore ? "Loading..." : "Load more"}
                      </Button>
                      <Button
                        disabled={loadingMore || scanAllRunning}
                        onClick={() => setIsScanAllOpen(true)}
                        type="button"
                        variant="outline"
                      >
                        Scan all...
                      </Button>
                    </div>
                    <Typography variant="bodyXs">{keys.length.toLocaleString()} keys loaded</Typography>
                  </div>
                )}
                keys={filteredKeys}
                loading={loading}
                onKeyClick={handleKeyClick}
                selectedKey={selectedKey}
              />
            </Panel>
          }
          right={
            <KeyDetails connectionId={id!} readOnly={false}
              selectedKey={selectedKey} selectedKeyInfo={selectedKeyInfo} setSelectedKey={setSelectedKey} />
          }
          rightClassName=""
        />
      </TooltipProvider>
    </RouteContainer>
  )
}
