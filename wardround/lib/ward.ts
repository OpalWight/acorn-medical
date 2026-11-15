export const STAFF = {
  physician: "Physician / resident",
  nurse: "Nurse",
  student: "Medical student",
} as const;
export type Role = keyof typeof STAFF;
export const PROVIDERS = {
  physician: { name: "Dr. Avery Brooks", role: "physician" },
  nurse: { name: "Maya Chen, RN", role: "nurse" },
  "nurse-east": { name: "Samira Davis, RN", role: "nurse" },
  "nurse-night": { name: "Sofia Martinez, RN", role: "nurse" },
  "nurse-night-east": { name: "Jordan Okafor, RN", role: "nurse" },
  student: { name: "Jordan Ellis", role: "student" },
} as const satisfies Record<string, { name: string; role: Role }>;
export type Provider = keyof typeof PROVIDERS;
export const PRIORITIES = { routine: "Routine", elevated: "Elevated", critical: "Rapid decline" } as const;
export type Urgency = keyof typeof PRIORITIES;
export type Stage = "Awake" | "Light sleep" | "Deep sleep" | "REM sleep";
export type ReadSleep = (patientId: string, minute: number) => {
  deepSleepScore: number;
  stage: Stage;
};

export const START = 295;
export const END = 1440;
const PREROUNDS = { start: 240, end: 360 };
const ROUNDS = { start: 420, end: 720 };
export const NURSING_COVERAGE = [
  { start: 0, end: 420, label: "Night shift", hours: "7 PM–7 AM", nurses: ["nurse-night", "nurse-night-east"] },
  { start: 420, end: 1140, label: "Day shift", hours: "7 AM–7 PM", nurses: ["nurse", "nurse-east"] },
  { start: 1140, end: END, label: "Night shift", hours: "7 PM–7 AM", nurses: ["nurse-night", "nurse-night-east"] },
] as const;

function assignedNurse(dayNurse: Provider, minute: number) {
  const shift = NURSING_COVERAGE.find(({ start, end }) => minute >= start && minute < end) ?? NURSING_COVERAGE[2];
  return shift.nurses[dayNurse === "nurse-east" ? 1 : 0];
}
const REPORTING_RATE = 12_000;
const RANK: Record<Urgency, number> = { critical: 0, elevated: 1, routine: 2 };
const SLEEP_COST: Record<Stage, number> = { Awake: 0, "Light sleep": 1, "Deep sleep": 3, "REM sleep": 2 };

export const PATIENTS = [
  { id: "th", name: "Thomas Hayes", initials: "TH", room: "401", context: "Pneumonia observation", color: "plum", corridor: 1, urgency: "critical", pulse: 88, nurse: "nurse" },
  { id: "mr", name: "Marcus Reed", initials: "MR", room: "403", context: "Postoperative observation", color: "blue", corridor: 3, urgency: "routine", pulse: 72, nurse: "nurse-east" },
  { id: "np", name: "Nina Patel", initials: "NP", room: "407", context: "Chemotherapy observation", color: "violet", corridor: 7, urgency: "routine", pulse: 64, nurse: "nurse" },
  { id: "er", name: "Elena Rivera", initials: "ER", room: "409", context: "Dehydration observation", color: "teal", corridor: 8, urgency: "routine", pulse: 68, nurse: "nurse-east" },
  { id: "jw", name: "James Wilson", initials: "JW", room: "412", context: "Heart failure observation", color: "sand", corridor: 11, urgency: "routine", pulse: 70, nurse: "nurse-east" },
] as const satisfies readonly { id: string; name: string; initials: string; room: string; context: string; color: string; corridor: number; urgency: Urgency; pulse: number; nurse: Provider }[];

export const TASK_KINDS = {
  visit: "Visit",
  assessment: "Assessment",
  medication: "Medication",
  lab: "Lab",
  preround: "Prerounds",
  round: "Rounds",
  discharge: "Discharge",
} as const;

export type Task = {
  id: string; patient: string; label: string; kind: keyof typeof TASK_KINDS; role: Role; urgency: Urgency;
  earliest: number; latest: number; baseline: number; duration: number; note: string; approved?: boolean;
};
export type TaskDraft = Omit<Task, "id" | "patient" | "approved">;

export function isStudentRound(task: Task) {
  return task.role === "student" && (task.kind === "preround" || task.kind === "round");
}

export function taskBounds(kind: Task["kind"]) {
  if (kind === "preround") return PREROUNDS;
  if (kind === "round") return ROUNDS;
  return { start: 0, end: END };
}

export const TASKS: Task[] = [
  { id: "overnight-lab", patient: "np", label: "Routine lab draw", kind: "lab", role: "nurse", urgency: "routine", earliest: 120, latest: 160, baseline: 120, duration: 6, note: "The simulated order allows collection from 2:00 to 2:40 AM.", approved: true },
  { id: "overnight-vitals", patient: "jw", label: "Overnight vitals", kind: "assessment", role: "nurse", urgency: "routine", earliest: 120, latest: 160, baseline: 135, duration: 5, note: "A routine check with a flexible collection window.", approved: true },
  { id: "overnight-med", patient: "mr", label: "Scheduled medication", kind: "medication", role: "nurse", urgency: "elevated", earliest: 120, latest: 120, baseline: 120, duration: 4, note: "Fixed 2:00 AM start per simulated order.", approved: true },
  { id: "afternoon-mobility", patient: "er", label: "Mobility check", kind: "visit", role: "nurse", urgency: "routine", earliest: 840, latest: 910, baseline: 870, duration: 10, note: "Assist with mobility when the patient is available.", approved: true },
  { id: "late-check", patient: "np", label: "Late comfort check", kind: "visit", role: "nurse", urgency: "routine", earliest: 1390, latest: 1425, baseline: 1395, duration: 5, note: "Bedside comfort check with a flexible window before midnight.", approved: true },
  { id: "before-dawn-nina", patient: "np", label: "Bedside check", kind: "assessment", role: "nurse", urgency: "routine", earliest: 295, latest: 320, baseline: 295, duration: 4, note: "This routine check can start whenever Nina is ready within the allowed window.", approved: true },
  { id: "before-dawn-marcus", patient: "mr", label: "Bedside check", kind: "assessment", role: "nurse", urgency: "routine", earliest: 295, latest: 320, baseline: 295, duration: 4, note: "This routine check can wait for a lighter sleep stage within the allowed window." },
  { id: "routine-statin", patient: "er", label: "Routine atorvastatin", kind: "medication", role: "nurse", urgency: "routine", earliest: 300, latest: 390, baseline: 315, duration: 4, note: "The window is set by the simulated care order. U.S. labeling permits once-daily atorvastatin at any time of day, with or without food, so the demo order allows time to wait for a lighter sleep stage.", approved: true },
  { id: "resp", patient: "th", label: "Respiratory assessment", kind: "assessment", role: "physician", urgency: "critical", earliest: 300, latest: 300, baseline: 300, duration: 10, note: "Immediate bedside assessment entered by the care team", approved: true },
  { id: "med", patient: "mr", label: "Time-critical medication", kind: "medication", role: "nurse", urgency: "critical", earliest: 360, latest: 360, baseline: 360, duration: 4, note: "Exact start per simulated order", approved: true },
  { id: "cmp", patient: "np", label: "Daily CMP draw", kind: "lab", role: "nurse", urgency: "routine", earliest: 360, latest: 409, baseline: 365, duration: 6, note: "Collection pending · result pending", approved: true },
  { id: "flex", patient: "er", label: "Flexible medication", kind: "medication", role: "nurse", urgency: "routine", earliest: 355, latest: 390, baseline: 370, duration: 5, note: "Earlier and later starts allowed by the simulated order", approved: true },
  { id: "check", patient: "jw", label: "Routine nursing check", kind: "assessment", role: "nurse", urgency: "routine", earliest: 300, latest: 330, baseline: 300, duration: 3, note: "Bedside vitals check", approved: true },
  { id: "check-e", patient: "er", label: "Routine nursing check", kind: "assessment", role: "nurse", urgency: "routine", earliest: 300, latest: 330, baseline: 300, duration: 3, note: "Bedside vitals check" },
  { id: "pre-m", patient: "mr", label: "Student preround", kind: "preround", role: "student", urgency: "routine", earliest: 285, latest: 330, baseline: 310, duration: 8, note: "Review overnight events and prepare for rounds", approved: true },
  { id: "pre-e", patient: "er", label: "Student preround", kind: "preround", role: "student", urgency: "routine", earliest: 305, latest: 340, baseline: 325, duration: 8, note: "Review overnight events and prepare for rounds" },
  { id: "pre-j", patient: "jw", label: "Student preround", kind: "preround", role: "student", urgency: "routine", earliest: 315, latest: 352, baseline: 340, duration: 8, note: "Review overnight events and prepare for rounds" },
  { id: "round-m", patient: "mr", label: "Student rounds", kind: "round", role: "student", urgency: "routine", earliest: 420, latest: 449, baseline: 420, duration: 12, note: "Assigned to the medical student" },
  { id: "round-e", patient: "er", label: "Student rounds", kind: "round", role: "student", urgency: "routine", earliest: 425, latest: 461, baseline: 440, duration: 12, note: "Assigned to the medical student" },
  { id: "round-j", patient: "jw", label: "Student rounds", kind: "round", role: "student", urgency: "routine", earliest: 435, latest: 468, baseline: 460, duration: 12, note: "Assigned to the medical student" },
  { id: "resident", patient: "th", label: "Physician rounds", kind: "round", role: "physician", urgency: "elevated", earliest: 480, latest: 540, baseline: 510, duration: 15, note: "Adult medicine rounds", approved: true },
  { id: "chemo", patient: "np", label: "Chemotherapy readiness review", kind: "round", role: "physician", urgency: "elevated", earliest: 525, latest: 585, baseline: 540, duration: 15, note: "Simulated readiness review prior to treatment", approved: true },
  { id: "discharge-j", patient: "jw", label: "Discharge", kind: "discharge", role: "nurse", urgency: "routine", earliest: 630, latest: 690, baseline: 660, duration: 20, note: "Review discharge instructions and confirm transport after the discharge order.", approved: true },
];

type PlanEntry = { time: number; by: Role; locked: boolean };
const DEFAULT_PLAN: Record<string, PlanEntry> = Object.fromEntries(TASKS.filter((task) => task.approved)
  .map((task) => [task.id, { time: task.baseline, by: "physician", locked: task.earliest === task.latest }]));
type Entry = { id: string; minute: number; role: Role; text: string; provider?: Provider; patientId?: string };
export type WardState = {
  clock: { minute: number; playingSince: number | null };
  urgency: Partial<Record<string, Urgency>>;
  plan: Record<string, PlanEntry>;
  proposals: Record<string, number>;
  visited: Partial<Record<Provider, string>>;
  completed: Record<string, number>;
  addedTasks?: Task[];
  deadline: number;
  activities: Entry[];
};
export function initialState(): WardState {
  return {
    clock: { minute: START, playingSince: null },
    urgency: {},
    plan: structuredClone(DEFAULT_PLAN),
    proposals: {},
    visited: { physician: "station", nurse: "station", student: "station" },
    completed: {},
    deadline: 480,
    activities: [{ id: "start", minute: START, role: "physician", text: "Loaded the 24-hour care plan." }],
  };
}
export function clockMinute(state: WardState, wallTime: number) {
  const { minute, playingSince } = state.clock;
  return playingSince === null ? minute : Math.min(END, minute + Math.max(0, Math.floor((wallTime - playingSince) / REPORTING_RATE)));
}
export function timeLabel(minute: number) {
  const hour = Math.floor(minute / 60) % 24;
  return `${hour % 12 || 12}:${String(minute % 60).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}
export function timeInput(minute: number) {
  return `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}
export function walking(from: string | undefined, to: string) {
  const point = (room?: string) => PATIENTS.find((patient) => patient.room === room)?.corridor ?? 0;
  return from === to ? 0 : Math.max(1, Math.ceil(Math.abs(point(from) - point(to)) / 2));
}
function suggest(task: Task, baseline: number, now: number, stage: Stage, urgency: Urgency) {
  if (task.earliest === task.latest) return { time: baseline, reason: "Fixed time from the care plan." };
  if (now > task.latest) return { time: null, reason: "Allowed window passed. Review with the care team." };

  const earliest = Math.max(now, task.earliest);
  if (urgency === "critical") return { time: earliest, reason: "Use the first allowed time for this priority." };

  const planned = Math.max(earliest, baseline);
  const recheck = now + 5;
  if (stage === "Deep sleep" && planned < recheck && planned < task.latest) {
    const overnight = now < PREROUNDS.start || now >= NURSING_COVERAGE[2].start;
    const deferred = Math.min(overnight ? now + 15 : recheck, task.latest);
    return { time: deferred, sleepDelay: true, reason: "Patient is in deep sleep. Consider a short delay and recheck sleep status before the visit." };
  }
  const earlier = Math.max(earliest, baseline - 15);
  if ((stage === "Awake" || stage === "Light sleep") && (planned === now || (earlier < planned && earlier < recheck))) {
    return { time: earlier, sleepAdvance: earlier < planned, readyNow: earlier === now,
      reason: stage === "Awake" ? "The patient is awake now." : "The patient is in light sleep now." };
  }
  return { time: planned, reason: planned > baseline ? "Next available start inside the task window." : "Planned time fits the task window." };
}

function buildBoard(state: WardState, wallTime: number, version: number, readSleep: ReadSleep, provider: Provider) {
  const untouchedDemo = version === 0 && state.clock.playingSince === null && !state.plan["before-dawn-nina"] &&
    (state.clock.minute === 120 || state.clock.minute === 300);
  const now = untouchedDemo ? START : clockMinute(state, wallTime);
  const sleepScores = new Map<string, number>();
  const careTasks = [...TASKS, ...(state.addedTasks ?? [])];
  const roster = PATIENTS.filter((patient) => provider === "physician" || NURSING_COVERAGE.some(({ start }) => provider === assignedNurse(patient.nurse, start)) ||
    provider === "student" && careTasks.some((task) => task.patient === patient.id && task.role === "student"));
  const patients = roster.map(({ corridor, pulse, ...patient }) => {
    const { deepSleepScore, stage } = readSleep(patient.id, now);
    sleepScores.set(patient.id, deepSleepScore);
    const signal = { stage, pulse: pulse + (stage === "Awake" ? 4 : 0) + now % 3 - 1, observedAt: now };
    const defaultUrgency = patient.id === "th" && now < 300 ? "routine" : patient.urgency;
    return { ...patient, urgency: state.urgency[patient.id] ?? defaultUrgency, signal };
  });
  const tasks = careTasks.flatMap((task) => {
    const patient = patients.find((person) => person.id === task.patient);
    if (!patient) return [];
    const approval = state.plan[task.id] ?? DEFAULT_PLAN[task.id];
    const baseline = approval?.time ?? task.baseline;
    const priority = RANK[task.urgency] < RANK[patient.urgency] ? task.urgency : patient.urgency;
    const recommendation = suggest(task, baseline, now, patient.signal.stage, priority);
    const completedAt = state.completed[task.id];
    const proposedAt = state.proposals[task.id];
    const assignedTo = task.role === "nurse"
      ? assignedNurse(patient.nurse, completedAt ?? approval?.time ?? recommendation.time ?? task.baseline)
      : task.role;
    const revision = completedAt === undefined && !approval?.locked && recommendation.time !== null && recommendation.time >= now && (!approval || recommendation.time !== approval.time);
    const note = task.id === "cmp" && completedAt !== undefined ? "Collected · result pending" : task.note;
    return [{ ...task, assignedTo, note, priority, approval, proposedAt, completedAt, recommendation, revision }];
  });
  const lastRoom = (id: Provider) => patients.find((patient) => patient.room === state.visited[id])?.room ?? "station";
  const activities = provider === "physician" ? state.activities : state.activities.filter((entry) =>
    entry.provider === provider || patients.some((patient) => patient.id === entry.patientId));
  const board = { now, version, provider, playing: state.clock.playingSince !== null && now < END, patients, tasks,
    deadline: state.deadline, lastRoom: lastRoom(provider), studentRoom: lastRoom("student"), activities };
  return { board, sleepScores };
}

export function snapshot(state: WardState, wallTime: number, version: number, readSleep: ReadSleep, provider: Provider = "physician") {
  const { board, sleepScores } = buildBoard(state, wallTime, version, readSleep, provider);
  return { ...board, visits: rankVisits(board, sleepScores) };
}
export type Snapshot = ReturnType<typeof snapshot>;

function rankVisits(board: ReturnType<typeof buildBoard>["board"], sleepScores: Map<string, number>) {
  type Visit = {
    patient: typeof board.patients[number]; task: string; taskId?: string; urgency: Urgency;
    time: number; latest: number; walk: number; sleep: number; immediate: boolean;
  };
  const choices = board.patients.flatMap<Visit>((patient) => {
    const walk = walking(board.lastRoom, patient.room);
    if (patient.urgency === "critical") {
      return [{ patient, task: "Assess now", urgency: "critical", time: board.now, latest: board.now, walk, sleep: 0, immediate: true }];
    }
    const task = board.tasks.filter((item) => item.patient === patient.id && item.completedAt === undefined && item.latest >= board.now &&
        (board.provider === "physician" || item.assignedTo === board.provider))
      .sort((a, b) => Number(a.earliest > board.now) - Number(b.earliest > board.now) ||
        RANK[a.priority] - RANK[b.priority] || a.latest - b.latest)[0];
    if (!task) return [];
    return [{ patient, task: task.label, taskId: task.id, urgency: task.priority, time: task.approval?.time ?? task.recommendation.time ?? task.baseline,
      latest: task.latest, walk, sleep: SLEEP_COST[patient.signal.stage], immediate: false }];
  });
  choices.sort((a, b) => Number(b.immediate) - Number(a.immediate) || RANK[a.urgency] - RANK[b.urgency]
    || Math.floor((a.latest - board.now) / 10) - Math.floor((b.latest - board.now) / 10)
    || a.sleep - b.sleep
    || (a.sleep === SLEEP_COST["Deep sleep"] && b.sleep === a.sleep ? sleepScores.get(a.patient.id)! - sleepScores.get(b.patient.id)! : 0)
    || a.walk - b.walk || a.latest - b.latest);
  return choices.map(({ sleep, ...visit }) => visit);
}

export function studentRoute(board: Snapshot) {
  let room: string = board.studentRoom;
  let finish = board.now;
  let walkingMinutes = 0;
  const rounds = board.tasks.filter(isStudentRound);
  const pending = rounds.filter((task) => task.completedAt === undefined)
    .map((task) => ({ ...task, planned: task.proposedAt ?? task.approval?.time ?? task.recommendation.time ?? task.baseline }))
    .sort((a, b) => a.planned - b.planned || a.latest - b.latest);
  const visits = pending.map((task) => {
    const patient = board.patients.find((person) => person.id === task.patient)!;
    const walk = walking(room, patient.room);
    const start = Math.max(finish + walk, task.planned, task.earliest);
    finish = start + task.duration;
    walkingMinutes += walk;
    room = patient.room;
    return { task: task.id, kind: task.kind, patient, walk, start, finish, conflict: start > task.latest, proposed: task.proposedAt !== undefined };
  });
  if (visits.length === 0) finish = Math.max(START, ...rounds.map((task) => task.completedAt ?? START));
  return { visits, finish, walkingMinutes, late: finish > board.deadline || visits.some((visit) => visit.conflict) };
}

export type Action = {
  type: "addTask" | "priority" | "approve" | "edit" | "acceptProposal" | "approveShift" | "lock" | "deadline" | "visit" | "complete" | "advance" | "play" | "pause" | "reset";
  provider: Provider; version: number; id?: string; room?: string; time?: number; urgency?: Urgency; draft?: TaskDraft;
};
export function canChange(role: Role, task: Snapshot["tasks"][number]) {
  if (task.completedAt !== undefined) return false;
  if (task.approval?.locked) return false;
  return role !== "student" || task.role === "student";
}
export function applyAction(state: WardState, action: Action, wallTime: number, readSleep: ReadSleep) {
  const { provider } = action;
  const { role } = PROVIDERS[provider];
  const { board } = buildBoard(state, wallTime, action.version, readSleep, provider);
  const now = board.now;
  const task = board.tasks.find((item) => item.id === action.id);
  const patient = board.patients.find((person) => person.id === action.id);
  const next = structuredClone(state);
  if (next.clock.playingSince === null) next.clock.minute = now;
  let log = "";
  switch (action.type) {
    case "addTask": {
      const draft = action.draft;
      if (!patient || !draft || typeof draft.label !== "string" || typeof draft.note !== "string") throw new Error("Choose an assigned patient and enter the task details.");
      const { kind, role: assignee, urgency, earliest, latest, baseline, duration } = draft;
      const label = draft.label.trim();
      const note = draft.note.trim();
      if (!label || label.length > 80 || note.length > 500) throw new Error("Enter a task name of up to 80 characters and notes of up to 500 characters.");
      if (!Object.hasOwn(TASK_KINDS, kind) || !Object.hasOwn(STAFF, assignee) || !Object.hasOwn(RANK, urgency)) throw new Error("Choose an allowed task type, provider and priority.");
      if (role === "student" && (assignee !== "student" || urgency !== "routine")) throw new Error("Students can propose routine tasks assigned to themselves.");
      const { start, end } = taskBounds(kind);
      if (![earliest, latest, baseline, duration].every(Number.isInteger) || duration < 1 || earliest < start || baseline < Math.max(now, earliest) || baseline > latest || latest + duration > end) {
        throw new Error("Choose a start within the allowed window and leave enough time to finish by the end of the period.");
      }
      const id = crypto.randomUUID();
      const added = { id, patient: patient.id, label, kind, role: assignee, urgency, earliest, latest, baseline, duration, note };
      (next.addedTasks ??= []).push(added);
      if (role === "student") next.proposals[id] = baseline;
      log = `${role === "student" ? "Proposed" : "Added"} ${label} for ${patient.name}.`;
      break;
    }
    case "priority":
      if (role === "student" || !patient || !action.urgency || !Object.hasOwn(RANK, action.urgency)) throw new Error("Choose a patient and an allowed priority.");
      next.urgency[patient.id] = action.urgency;
      log = `${patient.name} set to ${PRIORITIES[action.urgency].toLowerCase()}.`;
      break;
    case "edit":
    case "approve":
    case "acceptProposal": {
      if (!task || !canChange(role, task)) throw new Error("This role cannot change the selected task.");
      if (action.type === "acceptProposal" && role === "student") throw new Error("A physician or nurse must approve student proposals.");
      const time = action.type === "acceptProposal" ? task.proposedAt : action.time;
      if (!Number.isInteger(time) || time! < Math.max(now, task.earliest) || time! > task.latest) throw new Error("Choose a future time inside the authorized window.");
      if (action.type === "approve" && time !== task.recommendation.time) throw new Error("The live suggestion changed. Review the refreshed time.");
      if (role === "student") next.proposals[task.id] = time!;
      else {
        next.plan[task.id] = { time: time!, by: role, locked: task.earliest === task.latest };
        delete next.proposals[task.id];
      }
      log = `${role === "student" ? "Proposed" : "Approved"} ${task.label.toLowerCase()} for ${timeLabel(time!)}.`;
      break;
    }
    case "approveShift": {
      if (role !== "physician") throw new Error("A physician approves the shift plan.");
      const drafts = board.tasks.filter((item) => !item.approval && item.completedAt === undefined && item.recommendation.time !== null && item.recommendation.time >= now);
      if (drafts.length === 0) throw new Error("The shift has no eligible drafts to approve.");
      for (const draft of drafts) {
        next.plan[draft.id] = { time: draft.recommendation.time!, by: role, locked: draft.earliest === draft.latest };
        delete next.proposals[draft.id];
      }
      log = `Approved ${drafts.length} draft tasks in the shift plan.`;
      break;
    }
    case "lock":
      if (role !== "physician" || !task?.approval || task.earliest === task.latest || task.completedAt !== undefined) throw new Error("A physician can lock or unlock an approved flexible task.");
      next.plan[task.id] = { ...task.approval, locked: !task.approval.locked };
      log = `${next.plan[task.id].locked ? "Locked" : "Unlocked"} ${task.label.toLowerCase()}.`;
      break;
    case "deadline":
      if (role === "student" || !Number.isInteger(action.time) || action.time! < now || action.time! > ROUNDS.end) throw new Error("Choose a future deadline by noon.");
      next.deadline = action.time!;
      log = `Student rounds deadline set to ${timeLabel(next.deadline)}.`;
      break;
    case "visit":
      if (!action.room || !board.patients.some((person) => person.room === action.room)) throw new Error("Choose an assigned room.");
      next.visited[provider] = action.room;
      log = `Recorded a visit to room ${action.room}.`;
      break;
    case "complete":
      if (!task || (role !== "physician" && provider !== task.assignedTo) || task.completedAt !== undefined || now < task.earliest) throw new Error("This task cannot be marked complete at this time.");
      if (task.earliest === task.latest && !task.approval) throw new Error("This task has no approved time.");
      next.completed[task.id] = now;
      next.visited[provider] = board.patients.find((person) => person.id === task.patient)!.room;
      log = `Recorded ${task.label.toLowerCase()} complete.`;
      break;
    case "reset":
      if (role !== "physician") throw new Error("A physician can restart the shared demo.");
      return initialState();
    case "advance":
      next.clock = { minute: Math.min(END, now + 5), playingSince: board.playing ? wallTime : null };
      break;
    case "play":
      next.clock = { minute: now, playingSince: now < END ? wallTime : null };
      break;
    case "pause":
      next.clock = { minute: now, playingSince: null };
      break;
    default:
      throw new Error("Unknown ward action.");
  }
  if (log) next.activities = [{ id: `v${action.version + 1}`, minute: now, role, provider, patientId: patient?.id ?? task?.patient ?? board.patients.find((person) => person.room === action.room)?.id, text: log }, ...next.activities].slice(0, 25);
  return next;
}
