import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarSelection, layoutEvents } from "../lib/calendar.ts";
import { syntheticReading } from "../lib/synthetic-sleep.ts";
import { initialState, snapshot } from "../lib/ward.ts";

test("approved events use their approved time and overlapping cards have separate lanes", () => {
  const state = initialState();
  state.clock.minute = 365;
  const board = snapshot(state, 0, 0, syntheticReading);
  const lab = board.tasks.find((task) => task.id === "cmp")!;
  assert.equal(lab.recommendation.time, 370);
  const [a, b, c] = layoutEvents([
    lab,
    { ...lab, id: "another", approval: { time: 370, by: "nurse", locked: false } },
    { ...lab, id: "later", approval: { time: 390, by: "nurse", locked: false } },
  ]);
  assert.deepEqual([a.time, a.lane, a.lanes], [365, 0, 2]);
  assert.deepEqual([b.time, b.lane, b.lanes], [370, 1, 2]);
  assert.deepEqual([c.time, c.lane, c.lanes], [390, 0, 1]);
});

test("dragging a blank slot snaps to five minutes and stays inside the available period", () => {
  assert.deepEqual(calendarSelection(125, 148, 120, 240, true), { start: 125, duration: 25 });
  assert.deepEqual(calendarSelection(150, 119, 120, 240, true), { start: 120, duration: 30 });
  assert.deepEqual(calendarSelection(235, 245, 120, 240, true), { start: 235, duration: 5 });
  assert.deepEqual(calendarSelection(125, 125, 120, 240, false), { start: 125, duration: 15 });
});
