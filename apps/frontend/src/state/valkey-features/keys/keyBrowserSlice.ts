import { createSlice, nanoid, type PayloadAction } from "@reduxjs/toolkit"

interface KeyInfo {
  name: string;
  type?: string;
  ttl?: number;
  size?: number;
  collectionSize?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  elements?: any;
  elementsWarning?: string;
}

interface KeyBrowserState {
  [connectionId: string]: {
    keys: KeyInfo[];
    // SCAN cursor per node from the last batch; "0" means that node is fully scanned.
    cursors: Record<string, string>;
    pattern?: string; // pattern of the current scan, reused when loading more
    scanId?: string; // identifies the current scan; replies from an older scan are ignored
    loading: boolean;
    loadingMore: boolean;
    scanAllRunning: boolean;
    error: string | null;
    keyTypeLoading: { [key: string]: boolean };
    totalKeys: number;
  };
}

/**
 * Called per connection so each gets its own nested objects, not frozen shared ones.
 */
export const createConnectionState = (): KeyBrowserState[string] => ({
  keys: [],
  cursors: {},
  loading: false,
  loadingMore: false,
  scanAllRunning: false,
  error: null,
  keyTypeLoading: {},
  totalKeys: 0,
})

export const defaultConnectionState = createConnectionState()

const initialState: KeyBrowserState = {}

/**
 * Replies without a scanId (e.g. "Invalid connection Id") are treated as belonging to the current scan.
 */
const isCurrentScan = (connection: KeyBrowserState[string], scanId?: string) =>
  scanId === undefined || scanId === connection.scanId

const keyBrowserSlice = createSlice({
  name: "keyBrowser",
  initialState,
  reducers: {
    getKeysRequested: {
      /**
       * Starts a scan batch. A fresh scan resets the scan id and pattern and cancels Scan all;
       * a batch with `cursors` resumes the current scan.
       */
      reducer: (
        state,
        action: PayloadAction<{
          connectionId: string;
          pattern?: string;
          count?: number;
          cursors?: Record<string, string>; // set to resume the current scan (Load more)
          scanId: string;
        }>,
      ) => {
        const { connectionId, pattern, cursors, scanId } = action.payload
        if (!state[connectionId]) {
          state[connectionId] = createConnectionState()
        }
        if (cursors) {
          state[connectionId].loadingMore = true
        } else {
          // A fresh scan (open, Refresh, search) supersedes any batch or Scan all still running.
          state[connectionId].loading = true
          state[connectionId].loadingMore = false
          state[connectionId].scanAllRunning = false
          state[connectionId].pattern = pattern
          state[connectionId].scanId = scanId
        }
        state[connectionId].error = null
      },
      /**
       * A fresh scan gets a new id; resuming passes the id of the scan it continues.
       */
      prepare: (payload: {
        connectionId: string;
        pattern?: string;
        count?: number;
        cursors?: Record<string, string>;
        scanId?: string;
      }) => ({
        payload: { ...payload, scanId: payload.cursors && payload.scanId ? payload.scanId : nanoid() },
      }),
    },
    /**
     * Applies a batch from the current scan: appends (deduped) when resuming, replaces otherwise.
     */
    getKeysFulfilled: (
      state,
      action: PayloadAction<{
        connectionId: string;
        keys: KeyInfo[];
        cursors: Record<string, string>;
        totalKeys: number;
        append?: boolean;
        scanId?: string;
      }>,
    ) => {
      const { connectionId, keys, cursors, totalKeys, append, scanId } = action.payload
      if (state[connectionId] && isCurrentScan(state[connectionId], scanId)) {
        state[connectionId].loading = false
        state[connectionId].loadingMore = false
        if (append) {
          // SCAN can return a key more than once, so skip keys already in the list.
          const known = new Set(state[connectionId].keys.map((k) => k.name))
          state[connectionId].keys.push(...keys.filter((k) => !known.has(k.name)))
        } else {
          state[connectionId].keys = keys
        }
        state[connectionId].cursors = cursors
        state[connectionId].totalKeys = totalKeys
      }
    },
    /**
     * Records a failed batch from the current scan and stops Scan all.
     */
    getKeysFailed: (
      state,
      action: PayloadAction<{
        connectionId: string;
        error: string;
        scanId?: string;
      }>,
    ) => {
      const { connectionId, error, scanId } = action.payload
      if (state[connectionId] && isCurrentScan(state[connectionId], scanId)) {
        state[connectionId].loading = false
        state[connectionId].loadingMore = false
        state[connectionId].scanAllRunning = false
        state[connectionId].error = error
      }
    },
    /**
     * Keeps loading batches until the scan completes or `maxKeys` are loaded; see keyBrowserEpic.
     */
    scanAllRequested: (
      state,
      action: PayloadAction<{ connectionId: string; maxKeys: number; delayMs: number }>,
    ) => {
      const { connectionId } = action.payload
      if (state[connectionId]) {
        state[connectionId].scanAllRunning = true
      }
    },
    /**
     * Stops Scan all, keeping the keys loaded so far.
     */
    scanAllStopped: (
      state,
      action: PayloadAction<{ connectionId: string; reason: "stopped" | "complete" | "limit" }>,
    ) => {
      const { connectionId } = action.payload
      if (state[connectionId]) {
        state[connectionId].scanAllRunning = false
      }
    },
    getKeyTypeRequested: (
      state,
      action: PayloadAction<{ connectionId: string; key: string }>,
    ) => {
      const { connectionId, key } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = createConnectionState()
      }
      state[connectionId].keyTypeLoading[key] = true
    },
    getKeyTypeFulfilled: (
      state,
      action: PayloadAction<
        {
          connectionId: string;
          key: string;
        } & Omit<KeyInfo, "name"> & { name?: string }
      >,
    ) => {
      const { connectionId, key, name, ...keyInfo } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = createConnectionState()
      }
      const updatedKey: KeyInfo = { name: name ?? key, ...keyInfo }
      const index = state[connectionId].keys.findIndex((k) => k.name === key)
      if (index === -1) {
        state[connectionId].keys.push(updatedKey)
      } else {
        state[connectionId].keys[index] = updatedKey
      }
      delete state[connectionId].keyTypeLoading[key]
    },
    getKeyTypeFailed: (
      state,
      action: PayloadAction<{
        connectionId: string;
        key: string;
        error: string;
      }>,
    ) => {
      const { connectionId, key } = action.payload
      if (state[connectionId]) {
        delete state[connectionId].keyTypeLoading[key]
      }
    },
    deleteKeyRequested: (
      state,
      action: PayloadAction<{ connectionId: string; key: string }>,
    ) => {
      const { connectionId, key } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = createConnectionState()
      }
      state[connectionId].keyTypeLoading[key] = true
    },
    deleteKeyFulfilled: (
      state,
      action: PayloadAction<{
        connectionId: string;
        key: string;
        deleted: boolean;
      }>,
    ) => {
      const { connectionId, key, deleted } = action.payload
      if (state[connectionId]) {
        delete state[connectionId].keyTypeLoading[key]

        // remove key from keys array when deleted
        if (deleted && state[connectionId].keys) {
          state[connectionId].keys = state[connectionId].keys.filter(
            (keyInfo) => keyInfo.name !== key,
          )
        }
      }
    },
    deleteKeyFailed: (
      state,
      action: PayloadAction<{
        connectionId: string;
        key: string;
        error: string;
      }>,
    ) => {
      const { connectionId, key } = action.payload
      if (state[connectionId]) {
        delete state[connectionId].keyTypeLoading[key]
      }
    },
    addKeyRequested: (
      state,
      action: PayloadAction<{
        connectionId: string;
        key: string;
        keyType: string;
        value?: string;
        fields?: { field: string; value: string }[];
        values?: string[];
        zsetMembers?: { key: string; value: number }[];
        streamEntryId?: string;
        ttl?: number;
      }>,
    ) => {
      const { connectionId } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = createConnectionState()
      }
      state[connectionId].loading = true
      state[connectionId].error = null
    },
    addKeyFulfilled: (
      state,
      action: PayloadAction<{
        connectionId: string;
        key: KeyInfo;
        message: string;
      }>,
    ) => {
      const { connectionId, key } = action.payload
      if (state[connectionId]) {
        state[connectionId].loading = false
        state[connectionId].keys.push(key)
      }
    },
    addKeyFailed: (
      state,
      action: PayloadAction<{
        connectionId: string;
        error: string;
      }>,
    ) => {
      const { connectionId } = action.payload
      if (state[connectionId]) {
        state[connectionId].loading = false
      }
    },
    updateKeyRequested: (
      state,
      action: PayloadAction<{
        connectionId: string;
        key: string;
        keyType: string;
        value?: string;
        fields?: { field: string; value: string }[];
        deletedHashFields?: string[];
        listUpdates?: { index: number; value: string }[];
        deletedListItems?: { index: number; value: string }[];
        setUpdates?: { oldValue: string; newValue: string }[];
        deletedSetItems?: string[];
        newListItems?: string[];
        newSetItems?: string[];
        zsetUpdates?: { key: string; value: number }[];
        ttl?: number;
      }>,
    ) => {
      const { connectionId } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = createConnectionState()
      }
      state[connectionId].loading = true
      state[connectionId].error = null
    },
    updateKeyFulfilled: (
      state,
      action: PayloadAction<{
        connectionId: string;
        key: KeyInfo;
        message: string;
      }>,
    ) => {
      const { connectionId, key } = action.payload
      if (state[connectionId]) {
        state[connectionId].loading = false
        const index = state[connectionId].keys.findIndex(
          (k) => k.name === key.name,
        )
        if (index !== -1) {
          state[connectionId].keys[index] = key
        }
      }
    },
    updateKeyFailed: (
      state,
      action: PayloadAction<{
        connectionId: string;
        error: string;
      }>,
    ) => {
      const { connectionId, error } = action.payload
      if (state[connectionId]) {
        state[connectionId].loading = false
        state[connectionId].error = error
      }
    },

  },
})

export default keyBrowserSlice.reducer
export const {
  getKeysRequested,
  getKeysFulfilled,
  getKeysFailed,
  scanAllRequested,
  scanAllStopped,
  getKeyTypeRequested,
  getKeyTypeFulfilled,
  getKeyTypeFailed,
  deleteKeyRequested,
  deleteKeyFulfilled,
  deleteKeyFailed,
  addKeyRequested,
  addKeyFulfilled,
  addKeyFailed,
  updateKeyRequested,
  updateKeyFulfilled,
  updateKeyFailed,
} = keyBrowserSlice.actions
