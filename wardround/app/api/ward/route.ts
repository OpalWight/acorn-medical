import { env } from "cloudflare:workers";
import { syntheticReading } from "../../../lib/synthetic-sleep";
import { applyAction, initialState, PROVIDERS, snapshot, type Action, type Provider, type WardState } from "../../../lib/ward";

export const dynamic = "force-dynamic";

// The synthetic shift has its own plan so the earlier demo can keep its saved edits.
const SHIFT_ID = 2;

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

async function readWard() {
  const db = env.DB;
  if (!db) throw new Error("The ward database binding is missing.");
  const read = () => db.prepare("SELECT version, state FROM ward WHERE id = ?").bind(SHIFT_ID).first<{ version: number; state: string }>();
  let row = await read();
  if (!row) {
    await db.prepare("INSERT OR IGNORE INTO ward (id, version, state) VALUES (?, 0, ?)").bind(SHIFT_ID, JSON.stringify(initialState())).run();
    row = await read();
  }
  if (!row) throw new Error("The ward state could not be loaded.");
  return { db, version: row.version, state: JSON.parse(row.state) as WardState };
}

export async function GET(request: Request) {
  const provider = new URL(request.url).searchParams.get("provider") ?? "physician";
  if (!Object.hasOwn(PROVIDERS, provider)) return reply({ error: "Invalid provider." }, 400);
  try {
    const { state, version } = await readWard();
    return reply(snapshot(state, Date.now(), version, syntheticReading, provider as Provider));
  } catch (error) {
    console.error(error);
    return reply({ error: "Could not connect to the ward database." }, 503);
  }
}

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "Expected a JSON action." }, 415);
  const action = await request.json().catch(() => null) as Action | null;
  if (!action || typeof action.provider !== "string" || !Object.hasOwn(PROVIDERS, action.provider) || !Number.isInteger(action.version)) return reply({ error: "Invalid staff action." }, 400);
  try {
    const { db, state, version } = await readWard();
    if (action.version !== version) return reply({ error: "The ward changed. Review the refreshed plan and try again." }, 409);
    const now = Date.now();
    let next: WardState;
    try {
      next = applyAction(state, action, now, syntheticReading);
    } catch (error) {
      return reply({ error: error instanceof Error ? error.message : "Invalid action." }, 400);
    }
    const update = await db.prepare("UPDATE ward SET state = ?, version = version + 1 WHERE id = ? AND version = ?")
      .bind(JSON.stringify(next), SHIFT_ID, version).run();
    if (update.meta.changes !== 1) return reply({ error: "Another staff session saved a change first. Review the refreshed plan." }, 409);
    return reply(snapshot(next, now, version + 1, syntheticReading, action.provider));
  } catch (error) {
    console.error(error);
    return reply({ error: "Could not save the ward change." }, 503);
  }
}
