import { syntheticReading } from "../lib/synthetic-sleep.ts";
import { applyAction, initialState, snapshot, type Action, type Provider, type WardState } from "../lib/ward.ts";

export const offline = true;
const key = "acorn-offline-v1";

function readWard(): { version: number; state: WardState } {
  const saved = localStorage.getItem(key);
  return saved === null ? { version: 0, state: initialState() } : JSON.parse(saved);
}

export async function loadWard(provider: Provider) {
  const { state, version } = readWard();
  return Response.json(snapshot(state, Date.now(), version, syntheticReading, provider));
}

export async function saveWard(action: Action) {
  return navigator.locks.request(key, () => {
    const { state, version } = readWard();
    if (action.version !== version) return Response.json({ error: "The schedule changed in another tab. Try again." }, { status: 409 });
    const now = Date.now();
    let next: WardState;
    try {
      next = applyAction(state, action, now, syntheticReading);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Invalid action." }, { status: 400 });
    }
    localStorage.setItem(key, JSON.stringify({ version: version + 1, state: next }));
    return Response.json(snapshot(next, now, version + 1, syntheticReading, action.provider));
  });
}
