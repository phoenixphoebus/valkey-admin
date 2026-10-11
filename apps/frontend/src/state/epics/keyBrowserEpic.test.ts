import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { configureStore } from "@reduxjs/toolkit"
import { VALKEY } from "@common/src/constants"
import { keyBrowserEpic } from "./keyBrowserEpic"
import { rxjsMiddleware } from "../middleware/rxjsMiddleware/rxjsMiddleware"
import keyBrowserReducer, {
  getKeysRequested,
  getKeysFulfilled,
  getKeysFailed,
  scanAllRequested,
  scanAllStopped
} from "../valkey-features/keys/keyBrowserSlice"

const socketNext = vi.fn()
vi.mock("./wsEpics", () => ({ getSocket: () => ({ next: socketNext }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }))

const connectionId = "conn-1"

describe("keyBrowserEpic: Scan all", () => {
  let store: ReturnType<typeof createStore>
  let subscription: { unsubscribe: () => void }

  function createStore() {
    return configureStore({
      reducer: { [VALKEY.KEYS.name]: keyBrowserReducer },
      middleware: (getDefault) => getDefault({ thunk: false }).concat(rxjsMiddleware),
    })
  }

  const state = () => store.getState()[VALKEY.KEYS.name][connectionId]
  // getKeysRequested actions the epic sent to the server, in order.
  const sentRequests = () => socketNext.mock.calls.map(([action]) => action).filter((a) => getKeysRequested.match(a))
  const lastRequest = () => sentRequests().at(-1)!

  // Simulates the server answering the last request with `count` new keys.
  const reply = (count: number, cursor: string) => {
    const offset = state().keys.length
    store.dispatch(getKeysFulfilled({
      connectionId,
      keys: Array.from({ length: count }, (_, i) => ({ name: `k${offset + i}` })),
      cursors: { standalone: cursor },
      totalKeys: 5000,
      append: Boolean(lastRequest().payload.cursors),
      scanId: lastRequest().payload.scanId,
    }))
  }

  beforeEach(() => {
    vi.useFakeTimers()
    socketNext.mockClear()
    store = createStore()
    subscription = keyBrowserEpic(store).subscribe()
    store.dispatch(getKeysRequested({ connectionId }))
    reply(1000, "1")
  })

  afterEach(() => {
    subscription.unsubscribe()
    vi.useRealTimers()
  })

  it("keeps requesting batches from the latest cursor until the scan completes", () => {
    store.dispatch(scanAllRequested({ connectionId, maxKeys: 50000, delayMs: 100 }))
    expect(lastRequest().payload.cursors).toEqual({ standalone: "1" })

    reply(1000, "2")
    expect(sentRequests()).toHaveLength(2) // waits for the delay before the next batch
    vi.advanceTimersByTime(100)
    expect(lastRequest().payload.cursors).toEqual({ standalone: "2" })

    reply(500, "0")
    vi.advanceTimersByTime(100)
    expect(sentRequests()).toHaveLength(3)
    expect(state().keys).toHaveLength(2500)
    expect(state().scanAllRunning).toBe(false)
  })

  it("stops once maxKeys are loaded", () => {
    store.dispatch(scanAllRequested({ connectionId, maxKeys: 1500, delayMs: 0 }))
    reply(1000, "2")
    vi.advanceTimersByTime(0)

    expect(sentRequests()).toHaveLength(2)
    expect(state().scanAllRunning).toBe(false)
  })

  it("stops on Stop and keeps the keys loaded so far", () => {
    store.dispatch(scanAllRequested({ connectionId, maxKeys: 50000, delayMs: 0 }))
    store.dispatch(scanAllStopped({ connectionId, reason: "stopped" }))
    reply(1000, "2")
    vi.advanceTimersByTime(0)

    expect(sentRequests()).toHaveLength(2)
    expect(state().keys).toHaveLength(2000)
    expect(state().scanAllRunning).toBe(false)
  })

  it("is cancelled by a fresh scan, and the stale batch is ignored", () => {
    store.dispatch(scanAllRequested({ connectionId, maxKeys: 50000, delayMs: 0 }))
    const staleRequest = lastRequest()
    store.dispatch(getKeysRequested({ connectionId })) // Refresh

    store.dispatch(getKeysFulfilled({
      connectionId,
      keys: [{ name: "stale" }],
      cursors: { standalone: "9" },
      totalKeys: 5000,
      append: true,
      scanId: staleRequest.payload.scanId,
    }))
    vi.advanceTimersByTime(0)

    expect(state().scanAllRunning).toBe(false)
    expect(state().loading).toBe(true) // still waiting for the Refresh
    expect(state().keys.map((k) => k.name)).not.toContain("stale")
    expect(sentRequests()).toHaveLength(3)
  })

  it("stops when a batch fails", () => {
    store.dispatch(scanAllRequested({ connectionId, maxKeys: 50000, delayMs: 0 }))
    store.dispatch(getKeysFailed({ connectionId, error: "boom", scanId: lastRequest().payload.scanId }))
    vi.advanceTimersByTime(0)

    expect(state().scanAllRunning).toBe(false)
    expect(sentRequests()).toHaveLength(2)
  })
})
