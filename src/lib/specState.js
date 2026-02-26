/**
 * specState.js
 * - 질문 엔진 이식 대비용 세션 상태 스키마를 고정합니다.
 * - 현재 단계에서는 기존 UI 상태를 유지하고, 동일 정보를 shadow write로만 기록합니다.
 */

const SPEC_STATE_VERSION = 1;
const SPEC_STATE_STORAGE_KEY = 'spec_state_v1';
const MAX_HISTORY_LENGTH = 60;

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeAnswers(value) {
  if (!isObject(value)) return {};
  return Object.entries(value).reduce((acc, [key, entryValue]) => {
    const safeKey = String(key || '').trim();
    if (!safeKey) return acc;
    acc[safeKey] = entryValue;
    return acc;
  }, {});
}

function normalizeHistory(value) {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .filter((item) => isObject(item))
    .map((item) => {
      const type = String(item.type || '').trim();
      const ts = Number(item.ts);
      const timestamp = Number.isFinite(ts) ? ts : Date.now();
      const payload = isObject(item.payload) ? item.payload : {};
      return { type: type || 'event', ts: timestamp, payload };
    });

  return normalized.slice(-MAX_HISTORY_LENGTH);
}

export function createEmptySpecState() {
  return {
    answers: {},
    current_node_id: 'root',
    history: [],
    version: SPEC_STATE_VERSION,
  };
}

function normalizeSpecState(rawValue) {
  const raw = isObject(rawValue) ? rawValue : {};
  const currentNodeId = String(raw.current_node_id || '').trim() || 'root';

  return {
    answers: normalizeAnswers(raw.answers),
    current_node_id: currentNodeId,
    history: normalizeHistory(raw.history),
    version: SPEC_STATE_VERSION,
  };
}

export function loadSpecStateFromSession() {
  try {
    const raw = sessionStorage.getItem(SPEC_STATE_STORAGE_KEY);
    if (!raw) return createEmptySpecState();
    return normalizeSpecState(JSON.parse(raw));
  } catch {
    return createEmptySpecState();
  }
}

function persistSpecStateToSession(specState) {
  const normalized = normalizeSpecState(specState);
  try {
    sessionStorage.setItem(SPEC_STATE_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // SessionStorage quota or parsing issues should not break app flow.
  }
  return normalized;
}

export function appendSpecStateHistory(specState, entry) {
  const normalizedState = normalizeSpecState(specState);
  const safeEntry = isObject(entry) ? entry : {};
  const type = String(safeEntry.type || '').trim() || 'event';
  const ts = Number.isFinite(Number(safeEntry.ts)) ? Number(safeEntry.ts) : Date.now();
  const payload = isObject(safeEntry.payload) ? safeEntry.payload : {};

  return {
    ...normalizedState,
    history: [...normalizedState.history, { type, ts, payload }].slice(-MAX_HISTORY_LENGTH),
  };
}

export function updateSpecStateInSession(updater) {
  const previous = loadSpecStateFromSession();
  const updated = typeof updater === 'function' ? updater(previous) : previous;
  return persistSpecStateToSession(updated);
}
