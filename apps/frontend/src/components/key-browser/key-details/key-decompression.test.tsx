import { gzipSync } from "node:zlib"
import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Provider } from "react-redux"
import { configureStore, type PayloadAction } from "@reduxjs/toolkit"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { VALKEY } from "@common/src/constants"
import KeyDetailsString from "./key-details-string"
import type { Subscription } from "rxjs"
import keyBrowserReducer from "@/state/valkey-features/keys/keyBrowserSlice"
import keyDecompressionReducer, { rawValueFulfilled } from "@/state/valkey-features/keys/keyDecompressionSlice"
import { keyDecompressionEpic } from "@/state/epics/keyDecompressionEpic"
import { rxjsMiddleware } from "@/state/middleware/rxjsMiddleware/rxjsMiddleware"

const sent = vi.hoisted(() => [] as PayloadAction<Record<string, unknown>>[])
vi.mock("@/state/epics/wsEpics", () => ({ getSocket: () => ({ next: (action: PayloadAction<Record<string, unknown>>) => sent.push(action) }) }))

const connectionId = "localhost-6379-db0"
const key = "session:1"
const stored = gzipSync(JSON.stringify({ user: "ada", roles: ["admin"] }))

function createStore() {
  return configureStore({
    reducer: { [VALKEY.KEYS.name]: keyBrowserReducer, [VALKEY.KEY_DECOMPRESSION.name]: keyDecompressionReducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({ thunk: false }).concat(rxjsMiddleware),
  })
}

let store: ReturnType<typeof createStore>
let epic: Subscription

beforeEach(() => {
  sent.length = 0
  store = createStore()
  epic = keyDecompressionEpic(store).subscribe()
})

afterEach(() => epic.unsubscribe())

function stringKey(name = key) {
  return (
    <Provider store={store}>
      <KeyDetailsString
        connectionId={connectionId}
        readOnly={false}
        selectedKey={name}
        selectedKeyInfo={{
          name, type: "string", ttl: -1, size: 100, elements: "\\x1f\\x8b\\x08...", isBinary: true, compressionHint: "gzip",
        }}
      />
    </Provider>
  )
}

const renderStringKey = () => render(stringKey())

/** Answers the last raw value request the way the server would. */
function replyWithStoredValue(overrides: { maxOutputBytes?: number } = {}) {
  const request = sent[sent.length - 1]
  act(() => {
    store.dispatch(rawValueFulfilled({
      connectionId,
      key,
      requestId: request.payload.requestId as string,
      base64: stored.toString("base64"),
      byteLength: stored.length,
      maxOutputBytes: overrides.maxOutputBytes ?? 10 * 1024 * 1024,
      previewMaxBytes: 1024 * 1024,
    }))
  })
}

describe("KeyDecompression", () => {
  it("decodes nothing until the user asks", () => {
    renderStringKey()

    expect(screen.getByText("looks like gzip")).toBeInTheDocument()
    expect(screen.getByText("\\x1f\\x8b\\x08...")).toBeInTheDocument()
    expect(screen.queryByTestId("decompressed-value")).not.toBeInTheDocument()
    expect(sent).toHaveLength(0)
  })

  it("requests the raw bytes and shows the decoded value as read-only JSON", async () => {
    const user = userEvent.setup()
    renderStringKey()

    await user.click(screen.getByRole("button", { name: "Decompress" }))
    expect(sent[0]).toMatchObject({
      type: VALKEY.KEY_DECOMPRESSION.rawValueRequested, payload: { connectionId, key, codecChoice: "auto" },
    })
    expect(screen.getByRole("status")).toHaveTextContent("Loading value…")

    replyWithStoredValue()

    expect(await screen.findByText("Decompressed (gzip): read-only view")).toBeInTheDocument()
    expect(screen.getByTestId("decompressed-value").textContent).toBe(
      JSON.stringify({ user: "ada", roles: ["admin"] }, null, 2),
    )
    // The stored value stays visible above the decoded view.
    expect(screen.getByText("\\x1f\\x8b\\x08...")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Hide decompressed value" }))
    expect(screen.queryByTestId("decompressed-value")).not.toBeInTheDocument()
  })

  it("uses the chosen format and reports data that doesn't match it", async () => {
    const user = userEvent.setup()
    renderStringKey()

    await user.selectOptions(screen.getByRole("combobox", { name: "Compression format" }), "zstd")
    await user.click(screen.getByRole("button", { name: "Decompress" }))
    expect(sent[0].payload.codecChoice).toBe("zstd")
    replyWithStoredValue()

    expect(await screen.findByText(/^Not valid zstd data: /)).toBeInTheDocument()
    expect(screen.queryByTestId("decompressed-value")).not.toBeInTheDocument()
  })

  it("goes back to format detection when another key is selected", async () => {
    const user = userEvent.setup()
    const { rerender } = renderStringKey()
    const formatSelect = () => screen.getByRole("combobox", { name: "Compression format" })

    await user.selectOptions(formatSelect(), "snappy-raw")
    rerender(stringKey("session:2"))
    expect(formatSelect()).toHaveValue("auto")

    await user.click(screen.getByRole("button", { name: "Decompress" }))
    expect(sent[0].payload).toMatchObject({ key: "session:2", codecChoice: "auto" })
  })

  it("ignores the server's reply after Cancel", async () => {
    const user = userEvent.setup()
    renderStringKey()

    await user.click(screen.getByRole("button", { name: "Decompress" }))
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    replyWithStoredValue()

    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(screen.queryByText(/Decompressed/)).not.toBeInTheDocument()
    expect(store.getState()[VALKEY.KEY_DECOMPRESSION.name][connectionId][key]).toBeUndefined()
  })

  it("labels truncated output as text and continues past the limit", async () => {
    const user = userEvent.setup()
    renderStringKey()

    await user.click(screen.getByRole("button", { name: "Decompress" }))
    replyWithStoredValue({ maxOutputBytes: 10 })

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("Output truncated at 10 B. Truncated output is shown as plain text.")
    expect(screen.getByTestId("decompressed-value").textContent).toBe("{\"user\":\"a")

    await user.click(within(alert).getByRole("button", { name: "Continue to 20 B" }))
    expect(sent[1].payload).toMatchObject({ codecChoice: "gzip", outputLimit: 20, previewStart: 10 })

    replyWithStoredValue({ maxOutputBytes: 10 })
    expect(await screen.findByText("Showing bytes 10–20 of 20, the newly decoded part.")).toBeInTheDocument()
    expect(screen.getByTestId("decompressed-value").textContent).toBe("da\",\"roles")
  })
})
