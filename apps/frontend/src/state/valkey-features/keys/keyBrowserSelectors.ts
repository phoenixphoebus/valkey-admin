import * as R from "ramda"
import { VALKEY } from "@common/src/constants.ts"
import { defaultConnectionState } from "./keyBrowserSlice"
import type { RootState } from "@/store.ts"

export const selectKeys = (id: string) => (state: RootState) =>
  R.pathOr(defaultConnectionState.keys, [VALKEY.KEYS.name, id, "keys"], state)

export const selectTotalKeys = (id: string) => (state: RootState) =>
  R.pathOr(defaultConnectionState.keys, [VALKEY.KEYS.name, id, "totalKeys"], state)

/**
 * SCAN cursor per node from the last batch; empty before the first scan.
 */
export const selectCursors = (id: string) => (state: RootState) =>
  R.pathOr(defaultConnectionState.cursors, [VALKEY.KEYS.name, id, "cursors"], state)

/**
 * True while at least one node still has keys left to scan.
 */
export const selectHasMoreKeys = (id: string) => (state: RootState) =>
  Object.values(selectCursors(id)(state)).some((cursor) => cursor !== "0")

/**
 * Pattern of the current scan, reused by Load more and Scan all.
 */
export const selectPattern = (id: string) => (state: RootState) =>
  R.pathOr<string | undefined>(defaultConnectionState.pattern, [VALKEY.KEYS.name, id, "pattern"], state)

/**
 * Whether a Load more or Scan all batch is in flight.
 */
export const selectLoadingMore = (id: string) => (state: RootState) =>
  R.pathOr(defaultConnectionState.loadingMore, [VALKEY.KEYS.name, id, "loadingMore"], state)

/**
 * Id of the current scan; replies carrying a different id are stale.
 */
export const selectScanId = (id: string) => (state: RootState) =>
  R.pathOr<string | undefined>(defaultConnectionState.scanId, [VALKEY.KEYS.name, id, "scanId"], state)

/**
 * Whether Scan all is running for this connection.
 */
export const selectScanAllRunning = (id: string) => (state: RootState) =>
  R.pathOr(defaultConnectionState.scanAllRunning, [VALKEY.KEYS.name, id, "scanAllRunning"], state)

export const selectLoading = (id: string) => (state: RootState) =>
  R.pathOr(defaultConnectionState.loading, [VALKEY.KEYS.name, id, "loading"], state)

export const selectError = (id: string) => (state: RootState) =>
  R.pathOr(defaultConnectionState.error, [VALKEY.KEYS.name, id, "error"], state)

export const selectKeyBrowserState = (id: string) => (state: RootState) =>
  R.pathOr(defaultConnectionState, [VALKEY.KEYS.name, id], state)

// For key type
export const selectKeyTypeLoading = (id: string) => (state: RootState) =>
  R.pathOr(defaultConnectionState.keyTypeLoading, [VALKEY.KEYS.name, id, "keyTypeLoading"], state)

export const selectKeyTypeLoadingForKey = (id: string, key: string) => (state: RootState) =>
  R.pathOr(false, [VALKEY.KEYS.name, id, "keyTypeLoading", key], state)

export const selectKeyType = (id: string, keyName: string | null | undefined) => (state: RootState) => {
  if (!keyName) return undefined
  
  const keys = selectKeys(id)(state)
  return keys.find((k) => k.name === keyName)?.type
}

export const selectKeyTTL = (id: string, keyName: string | null | undefined) => (state: RootState) => {
  if (!keyName) return undefined
  
  const keys = selectKeys(id)(state)
  return keys.find((k) => k.name === keyName)?.ttl
}

export const selectKeySize = (id: string, keyName: string | null | undefined) => (state: RootState) => {
  if (!keyName) return undefined
  
  const keys = selectKeys(id)(state)
  return keys.find((k) => k.name === keyName)?.size
}

export const selectKeyCollectionSize = (id: string, keyName: string | null | undefined) => (state: RootState) => {
  if (!keyName) return undefined
  
  const keys = selectKeys(id)(state)
  return keys.find((k) => k.name === keyName)?.collectionSize
}
