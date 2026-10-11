import { tap, ignoreElements, filter, exhaustMap, concatMap, takeUntil, groupBy, mergeMap } from "rxjs/operators"
import { merge, of, concat, timer } from "rxjs"
import { toast } from "sonner"
import { getSocket } from "./wsEpics"
import {
  getKeysRequested,
  getKeysFulfilled,
  getKeysFailed,
  scanAllRequested,
  scanAllStopped,
  getKeyTypeRequested,
  deleteKeyRequested,
  addKeyRequested,
  addKeyFailed,
  updateKeyRequested
} from "../valkey-features/keys/keyBrowserSlice"
import {
  selectKeys,
  selectCursors,
  selectHasMoreKeys,
  selectPattern,
  selectScanId
} from "../valkey-features/keys/keyBrowserSelectors"
import { closeConnection, connectionBroken, deleteConnection } from "../valkey-features/connection/connectionSlice"
import { action$, select, selectMany } from "../middleware/rxjsMiddleware/rxjsMiddleware"
import type { Store } from "@reduxjs/toolkit"

/**
 * Keeps only actions for the given connection.
 */
const forConnection = (connectionId: string) =>
  filter((action: { payload: { connectionId: string } }) => action.payload.connectionId === connectionId)

/**
 * Scan all: request the next batch each time the previous one lands, pausing `delayMs` in between,
 * until every node is scanned, `maxKeys` are loaded, or something cancels it.
 */
const scanAllEpic = (store: Store) =>
  action$.pipe(
    select(scanAllRequested),
    groupBy((action) => action.payload.connectionId),
    // One Scan all per connection; repeat requests while one is running are ignored.
    mergeMap((group$) => group$.pipe(
      exhaustMap(({ payload: { connectionId, maxKeys, delayMs } }) => {
        /**
         * Requests the next batch, or stops Scan all when every node is scanned or `maxKeys` are loaded.
         */
        const nextBatch = () => {
          const state = store.getState()
          if (!selectHasMoreKeys(connectionId)(state)) {
            store.dispatch(scanAllStopped({ connectionId, reason: "complete" }))
          } else if (selectKeys(connectionId)(state).length >= maxKeys) {
            store.dispatch(scanAllStopped({ connectionId, reason: "limit" }))
          } else {
            store.dispatch(getKeysRequested({
              connectionId,
              pattern: selectPattern(connectionId)(state),
              cursors: selectCursors(connectionId)(state),
              scanId: selectScanId(connectionId)(state),
            }))
          }
        }

        // Stop, a fresh scan (Refresh/search), a failed batch, or losing the connection ends the loop.
        const cancel$ = merge(
          action$.pipe(select(scanAllStopped), forConnection(connectionId)),
          action$.pipe(select(getKeysRequested), filter((a) => a.payload.connectionId === connectionId && !a.payload.cursors)),
          action$.pipe(selectMany(getKeysFailed, closeConnection, connectionBroken, deleteConnection), forConnection(connectionId)),
        )

        return concat(
          of(null),
          action$.pipe(
            select(getKeysFulfilled),
            filter((a) => a.payload.connectionId === connectionId
              && a.payload.scanId === selectScanId(connectionId)(store.getState())),
            concatMap(() => timer(delayMs)),
          ),
        ).pipe(
          tap(nextBatch),
          takeUntil(cancel$),
        )
      }),
    )),
    ignoreElements(),
  )

/**
 * Forwards Key Browser requests to the server over the websocket, runs Scan all, and shows its result toasts.
 */
export const keyBrowserEpic = (store: Store) =>
  merge(
    scanAllEpic(store),

    action$.pipe(
      select(scanAllStopped),
      tap(({ payload: { reason, connectionId } }) => {
        const loaded = selectKeys(connectionId)(store.getState()).length.toLocaleString()
        if (reason === "complete") toast.success(`Scan complete: ${loaded} keys loaded`)
        if (reason === "limit") toast.info(`Scan stopped at the key limit: ${loaded} keys loaded`)
      }),
      ignoreElements(),
    ),

    // for getting all keys (getKeys)
    action$.pipe(
      select(getKeysRequested),
      tap((action) => {
        const socket = getSocket()
        console.debug("Sending getKeys request to server...")
        socket.next(action)
      }),
    ),

    // for getting a key type and ttl (getKeyInfo)
    action$.pipe(
      select(getKeyTypeRequested),
      tap((action) => {
        const socket = getSocket()
        console.debug("Sending getKeyType request to server...")
        socket.next(action)
      }),
    ),

    // for deleting a key (deleteKey)
    action$.pipe(
      select(deleteKeyRequested),
      tap((action) => {
        const socket = getSocket()
        console.debug("Sending deleteKey request to server...")
        socket.next(action)
      }),
    ),

    // add new key (addKey)
    action$.pipe(
      select(addKeyRequested),
      tap((action) => {
        const socket = getSocket()
        console.debug("Sending addKey request to server...")
        socket.next(action)
      }),
    ),

    // handle addKey failure (addKeyFailed)
    action$.pipe(
      select(addKeyFailed),
      tap(({ payload }) => toast.error(`Failed to add key: ${payload.error}`)),
      ignoreElements(),
    ),

    // update existing key (updateKey)
    action$.pipe(
      select(updateKeyRequested),
      tap((action) => {
        const socket = getSocket()
        console.debug("Sending updateKey request to server...")
        socket.next(action)
      }),
    ),
  )
