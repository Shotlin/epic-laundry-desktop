// The website build (no Electron shell) talks to the real LNDRY backend
// directly; the desktop app (Electron, `window.epic` present) keeps using its
// own local server exactly as before. Pages import from here and get whichever
// applies — the choice is made once, from the same isWebOnly flag the login
// screen uses.
import { isWebOnly } from './cloudAuth';
import * as web from './apiWeb';
import * as local from './apiLocal';

const impl = isWebOnly ? web : local;

export type OfflineQueueItem = web.OfflineQueueItem;
export const OfflineQueuedError = impl.OfflineQueuedError;
export type OfflineQueuedError = InstanceType<typeof web.OfflineQueuedError>;
export const ApiError = impl.ApiError;
export type ApiError = InstanceType<typeof web.ApiError>;

export const operatorErrorMessage = impl.operatorErrorMessage;
export const offlineQueueSnapshot = impl.offlineQueueSnapshot;
export const clearOfflineDeadLetters = impl.clearOfflineDeadLetters;
export const retryOfflineDeadLetters = impl.retryOfflineDeadLetters;
export const exportOfflineQueue = impl.exportOfflineQueue;
export const apiPostOffline = impl.apiPostOffline;
export const replayOfflineQueue = impl.replayOfflineQueue as typeof web.replayOfflineQueue;
export const apiGet = impl.apiGet;
export const apiPost = impl.apiPost;
export const apiPatch = impl.apiPatch;
export const apiPut = impl.apiPut;
export const listEntity = impl.listEntity;
export const createEntity = impl.createEntity;
export const apiDelete: typeof web.apiDelete = isWebOnly
  ? web.apiDelete
  : ((async () => { throw new Error('Delete is not supported by the desktop server.'); }) as typeof web.apiDelete);
