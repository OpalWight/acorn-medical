import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ArrowUpRight, Check, LockKeyhole, Pause, Play, Plus, RotateCcw } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { calendarSelection, eventTime, layoutEvents, SLOT_MINUTES } from "../lib/calendar";
import { END, NURSING_COVERAGE, PROVIDERS, TASK_KINDS, timeLabel, type Snapshot } from "../lib/ward";

const TICKS = Array.from({ length: END / 15 }, (_, index) => index * 15);
const offset = (minute: number) => (minute / END) * 100 + "%";

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
  const viewport = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const lastMinute = useRef<number>(null);
  const drag = useRef<{ patient: string; pointerId: number; anchor: number; y: number } | null>(null);
  const [selection, setSelection] = useState<{ patient: string; start: number; duration: number }>();
  const earliest = Math.ceil(board.now / SLOT_MINUTES) * SLOT_MINUTES;
  const ended = board.now >= END;

  useLayoutEffect(() => {
    const previous = lastMinute.current;
    lastMinute.current = board.now;
    if (previous !== null && board.now >= previous) return;
    if (!viewport.current || !ruler.current) return;
    viewport.current.scrollTop = Math.max(0, board.now - 30) * ruler.current.offsetHeight / END;
  }, [board.now]);

  function pointerMinute(event: PointerEvent<HTMLDivElement>) {
    const lane = event.currentTarget.getBoundingClientRect();
    return (event.clientY - lane.top) * END / lane.height;
  }

  function stopDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setSelection(undefined);
  }

  function selectSlot(event: PointerEvent<HTMLDivElement>, patient: string) {
    if (busy || drag.current || event.button !== 0 || event.target !== event.currentTarget) return;
    const anchor = Math.floor(pointerMinute(event) / SLOT_MINUTES) * SLOT_MINUTES;
    if (anchor < earliest || anchor >= END) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { patient, pointerId: event.pointerId, anchor, y: event.clientY };
    setSelection({ patient, ...calendarSelection(anchor, anchor, earliest, END, false) });
  }

  function updateSlot(event: PointerEvent<HTMLDivElement>, open: boolean) {
    const current = drag.current;
    if (current?.pointerId !== event.pointerId) return;
    if (current.anchor < earliest) {
      stopDrag(event);
      return;
    }
    const range = calendarSelection(current.anchor, pointerMinute(event), earliest, END, Math.abs(event.clientY - current.y) >= 4);
    if (open) {
      stopDrag(event);
      onAdd(current.patient, range.start, range.duration);
    } else setSelection({ patient: current.patient, ...range });
  }

  return <section className="shift-calendar" aria-label="24-hour shift calendar">
    <header className="calendar-toolbar">
      <div className="calendar-key" aria-label="Task colors">
        {Object.entries(TASK_KINDS).map(([kind, label]) => <span key={kind} className={`kind-${kind}`}><i />{label}</span>)}
      </div>
      <ShiftClock now={board.now} playing={board.playing} busy={busy} toggle={toggle} advance={advance}>
        {reset && <Button variant="outline" size="icon-sm" disabled={busy} onClick={reset} aria-label="Reset shift" title="Reset shift"><RotateCcw /></Button>}
        {approveDrafts && <Button size="sm" disabled={busy} onClick={approveDrafts}>Approve shift drafts</Button>}
      </ShiftClock>
    </header>
    <div ref={viewport} className="calendar-scroll" role="region" tabIndex={0} aria-label="Midnight to midnight time grid">
      <div className="calendar-grid" style={{ gridTemplateColumns: `76px 144px repeat(${board.patients.length}, minmax(142px, 1fr))`, gridTemplateRows: `var(--calendar-header) calc(${TICKS.length} * var(--interval))` }}>
        <div className="calendar-corner">Time</div>
        <div className="coverage-heading">Nursing shifts</div>
        {board.patients.map((patient) => <div className="calendar-room" key={patient.id}>
          <button className="room-details" onClick={() => onSelect(patient.id)} aria-label={`Room ${patient.room}, ${patient.name}, patient details`}>
            <span className="room-label">Room {patient.room}{patient.urgency === "critical" && <Badge variant="outline" className="room-urgent">Rapid decline</Badge>}</span>
            <strong>{patient.name}</strong>
            <small>{patient.signal.stage}</small>
          </button>
          {!ended && <Button variant="ghost" size="icon-xs" className="room-add" aria-label={`Add task for ${patient.name}`} title="Add task" disabled={busy} onClick={() => onAdd(patient.id, board.now)}><Plus /></Button>}
        </div>)}
        <div ref={ruler} className="calendar-ruler">
          {TICKS.filter((minute) => Math.abs(minute - board.now) >= 7).map((minute) =>
            <time key={minute} className={minute % 60 === 0 ? "hour-label" : undefined} style={{ top: offset(minute) }}>{timeLabel(minute)}</time>)}
          <span className="calendar-now-label" style={{ top: offset(board.now) }}>{timeLabel(board.now)}</span>
        </div>
        <div className="calendar-lane staffing-lane">
          {NURSING_COVERAGE.map((shift) => <div key={shift.start} className="coverage-block" data-shift={shift.label}
            style={{ top: offset(shift.start), height: offset(shift.end - shift.start) }}>
            <div className="coverage-details">
              <strong>{shift.label}</strong>
              <small>{shift.hours}</small>
              {shift.nurses.map((id) => <span key={id}>{PROVIDERS[id].name}</span>)}
            </div>
          </div>)}
          <div className="calendar-now-line" style={{ top: offset(board.now) }} aria-hidden="true" />
        </div>
        {board.patients.map((patient) => <div className={earliest < END ? "calendar-lane can-schedule" : "calendar-lane"} key={patient.id}
          onPointerDown={(event) => selectSlot(event, patient.id)} onPointerMove={(event) => updateSlot(event, false)}
          onPointerUp={(event) => updateSlot(event, true)} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag}>
          {selection?.patient === patient.id && <div className="selected-slot" aria-hidden="true" style={{
            top: offset(selection.start), height: offset(selection.duration),
          }}>{timeLabel(selection.start)}–{timeLabel(selection.start + selection.duration)}</div>}
          <div className="calendar-now-line" style={{ top: offset(board.now) }} aria-hidden="true" />
          {layoutEvents(board.tasks.filter((task) => task.patient === patient.id)).map(({ task, time, displayMinutes, lane, lanes }) => {
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
            const visibleMinutes = Math.min(displayMinutes, END - time);
            return <button className={`calendar-event kind-${task.kind} ${appearance}`} key={task.id} onClick={() => onSelect(patient.id, task.id)} title={description}
              style={{ top: offset(time), height: offset(visibleMinutes), left: lane / lanes * 100 + "%", width: 100 / lanes + "%" }}
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
    </div>
  </section>;
}
