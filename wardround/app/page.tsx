"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDown, ArrowRight, Check, ChevronRight, CircleAlert, ExternalLink,
  Footprints, LockKeyhole, PanelLeft, Plus, X,
} from "lucide-react";
import {
  applyAction, canChange, END, initialState, PRIORITIES, PROVIDERS, snapshot, STAFF, timeInput, timeLabel, walking,
  type Action, type Provider, type Role, type Snapshot, type Urgency,
} from "../lib/ward";
import { eventTime } from "../lib/calendar";
import { syntheticReading } from "../lib/synthetic-sleep";
import { loadWard, offline, saveWard } from "../lib/ward-client";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { NativeSelect, NativeSelectOption } from "../components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../components/ui/sheet";

import { CalendarControls, ShiftCalendar, ShiftClock } from "./shift-calendar";
import { TaskForm } from "./task-form";
import { Tutorial, tutorialSteps } from "./tutorial";

type View = "calendar" | "patients" | "agenda";
type Patient = Snapshot["patients"][number];
type Task = Snapshot["tasks"][number];
type Command = Omit<Action, "version" | "provider">;
type TaskSlot = { start: number; duration?: number };

const NAV = [
  { id: "calendar", text: "Calendar" },
  { id: "patients", text: "Patients" },
  { id: "agenda", text: "Agenda" },
] as const;

function Priority({ value }: { value: Urgency }) {
  return <Badge variant="outline" className={`pill priority ${value}`}><i />{PRIORITIES[value]}</Badge>;
}

function Sleep({ patient }: { patient: Patient }) {
  const { stage } = patient.signal;
  return <Badge variant="outline" className={`pill sleep ${stage.toLowerCase().replace(" ", "-")}`}>{stage}</Badge>;
}

function PatientsView({ board, busy, toggle, advance, onSelect }: {
  board: Snapshot; busy: boolean; toggle: () => void; advance: () => void; onSelect: (patientId: string) => void;
}) {
  return <section className="card patient-roster" aria-labelledby="patients-heading">
    <header className="calendar-toolbar">
      <h1 id="patients-heading">Patients</h1>
      <ShiftClock now={board.now} playing={board.playing} busy={busy} toggle={toggle} advance={advance} />
    </header>
    {board.patients.length === 0 ? <p className="empty">No patients assigned.</p> : <>
      <div className="table-scroll"><table>
        <thead><tr><th scope="col">Patient</th><th scope="col">Sleep stage</th><th scope="col">Urgency</th><th scope="col" className="roster-walk">Walk</th></tr></thead>
        <tbody>{board.patients.map((patient) => <tr key={patient.id}>
          <td><button type="button" className="patient-name" onClick={() => onSelect(patient.id)} aria-label={`Open ${patient.name}, room ${patient.room}`}>
            <span><strong>{patient.name}</strong><small>Room {patient.room}</small></span><ChevronRight size={14} aria-hidden="true" />
          </button></td>
          <td><Sleep patient={patient} /></td>
          <td><Priority value={patient.urgency} /></td>
          <td className="roster-walk">{walking(board.lastRoom, patient.room)} min</td>
        </tr>)}</tbody>
      </table></div>
      <p className="table-footer roster-walk">Walking times from {board.lastRoom === "station" ? "the nurses’ station" : `room ${board.lastRoom}`}</p>
    </>}
  </section>;
}

function Card({ title, note, icon, className = "", children }: { title: string; note?: string; icon?: ReactNode; className?: string; children: ReactNode }) {
  return <section className={`card ${className}`}><div className="card-title"><div><h2>{title}</h2>{note && <p>{note}</p>}</div>{icon}</div>{children}</section>;
}

function minutes(value: string) {
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

function shortTime(value: number) {
  return timeLabel(value).replace(/ [AP]M$/, "");
}

function formatWindow(task: Task) {
  return task.earliest === task.latest ? timeLabel(task.earliest) : `${shortTime(task.earliest)}–${timeLabel(task.latest)}`;
}

function PatientDialog({ patient, board, role, taskId, startAdding, returnFocus, onShowAll, onClose, onAction, onAdd, practice, busy, actionError }: {
  patient: Patient; board: Snapshot; role: Role; taskId?: string; startAdding?: TaskSlot; returnFocus: HTMLElement | null; onShowAll: () => void; onClose: () => void;
  onAction: (command: Command) => Promise<boolean>; onAdd: () => void; practice: boolean; busy: boolean; actionError: string;
}) {
  const [adding, setAdding] = useState(startAdding !== undefined);
  const [editing, setEditing] = useState<string | null>(null);
  const [editTime, setEditTime] = useState("");
  const tasks = board.tasks.filter((task) => task.patient === patient.id && (!taskId || task.id === taskId));
  const selectedTask = taskId ? tasks[0] : undefined;
  const saveTime = async (event: FormEvent, task: Task) => {
    event.preventDefault();
    if (await onAction({ type: "edit", id: task.id, time: minutes(editTime) })) setEditing(null);
  };
  return <Sheet open modal={!practice} onOpenChange={(open) => { if (!open) onClose(); }}>
    <SheetContent className={practice ? "patient-dialog practice-dialog" : "patient-dialog"} showCloseButton={false}
      onInteractOutside={(event) => { if (practice) event.preventDefault(); }}
      onOpenAutoFocus={(event) => { if (practice) event.preventDefault(); }}
      onCloseAutoFocus={(event) => {
      if (practice) event.preventDefault();
      else if (returnFocus?.isConnected) {
        event.preventDefault();
        returnFocus.focus();
      }
    }}>
      <div className="drawer">
        <header className="drawer-top">
          <div>
            <SheetTitle>{selectedTask?.label ?? patient.name}</SheetTitle>
            <SheetDescription>{selectedTask && `${patient.name} · `}Room {patient.room} · {patient.context}</SheetDescription>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close patient details" data-tour="close"><X /></Button>
        </header>
      <div className="drawer-controls">
        <label>Patient urgency
          <select disabled={busy} value={patient.urgency} onChange={(event) => void onAction({ type: "priority", id: patient.id, urgency: event.target.value as Urgency })}>
            {Object.entries(PRIORITIES).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
          </select>
        </label>
        <button className="button" disabled={busy} onClick={() => void onAction({ type: "visit", room: patient.room })}><Footprints size={15} />{board.lastRoom === patient.room ? "Last room recorded" : "Record last room"}</button>
      </div>
      <section className="signal-detail"><div><h3>Sleep status</h3><small>Synthetic reading · {timeLabel(patient.signal.observedAt)}</small></div><Sleep patient={patient} />
        <p>Simulated pulse {patient.signal.pulse} bpm</p>
      </section>
      {actionError && <p role="alert" className="drawer-alert">{actionError}</p>}
      {adding ? <TaskForm now={board.now} preferredStart={startAdding?.start} preferredDuration={startAdding?.duration} role={role} busy={busy}
        onCancel={() => setAdding(false)} onSave={async (draft) => {
          if (await onAction({ type: "addTask", id: patient.id, draft })) {
            setAdding(false);
            onShowAll();
          }
        }} /> : <div className="task-section-heading">
        <h3>{selectedTask ? "Timing and assignment" : "Care tasks"}</h3>
        <Button size="sm" variant="outline" data-tour="add" disabled={busy || board.now >= END} onClick={() => {
          onShowAll();
          setAdding(true);
          onAdd();
        }}><Plus />Add task</Button>
      </div>}
      {!adding && !tasks.length && <p className="empty">No tasks for this patient.</p>}
      {!adding && tasks.map((task) => {
        const changeable = canChange(task) && task.latest >= board.now;
        const suggested = task.recommendation.time;
        const fixed = task.earliest === task.latest;
        const complete = task.completedAt !== undefined;
        return <article className="task-card" key={task.id} data-tour="task-window">
          <div className="task-title">{!selectedTask && <strong>{task.label}</strong>}<Priority value={task.urgency} /></div>
          <p>{formatWindow(task)} allowed · {task.duration} min</p>
          <p>{task.note}</p>
          <div className="task-times">
            <div><small>Assigned provider</small><strong>{PROVIDERS[task.assignedTo].name}</strong><small>{STAFF[task.role]}</small></div>
            <div data-tour="task-time"><small>{complete ? "Completed" : fixed ? task.approval ? "Fixed time" : "Fixed time · draft" : task.approval ? "Scheduled" : "Draft time"}</small><strong>{timeLabel(eventTime(task))}{task.approval?.locked && <LockKeyhole size={13} aria-label="Locked" />}</strong></div>
            <div><small>Location</small><strong>Room {patient.room}</strong></div>
            {!complete && !fixed && task.approval && task.revision && suggested !== null && <div><small>Live suggestion</small><strong>{timeLabel(suggested)}</strong></div>}
          </div>
          {!complete && !fixed && (task.revision || task.latest < board.now || task.recommendation.readyNow && !task.approval?.locked) &&
            <p className="task-reason">{task.recommendation.reason}</p>}
          {complete || <div className="task-actions">
            {task.revision && changeable && suggested !== null && <button className="button solid" data-tour="approve" disabled={busy} onClick={() => void onAction({ type: "approve", id: task.id, time: suggested })}>Approve suggestion</button>}
            {changeable && <button className="button" onClick={() => { setEditing(task.id); setEditTime(timeInput(Math.max(board.now, task.approval?.time ?? suggested ?? task.earliest))); }}>Edit time</button>}
            {role === "physician" && task.approval && !fixed && <button className="button" disabled={busy} onClick={() => void onAction({ type: "lock", id: task.id })}>{task.approval.locked ? "Unlock task" : "Lock task"}</button>}
            {(role === "physician" || board.provider === task.assignedTo) && board.now >= task.earliest && <button className="button" disabled={busy} onClick={() => void onAction({ type: "complete", id: task.id })}><Check size={14} />Mark complete</button>}
          </div>}
          {editing === task.id && changeable && <form className="inline-form" onSubmit={(event) => void saveTime(event, task)}>
            <label>New time <input required type="time" min={timeInput(Math.max(board.now, task.earliest))} max={timeInput(task.latest)} value={editTime} onChange={(event) => setEditTime(event.target.value)} /></label>
            <button className="button solid" disabled={busy}>Save time</button>
            <button className="button" type="button" onClick={() => setEditing(null)}>Cancel</button>
          </form>}
        </article>;
      })}
      {!adding && selectedTask && <Button variant="ghost" size="sm" onClick={onShowAll}>View all patient tasks <ArrowRight /></Button>}
      </div>
    </SheetContent>
  </Sheet>;
}

export default function WardPage() {
  const [practicing, setPracticing] = useState(false);
  const launchButton = useRef<HTMLButtonElement | null>(null);

  return <>
    <div hidden={practicing}>
      <Ward onStartTutorial={(button) => { launchButton.current = button; setPracticing(true); }} />
    </div>
    {practicing && <Ward onExitTutorial={() => {
      setPracticing(false);
      requestAnimationFrame(() => launchButton.current?.focus());
    }} />}
  </>;
}

function Ward({ onStartTutorial, onExitTutorial }: {
  onStartTutorial?: (button: HTMLButtonElement) => void; onExitTutorial?: () => void;
}) {
  const [practiceState, setPracticeState] = useState(() => onExitTutorial ? initialState() : null);
  const [liveBoard, setLiveBoard] = useState<Snapshot | null>(null);
  const [tutorialIndex, setTutorialIndex] = useState(0);
  const practice = practiceState !== null;
  const [provider, setProvider] = useState<Provider>("physician");
  const board = practiceState ? snapshot(practiceState, 0, 0, syntheticReading, provider) : liveBoard;
  const activeProvider = useRef<Provider>("physician");
  const { role } = PROVIDERS[provider];
  const [view, setView] = useState<View>("calendar");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [calendarKey, setCalendarKey] = useState(0);
  const [filter, setFilter] = useState<"all" | "priority">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string>();
  const [startAdding, setStartAdding] = useState<TaskSlot>();
  const patientTrigger = useRef<HTMLElement | null>(null);
  const [connected, setConnected] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const update = useCallback((value: Snapshot) => {
    if (value.provider !== activeProvider.current) return;
    setLiveBoard((previous) => !previous || value.version > previous.version || (value.version === previous.version && value.now >= previous.now) ? value : previous);
    setConnected(true);
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await loadWard(provider);
      if (!response.ok) throw new Error("Request failed");
      update(await response.json());
    } catch {
      if (provider === activeProvider.current) setConnected(false);
    }
  }, [provider, update]);

  useEffect(() => {
    if (practice) return;
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [load, practice]);

  function advanceTutorial(action?: string) {
    if (practice) setTutorialIndex((index) => index < tutorialSteps.length - 1 && tutorialSteps[index].action === action ? index + 1 : index);
  }

  async function act(command: Command) {
    if (!board || busy) return false;
    if (practiceState) {
      if (tutorialSteps[tutorialIndex].action !== command.type) return false;
      setActionError("");
      try {
        setPracticeState(applyAction(practiceState, { ...command, version: 0, provider }, 0, syntheticReading));
        advanceTutorial(command.type);
        return true;
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "Could not save the practice change.");
        return false;
      }
    }
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      const response = await saveWard({ ...command, version: board.version, provider });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) void load();
        setActionError((result as { error?: string }).error ?? "Could not save the change.");
        return false;
      }
      update(result as Snapshot);
      if (!["advance", "play", "pause", "dawn"].includes(command.type)) setNotice(offline ? "Change saved in this browser." : "Change saved to the shared ward.");
      return true;
    } catch {
      setActionError(offline ? "Could not save in this browser. Try again." : "Connection interrupted. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3200);
    return () => clearTimeout(timer);
  }, [notice]);

  function pickPatient(id: string, eventId?: string) {
    setStartAdding(undefined);
    patientTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setActionError("");
    setSelectedId(id);
    setTaskId(eventId);
    advanceTutorial(eventId ?? `room-${id}`);
  }

  function switchProvider(next: Provider) {
    activeProvider.current = next;
    setLiveBoard(null);
    setConnected(true);
    setProvider(next);
    setSelectedId(null);
    setTaskId(undefined);
    setView((current) => current === "patients" ? current : "calendar");
    setFilter("all");
    setActionError("");
    setNotice("");
  }

  const selected = board?.patients.find((patient) => patient.id === selectedId);
  const visits = board?.visits ?? [];
  const patients = board ? [...board.patients].sort((a, b) => {
    const rank = { critical: 0, elevated: 1, routine: 2 };
    return rank[a.urgency] - rank[b.urgency] || a.room.localeCompare(b.room);
  }) : [];
  const drafts = board?.tasks.some((task) => task.revision && !task.approval);
  const toggleClock = () => void act({ type: board?.playing ? "pause" : "play" });
  const advanceClock = () => void act({ type: "advance" });

  const sidebarVisible = sidebarOpen || practice && tutorialSteps[tutorialIndex].target === "advance";

  return <div className={`app-shell${practice ? " practice-ward" : ""}`}>
    <header className="topbar">
      <div className="brand-tools">
        <Button variant="ghost" size="icon-sm" className="sidebar-toggle" aria-label={sidebarVisible ? "Close sidebar" : "Open sidebar"} aria-expanded={sidebarVisible} aria-controls={practice ? "practice-shift-sidebar" : "shift-sidebar"} onClick={() => setSidebarOpen(!sidebarOpen)}><PanelLeft /></Button>
        <button type="button" className="home-button site-brand" aria-label="Acorn Medical home" title="Go to the shift calendar" onClick={() => {
          setView("calendar");
          setCalendarKey((key) => key + 1);
          setActionError("");
          setSidebarOpen(false);
        }}>
          <span className="acorn-mark" aria-hidden="true" />
          <span className="brand-name">Acorn Medical</span>
        </button>
      </div>
      <nav className="view-tabs" aria-label="Shift views">
        {NAV.map(({ id, text }) => <button key={id} data-tour={id} className={view === id ? "active" : ""} aria-current={view === id ? "page" : undefined} onClick={() => { setView(id); setActionError(""); advanceTutorial(id); }}>{text}</button>)}
        {onStartTutorial && <button className="tutorial-launch" type="button" onClick={(event) => onStartTutorial(event.currentTarget)}>Tutorial</button>}
      </nav>
      <div className="role-picker">
        <NativeSelect aria-label="Provider view" size="sm" value={provider} disabled={busy || practice} onChange={(event) => switchProvider(event.target.value as Provider)}>
          {Object.entries(PROVIDERS).map(([value, person]) => <NativeSelectOption key={value} value={value}>{person.name}</NativeSelectOption>)}
        </NativeSelect>
      </div>
    </header>
    <div className="app-workspace">
      <aside id={practice ? "practice-shift-sidebar" : "shift-sidebar"} className={`app-sidebar${sidebarVisible ? " sidebar-open" : ""}`} aria-label="Shift sidebar">
        {board && view === "calendar" && <CalendarControls board={board} busy={busy} toggle={toggleClock} advance={advanceClock}
          approveDrafts={role === "physician" && drafts ? () => void act({ type: "approveShift" }) : undefined}
          dawn={role === "physician" ? async () => { if (await act({ type: "dawn" })) setCalendarKey((key) => key + 1); } : undefined}
          reset={role === "physician" ? () => { if (window.confirm(offline ? "Reset the demo clock and clear changes in this browser?" : "Reset the shared demo clock and clear demo changes?")) void act({ type: "reset" }); } : undefined} />}
        <Button asChild variant="ghost" size="sm" className="sidebar-github">
          <a href="https://github.com/OpalWight/acorn-medical" target="_blank" rel="noreferrer">GitHub <ExternalLink /></a>
        </Button>
      </aside>
      <main className={view === "calendar" ? "calendar-main" : undefined}>
      {view === "agenda" && <div className="page-heading"><h1>Ward agenda</h1></div>}
      {board && !connected && <p className="connection-status" role="status">{offline ? "Could not read the saved demo. Retrying…" : "Reconnecting to the schedule…"}</p>}
      {actionError && !selected && <p className="global-error" role="alert"><CircleAlert size={18} />{actionError}</p>}
      {!board && <div className="card loading" role="status">{connected ? "Loading the ward…" : offline ? "Could not read the saved demo. Retrying…" : "Could not reach the ward. Retrying…"}</div>}
      {board && view === "calendar" && <ShiftCalendar key={calendarKey} board={board} busy={busy} onSelect={pickPatient} onAdd={(id, start, duration) => { pickPatient(id); setStartAdding({ start, duration }); }} />}
      {board && view === "patients" && <PatientsView board={board} busy={busy} toggle={toggleClock} advance={advanceClock} onSelect={pickPatient} />}
      {board && view === "agenda" && <>
          <div className="board-grid">
            <Card title="Patient list" className="patient-card" icon={<div className="segments" aria-label="Filter patients"><button className={filter === "all" ? "chosen" : ""} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button><button className={filter === "priority" ? "chosen" : ""} data-tour="priority" aria-pressed={filter === "priority"} onClick={() => { setFilter("priority"); advanceTutorial("priority"); }}>Priority</button></div>}>
              <div className="table-scroll"><table>
                <thead><tr><th>Patient</th><th>Urgency <ArrowDown size={12} /></th><th>Sleep status</th><th>Next care task</th><th><span className="sr-only">Open details</span></th></tr></thead>
                <tbody>{patients.filter((patient) => filter === "all" || patient.urgency !== "routine").map((patient) => {
                  const tasks = board.tasks.filter((task) => task.patient === patient.id && task.completedAt === undefined && task.latest >= board.now);
                  const next = tasks.sort((a, b) => (a.approval?.time ?? a.recommendation.time ?? a.baseline) - (b.approval?.time ?? b.recommendation.time ?? b.baseline))[0];
                  const pending = tasks.filter((task) => task.approval && task.revision).length;
                  return <tr key={patient.id}>
                    <td><button className="patient-name" onClick={() => pickPatient(patient.id)}><span><strong>{patient.name}</strong><small>Room {patient.room}</small></span></button></td>
                    <td><Priority value={patient.urgency} /></td>
                    <td><Sleep patient={patient} /></td>
                    <td>{patient.urgency === "critical" ? <div className="task-summary"><strong className="late-text">Assess now</strong><small>Priority override</small></div> : next ? <div className="task-summary"><strong>{next.label}</strong><small>{timeLabel(next.approval?.time ?? next.recommendation.time ?? next.baseline)}{pending > 0 && <span className="revision-dot"> · {pending} to review</span>}</small></div> : <span className="muted">—</span>}</td>
                    <td><button className="row-arrow" aria-label={`Open ${patient.name}`} onClick={() => pickPatient(patient.id)}><ChevronRight size={17} /></button></td>
                  </tr>;
                })}</tbody>
              </table></div>
              {filter === "priority" && patients.every((person) => person.urgency === "routine") && <p className="empty">No patients have elevated or rapid-decline priority.</p>}
              <div className="table-footer">Sleep readings updated at {timeLabel(board.now)}</div>
            </Card>
            <aside className="right-rail" aria-label="Visit planning">
              <Card title="Next visits" note={board.lastRoom === "station" ? "From the nurses’ station" : `From room ${board.lastRoom}`} className="visits-card">
                {visits.length === 0 && <p className="empty">No upcoming visits.</p>}
                {visits.map((visit, index) => <button key={visit.patient.id} className="visit-item" onClick={() => pickPatient(visit.patient.id, visit.taskId)}>
                  <span className={`rank ${visit.immediate ? "urgent-rank" : ""}`}>{index + 1}</span><span className="visit-details"><strong>{visit.patient.name}</strong><small>Room {visit.patient.room} · {visit.task} · {timeLabel(visit.time)}</small></span><span className="visit-walk">{visit.walk} min</span>
                </button>)}
              </Card>
            </aside>
          </div>
        </>}
      </main>
    </div>
    {selected && board && <PatientDialog key={selected.id} patient={selected} board={board} role={role} taskId={taskId} startAdding={startAdding} returnFocus={patientTrigger.current} busy={busy} actionError={actionError} practice={practice} onShowAll={() => setTaskId(undefined)} onAdd={() => advanceTutorial("add")} onClose={() => { setSelectedId(null); setActionError(""); advanceTutorial("close"); }} onAction={act} />}
    {notice && <div className="toast" role="status"><Check size={17} />{notice}</div>}
    {onExitTutorial && <Tutorial index={tutorialIndex} exit={onExitTutorial} advance={() => advanceTutorial()} />}
  </div>;
}
