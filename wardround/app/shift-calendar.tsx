import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ArrowUpRight, Check, LockKeyhole, Pause, Play, Plus, RotateCcw } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { calendarSelection, eventTime, layoutEvents, SLOT_MINUTES } from "../lib/calendar";
import { END, NURSING_COVERAGE, PROVIDERS, SHIFT_PERIODS as PERIODS, TASK_KINDS, timeLabel, type Snapshot } from "../lib/ward";

type Period = (typeof PERIODS)[number]["label"];

export function ShiftClock({ now, playing, busy, toggle, advance, children }: {
  now: number; playing: boolean; busy: boolean; toggle: () => void; advance: () => void; children?: ReactNode;
}) {
  const disabled = busy || now >= END;
  const playbackLabel = playing ? "Pause shift clock" : "Start shift clock";
  return <div className="calendar-controls" role="group" aria-label="Shift clock">
    <time className="clock-now">{timeLabel(now)}</time>
    <Button variant="outline" size="icon-sm" disabled={disabled} onClick={toggle} aria-label={playbackLabel} title={playbackLabel}>{playing ? <Pause /> : <Play />}</Button>
    <Button variant="outline" size="sm" disabled={disabled} onClick={advance}>+5 min</Button>
    {children}
  </div>;
}

export function ShiftCalendar({ board, busy, reset, toggle, advance, approveDrafts, onSelect, onAdd }: {
  board: Snapshot; busy: boolean; reset?: () => void; toggle: () => void; advance: () => void; approveDrafts?: () => void;
  onSelect: (patientId: string, taskId?: string) => void; onAdd: (patientId: string, minute: number, duration?: number) => void;
}) {
  const [selected, setSelected] = useState<Period>();
  const drag = useRef<{ patient: string; pointerId: number; anchor: number; y: number } | null>(null);
  const [selection, setSelection] = useState<{ patient: string; start: number; duration: number }>();
  const period = PERIODS.find((item) => item.label === selected)
    ?? PERIODS.find((item) => board.now >= item.start && board.now < item.end)
    ?? PERIODS[PERIODS.length - 1];
  const { start, end } = period;
  const coverage = NURSING_COVERAGE.find((shift) => start >= shift.start && start < shift.end)!;
  const earliest = Math.ceil(Math.max(board.now, start) / SLOT_MINUTES) * SLOT_MINUTES;
  const duration = end - start;
  const intervals = duration / 15;
  const ended = board.now >= END;
  const showNow = board.now >= start && (board.now < end || ended && end === END);
  const offset = (minute: number) => ((minute - start) / duration) * 100 + "%";
  const ticks = Array.from({ length: intervals }, (_, index) => start + index * 15);
  const events = board.tasks.filter((task) => {
    const time = eventTime(task);
    return time < end && time + task.duration > start;
  });

  function pointerMinute(event: PointerEvent<HTMLDivElement>) {
    const lane = event.currentTarget.getBoundingClientRect();
    return start + (event.clientY - lane.top) * duration / lane.height;
  }

  function stopDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setSelection(undefined);
  }

  function selectSlot(event: PointerEvent<HTMLDivElement>, patient: string) {
    if (busy || drag.current || event.button !== 0 || event.target !== event.currentTarget) return;
    const anchor = Math.floor(pointerMinute(event) / SLOT_MINUTES) * SLOT_MINUTES;
    if (anchor < earliest || anchor >= end) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { patient, pointerId: event.pointerId, anchor, y: event.clientY };
    setSelection({ patient, ...calendarSelection(anchor, anchor, earliest, end, false) });
  }

  function updateSlot(event: PointerEvent<HTMLDivElement>, open: boolean) {
    const current = drag.current;
    if (current?.pointerId !== event.pointerId) return;
    if (current.anchor < earliest) {
      stopDrag(event);
      return;
    }
    const range = calendarSelection(current.anchor, pointerMinute(event), earliest, end, Math.abs(event.clientY - current.y) >= 4);
    if (open) {
      stopDrag(event);
      onAdd(current.patient, range.start, range.duration);
    } else setSelection({ patient: current.patient, ...range });
  }

  return <section className="shift-calendar" aria-label="24-hour shift calendar">
    <Tabs className="calendar-tabs" value={period.label} onValueChange={(value) => setSelected(value as Period)}>
    <header className="calendar-toolbar">
      <TabsList className="shift-periods" variant="line" aria-label="Calendar period">
        {PERIODS.map((item) => <TabsTrigger key={item.label} className="period-button" value={item.label}>
          <strong>{item.label}</strong><small>{item.hours}</small>
        </TabsTrigger>)}
      </TabsList>
      <ShiftClock now={board.now} playing={board.playing} busy={busy} toggle={toggle} advance={advance}>
        {reset && <Button variant="outline" size="icon-sm" disabled={busy} onClick={() => { reset(); setSelected(undefined); }} aria-label="Reset shift" title="Reset shift"><RotateCcw /></Button>}
        {approveDrafts && <Button size="sm" disabled={busy} onClick={approveDrafts}>Approve shift drafts</Button>}
      </ShiftClock>
    </header>
    <div className="nursing-coverage" aria-label="Nursing coverage">
      <strong>{coverage.label}</strong><span>{coverage.hours}</span>
      <span>{coverage.nurses.map((id) => PROVIDERS[id].name).join(" · ")}</span>
    </div>
    <div className="calendar-key" aria-label="Task colors">
      {Object.entries(TASK_KINDS).map(([kind, label]) => <span key={kind} className={`kind-${kind}`}><i />{label}</span>)}
    </div>
    <TabsContent value={period.label} key={period.label} className="calendar-scroll" aria-label={`${period.label} time grid`}>
      <div className="calendar-grid" style={{ gridTemplateColumns: `76px repeat(${board.patients.length}, minmax(142px, 1fr))`, gridTemplateRows: `auto calc(${intervals} * var(--interval))` }}>
        <div className="calendar-corner">Time</div>
        {board.patients.map((patient) => <div className="calendar-room" key={patient.id}>
          <button className="room-details" onClick={() => onSelect(patient.id)} aria-label={`Room ${patient.room}, ${patient.name}, patient details`}>
            <span className="room-label">Room {patient.room}{patient.urgency === "critical" && <Badge variant="outline" className="room-urgent">Rapid decline</Badge>}</span>
            <strong>{patient.name}</strong>
            <small>{patient.signal.stage}</small>
          </button>
          {!ended && <Button variant="ghost" size="icon-xs" className="room-add" aria-label={`Add task for ${patient.name}`} title="Add task" disabled={busy} onClick={() => onAdd(patient.id, Math.max(board.now, start))}><Plus /></Button>}
        </div>)}
        <div className="calendar-ruler">
          {ticks.filter((minute) => !showNow || Math.abs(minute - board.now) >= 7).map((minute) => <time key={minute} style={{ top: offset(minute) }}>{timeLabel(minute)}</time>)}
          {showNow && <span className="calendar-now-label" style={{ top: offset(board.now) }}>{timeLabel(board.now)}</span>}
        </div>
        {board.patients.map((patient) => <div className={earliest < end ? "calendar-lane can-schedule" : "calendar-lane"} key={patient.id}
          onPointerDown={(event) => selectSlot(event, patient.id)} onPointerMove={(event) => updateSlot(event, false)}
          onPointerUp={(event) => updateSlot(event, true)} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag}>
          {selection?.patient === patient.id && <div className="selected-slot" aria-hidden="true" style={{
            top: offset(selection.start), height: selection.duration / duration * 100 + "%",
          }}>{timeLabel(selection.start)}–{timeLabel(selection.start + selection.duration)}</div>}
          {showNow && <div className="calendar-now-line" style={{ top: offset(board.now) }} aria-hidden="true" />}
          {layoutEvents(events.filter((task) => task.patient === patient.id)).map(({ task, time, displayMinutes, lane, lanes }) => {
            const fixed = task.earliest === task.latest;
            const completed = task.completedAt !== undefined;
            const draft = !task.approval && !completed;
            const hasRevision = Boolean(task.approval && task.revision || task.proposedAt !== undefined);
            const status = completed ? "Completed" : draft ? fixed ? "Fixed draft" : "Draft" : fixed ? "Fixed" : hasRevision ? "Revision available" : "Approved";
            const urgent = !completed && (task.urgency === "critical" || task.kind === "assessment" && task.priority === "critical" && task.earliest <= board.now);
            const sleepDelay = task.revision && task.recommendation.sleepDelay;
            const sleepAdvance = task.revision && task.recommendation.sleepAdvance;
            const moveTo = task.approval && (sleepDelay || sleepAdvance) ? task.recommendation.time : null;
            const cue = urgent ? "Urgent" : moveTo !== null ? `→ ${timeLabel(moveTo)}` : sleepDelay ? "Sleep delay" : sleepAdvance ? "Earlier visit" : fixed ? "Fixed" : undefined;
            const moveLabel = moveTo === null ? cue : `${sleepDelay ? "Sleep delay" : "Earlier visit"} suggested for ${timeLabel(moveTo)}`;
            const description = [task.label, patient.name, timeLabel(time), status, moveLabel === status ? undefined : moveLabel].filter(Boolean).join(", ");
            const appearance = completed ? "event-done" : draft ? "event-draft" : "";
            const visibleStart = Math.max(time, start);
            const visibleMinutes = Math.min(time + displayMinutes, end) - visibleStart;
            return <button className={`calendar-event kind-${task.kind} ${appearance}`} key={task.id} onClick={() => onSelect(patient.id, task.id)} title={description}
              style={{ top: offset(visibleStart), height: visibleMinutes / duration * 100 + "%", left: lane / lanes * 100 + "%", width: 100 / lanes + "%" }}
              aria-label={description}>
              <span className="event-meta"><time>{timeLabel(time)}</time>
                <span className="event-state">
                  {cue && lanes === 1 && <Badge variant="outline" className="event-cue">{cue}</Badge>}
                  {completed ? <Check size={12} /> : fixed || task.approval?.locked ? <LockKeyhole size={12} /> : hasRevision || sleepDelay || sleepAdvance ? <ArrowUpRight size={13} /> : null}
                </span>
              </span>
              <strong>{task.label}</strong>
            </button>;
          })}
        </div>)}
      </div>
    </TabsContent>
    </Tabs>
  </section>;
}
