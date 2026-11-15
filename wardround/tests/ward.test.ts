import assert from "node:assert/strict";
import { test } from "node:test";
import { syntheticReading } from "../lib/synthetic-sleep.ts";
import { applyAction, END, initialState, NURSING_COVERAGE, snapshot, START, studentRoute, walking, type Action, type Provider } from "../lib/ward.ts";

const wallTime = 100_000;
const morning = () => {
  const state = initialState();
  state.clock.minute = 300;
  return state;
};
const view = (state = morning(), provider?: Provider) => snapshot(state, wallTime, 0, syntheticReading, provider);
const task = (id: string, state = morning()) => view(state).tasks.find((item) => item.id === id)!;
const change = (action: Omit<Action, "version">, state = morning()) => applyAction(state, { ...action, version: 0 }, wallTime, syntheticReading);

test("the scheduler reads current synthetic sleep stages and keeps confidence out of the snapshot", () => {
  const start = view();
  assert.equal(start.now, 300);
  assert.equal(start.patients.find((patient) => patient.id === "er")!.signal.stage, "Deep sleep");
  let state = change({ type: "advance", provider: "nurse" });
  state = change({ type: "advance", provider: "nurse" }, state);
  const inspected: number[] = [];
  const updated = snapshot(state, wallTime, 0, (patient, minute) => {
    inspected.push(minute);
    return syntheticReading(patient, minute);
  });
  assert.deepEqual(inspected, [310, 310, 310, 310, 310]);
  assert.equal(updated.patients.find((patient) => patient.id === "er")!.signal.stage, "Light sleep");
  assert.doesNotMatch(JSON.stringify(updated), /deepSleepScore|deepSleepThreshold|forecast/);
});

test("fixed medication stays fixed while flexible tasks can move earlier or later", () => {
  const drawing = initialState();
  drawing.clock.minute = 365;
  assert.deepEqual([task("med", drawing).recommendation.time, task("cmp", drawing).recommendation.time], [360, 370]);
  assert.match(task("cmp", drawing).recommendation.reason, /recheck sleep status/);
  drawing.clock.minute = 360;
  assert.equal(view(drawing).patients.find((patient) => patient.id === "mr")!.signal.stage, "Deep sleep");
  assert.throws(() => change({ type: "edit", provider: "physician", id: "med", time: 355 }), /cannot change/);
  assert.throws(() => change({ type: "edit", provider: "nurse", id: "cmp", time: 410 }), /authorized window/);
  drawing.clock.minute = 365;
  assert.equal(task("cmp", change({ type: "approve", provider: "nurse", id: "cmp", time: 370 }, drawing)).approval?.time, 370);
  drawing.clock.minute = 360;
  const lowScore = snapshot(drawing, wallTime, 0, () => ({ deepSleepScore: 0, stage: "Awake" }));
  assert.equal(lowScore.tasks.find((item) => item.id === "flex")!.recommendation.time, 360);
});

test("staff-assigned rapid decline takes priority over sleep and walking", () => {
  const urgent = view().visits[0];
  assert.equal(urgent.patient.id, "th");
  assert.equal(urgent.patient.signal.stage, "Deep sleep");
  assert.equal(urgent.immediate, true);
  assert.equal(task("resp").recommendation.time, 300);
  let state = change({ type: "priority", provider: "nurse", id: "th", urgency: "routine" });
  state.clock.minute = 330;
  state = change({ type: "priority", provider: "nurse", id: "np", urgency: "critical" }, state);
  const first = view(state, "nurse").visits[0];
  assert.equal(first.patient.id, "np");
  assert.equal(first.patient.signal.stage, "Deep sleep");
  assert.equal(first.task, "Assess now");
  assert.equal(task("cmp", state).recommendation.time, 360);
  assert.throws(() => change({ type: "priority", provider: "student", id: "mr", urgency: "critical" }));
});

test("a routine light-sleep visit takes precedence over an equally due deep-sleep visit", () => {
  const start = view(morning(), "nurse-night-east");
  const routine = start.visits.filter((visit) => visit.taskId === "check" || visit.taskId === "check-e");
  assert.deepEqual(routine.map((visit) => visit.patient.id), ["jw", "er"]);
  assert.equal(routine[0].latest, routine[1].latest);
  assert.ok(routine[0].walk > routine[1].walk);
  assert.equal(task("check").approval?.time, 300);
  assert.equal(task("check-e").recommendation.time, 305);
  assert.equal(task("check-e").approval, undefined);
});

test("two deep-sleep visits are ranked by the backend scores before walking distance", () => {
  const deep = snapshot(morning(), wallTime, 0, (patient, minute) => patient === "jw"
    ? { stage: "Deep sleep", deepSleepScore: 55 }
    : syntheticReading(patient, minute), "nurse-night-east");
  const routine = deep.visits.filter((visit) => visit.taskId === "check" || visit.taskId === "check-e");
  assert.deepEqual(routine.map((visit) => visit.patient.id), ["jw", "er"]);
  assert.ok(routine.every((visit) => visit.patient.signal.stage === "Deep sleep"));
});

test("the discharge appears on the assigned nurse's calendar and supports completion", () => {
  const discharge = task("discharge-j");
  assert.equal(discharge.kind, "discharge");
  assert.equal(discharge.assignedTo, "nurse-east");
  assert.equal(discharge.approval?.time, 660);
  assert.ok(!view(initialState(), "nurse").tasks.some((item) => item.id === discharge.id));
  const leaving = initialState();
  leaving.clock.minute = 660;
  const completed = change({ type: "complete", provider: "nurse-east", id: discharge.id }, leaving);
  assert.equal(task(discharge.id, completed).completedAt, 660);
});

test("provider rosters scope patients, events, actions, locations, and activity", () => {
  const list = (provider?: Provider) => view(initialState(), provider).patients.map((patient) => patient.id);
  assert.deepEqual(list(), ["th", "mr", "np", "er", "jw"]);
  assert.deepEqual(list("nurse"), ["th", "np"]);
  assert.deepEqual(list("nurse-east"), ["mr", "er", "jw"]);
  assert.deepEqual(list("student"), ["mr", "er", "jw"]);
  assert.equal(task("resp").assignedTo, "physician");
  assert.equal(task("cmp").assignedTo, "nurse-night");
  assert.equal(task("med").assignedTo, "nurse-night-east");
  assert.equal(task("round-e").assignedTo, "student");
  const state = change({ type: "visit", provider: "nurse", room: "407" });
  assert.equal(view(state, "nurse").lastRoom, "407");
  assert.equal(view(state, "nurse-east").lastRoom, "station");
  assert.equal(view(state, "nurse-east").activities.length, 0);
  assert.ok(view(state, "nurse").tasks.every((item) => ["th", "np"].includes(item.patient)));
  assert.throws(() => change({ type: "edit", provider: "nurse-east", id: "cmp", time: 365 }));
  assert.throws(() => change({ type: "visit", provider: "student", room: "407" }));
});

test("medical students can propose their own time and physicians can lock it", () => {
  let state = change({ type: "edit", provider: "student", id: "round-m", time: 428 });
  assert.equal(task("round-m", state).proposedAt, 428);
  assert.equal(task("round-m", state).approval, undefined);
  state = change({ type: "acceptProposal", provider: "physician", id: "round-m" }, state);
  state = change({ type: "lock", provider: "physician", id: "round-m" }, state);
  assert.equal(task("round-m", state).approval?.time, 428);
  assert.throws(() => change({ type: "edit", provider: "nurse", id: "round-m", time: 435 }, state), /cannot change/);
});

test("a whole student round accounts for walking, visit duration, and cutoff", () => {
  const original = studentRoute(view());
  assert.equal(original.finish, 472);
  assert.equal(original.visits.filter((visit) => visit.kind === "preround").length, 3);
  assert.ok(original.visits.every((visit) => visit.kind === "preround" ? visit.finish <= 360 : visit.start >= 420));
  assert.equal(original.late, false);
  let state = change({ type: "deadline", provider: "nurse", time: 449 });
  state = change({ type: "visit", provider: "student", room: "403" }, state);
  const route = studentRoute(view(state));
  assert.equal(route.visits[0].walk, 0);
  assert.equal(route.walkingMinutes, original.walkingMinutes - walking("station", "403"));
  assert.equal(route.late, true);
  assert.throws(() => change({ type: "deadline", provider: "student", time: 470 }, state));
});

test("batch approval preserves the already approved time of a live revision", () => {
  const drawing = initialState();
  drawing.clock.minute = 365;
  const state = change({ type: "approveShift", provider: "physician" }, drawing);
  assert.equal(task("cmp", state).approval?.time, 365);
  assert.equal(task("cmp", state).recommendation.time, 370);
  assert.equal(task("round-m", state).approval?.time, 420);
  assert.throws(() => change({ type: "approveShift", provider: "nurse" }));
});

test("a physician can restart the shared scenario", () => {
  const state = change({ type: "advance", provider: "nurse" });
  assert.throws(() => change({ type: "reset", provider: "nurse" }, state));
  assert.deepEqual(change({ type: "reset", provider: "physician" }, state), initialState());
});

test("a saved patient task appears in the ward and receives a sleep-aware suggestion", () => {
  const draft = { label: "Mobility check", kind: "visit", role: "nurse", urgency: "routine",
    earliest: 300, latest: 330, baseline: 300, duration: 8, note: "Help patient sit up" } as const;
  const state = change({ type: "addTask", provider: "nurse-east", id: "er", draft });
  const id = state.addedTasks![0].id;
  const added = view(state, "nurse-east").tasks.find((item) => item.id === id)!;
  assert.equal(added.assignedTo, "nurse-night-east");
  assert.equal(added.label, draft.label);
  assert.equal(added.recommendation.time, 305);
  assert.equal(added.recommendation.sleepDelay, true);
  assert.equal(added.approval, undefined);
  assert.ok(!view(state, "nurse").tasks.some((item) => item.id === id));
  assert.equal(task(id, change({ type: "approve", provider: "nurse-east", id, time: 305 }, state)).approval?.time, 305);
  assert.throws(() => change({ type: "addTask", provider: "nurse", id: "er", draft }), /assigned patient/);
});

test("task creation respects shift periods and fixed approved medication is locked", () => {
  const draft = { label: "Scheduled medication", kind: "medication", role: "nurse", urgency: "routine",
    earliest: 360, latest: 360, baseline: 360, duration: 5, note: "" } as const;
  assert.throws(() => change({ type: "addTask", provider: "physician", id: "mr", draft: { ...draft, kind: "preround" } }), /allowed window/);
  assert.throws(() => change({ type: "addTask", provider: "physician", id: "mr", draft: { ...draft, latest: END } }), /allowed window/);
  const added = change({ type: "addTask", provider: "physician", id: "mr", draft });
  const id = added.addedTasks![0].id;
  const approved = change({ type: "approve", provider: "physician", id, time: 360 }, added);
  assert.deepEqual(task(id, approved).approval, { time: 360, by: "physician", locked: true });
});

test("students propose their own routine work and assignment can add a patient to their roster", () => {
  const draft = { label: "Review intake", kind: "visit", role: "student", urgency: "routine",
    earliest: 405, latest: 440, baseline: 420, duration: 10, note: "" } as const;
  assert.throws(() => change({ type: "addTask", provider: "student", id: "np", draft }), /assigned patient/);
  assert.throws(() => change({ type: "addTask", provider: "student", id: "mr", draft: { ...draft, role: "nurse" } }), /routine tasks/);
  const assigned = change({ type: "addTask", provider: "physician", id: "np", draft });
  assert.ok(view(assigned, "student").patients.some((patient) => patient.id === "np"));
  const proposed = change({ type: "addTask", provider: "student", id: "np", draft }, assigned);
  const id = proposed.addedTasks![1].id;
  assert.equal(task(id, proposed).proposedAt, 420);
  assert.equal(task(id, proposed).approval, undefined);
});

test("the 2 AM overnight examples preserve order windows", () => {
  const state = initialState();
  state.clock.minute = 120;
  const board = view(state);
  const lab = board.tasks.find((item) => item.id === "overnight-lab")!;
  const vitals = board.tasks.find((item) => item.id === "overnight-vitals")!;
  const medication = board.tasks.find((item) => item.id === "overnight-med")!;
  assert.equal(board.now, 120);
  assert.equal(lab.approval?.time, 120);
  assert.equal(lab.recommendation.time, 135);
  assert.equal(lab.recommendation.sleepDelay, true);
  assert.equal(vitals.approval?.time, 135);
  assert.equal(vitals.recommendation.time, 120);
  assert.equal(vitals.recommendation.sleepAdvance, true);
  assert.equal(medication.recommendation.time, 120);
  assert.equal(medication.approval?.locked, true);
});

test("nursing coverage spans the entire day and moving a task across handoff changes its assignee", () => {
  assert.equal(NURSING_COVERAGE[0].start, 0);
  assert.equal(NURSING_COVERAGE.at(-1)?.end, END);
  for (let i = 1; i < NURSING_COVERAGE.length; i++) assert.equal(NURSING_COVERAGE[i - 1].end, NURSING_COVERAGE[i].start);
  const draft = { label: "Handoff vitals", kind: "assessment", role: "nurse", urgency: "routine",
    earliest: 410, latest: 435, baseline: 414, duration: 5, note: "" } as const;
  const added = change({ type: "addTask", provider: "physician", id: "er", draft });
  const id = added.addedTasks![0].id;
  assert.equal(task(id, added).assignedTo, "nurse-night-east");
  assert.ok(view(added, "nurse-night-east").patients.some((patient) => patient.id === "er"));
  assert.ok(!view(added, "nurse-night").patients.some((patient) => patient.id === "er"));
  const moved = change({ type: "edit", provider: "physician", id, time: 425 }, added);
  assert.equal(task(id, moved).assignedTo, "nurse-east");
  const atMidnight = initialState();
  atMidnight.clock.minute = END - 2;
  assert.equal(view(change({ type: "advance", provider: "physician" }, atMidnight)).now, END);
});

test("a legacy morning board gets the night fixtures while saved changes keep their time", () => {
  const prior = morning();
  delete prior.plan["before-dawn-nina"];
  delete prior.plan["overnight-lab"];
  delete prior.plan["overnight-med"];
  assert.equal(snapshot(prior, wallTime, 0, syntheticReading).now, START);
  const edited = snapshot(prior, wallTime, 1, syntheticReading);
  assert.equal(edited.now, 300);
  assert.equal(edited.tasks.find((item) => item.id === "overnight-med")?.approval?.locked, true);
});

test("the demo offers Nina's matching bedside check first and offers Marcus once his stage changes", () => {
  const state = initialState();
  const before = view(state);
  assert.equal(before.now, 295);
  const marcus = before.patients.find((patient) => patient.id === "mr")!;
  const nina = before.patients.find((patient) => patient.id === "np")!;
  assert.equal(marcus.signal.stage, "Deep sleep");
  assert.equal(nina.signal.stage, "Light sleep");
  const checks = before.visits.filter((visit) => visit.taskId?.startsWith("before-dawn-"));
  assert.deepEqual(checks.map((visit) => visit.taskId), ["before-dawn-nina", "before-dawn-marcus"]);
  assert.equal(checks[0].latest, checks[1].latest);
  assert.equal(task("before-dawn-nina", state).recommendation.readyNow, true);
  assert.equal(task("before-dawn-marcus", state).recommendation.sleepDelay, true);

  const advanced = change({ type: "advance", provider: "physician" }, state);
  assert.equal(view(advanced).patients.find((patient) => patient.id === "mr")?.signal.stage, "Light sleep");
  const after = task("before-dawn-marcus", advanced);
  assert.equal(after.recommendation.time, 300);
  assert.equal(after.recommendation.readyNow, true);
  assert.equal(after.recommendation.sleepDelay, undefined);
  assert.equal(task("med", advanced).approval?.time, 360);
});

test("the demo atorvastatin can move only within its simulated medication order", () => {
  const state = initialState();
  state.clock.minute = 310;
  const statin = task("routine-statin", state);
  assert.deepEqual([statin.earliest, statin.latest], [300, 390]);
  assert.equal(statin.approval?.time, 315);
  assert.equal(statin.recommendation.time, 310);
  assert.equal(statin.recommendation.readyNow, true);
  assert.throws(() => change({ type: "edit", provider: "physician", id: statin.id, time: 391 }, state), /authorized window/);
});
