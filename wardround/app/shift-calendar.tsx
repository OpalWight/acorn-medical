import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ArrowUpRight, Check, LockKeyhole, Pause, Play, RotateCcw } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { calendarSelection, eventTime, layoutEvents, SLOT_MINUTES } from "../lib/calendar";
import { END, TASK_KINDS, timeLabel, type Snapshot } from "../lib/ward";

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

export function CalendarControls({ board, busy, reset, dawn, toggle, advance, approveDrafts }: {
  board: Snapshot; busy: boolean; reset?: () => void; dawn?: () => void; toggle: () => void; advance: () => void; approveDrafts?: () => void;
}) {
  return <>
    <div className="sidebar-group">
      <h2>Shift clock</h2>
      <ShiftClock now={board.now} playing={board.playing} busy={busy} toggle={toggle} advance={advance}>
        {reset && <Button variant="outline" size="icon-sm" disabled={busy} onClick={reset} aria-label="Reset shift" title="Reset shift"><RotateCcw /></Button>}
        {dawn && <Button variant="outline" size="sm" disabled={busy} onClick={dawn}>4:55 AM demo</Button>}
        {approveDrafts && <Button className="approve-drafts" size="sm" disabled={busy} onClick={approveDrafts}>Approve shift drafts</Button>}
      </ShiftClock>
    </div>
    <div className="sidebar-group">
      <h2>Task colors</h2>
      <ul className="calendar-key">
        {Object.entries(TASK_KINDS).map(([kind, label]) => <li key={kind} className={`kind-${kind}`}><i aria-hidden="true" />{label}</li>)}
      </ul>
    </div>
  </>;
}

export function ShiftCalendar({ board, busy, onSelect, onAdd }: {
  board: Snapshot; busy: boolean;
  onSelect: (patientId: string, taskId?: string) => void; onAdd: (patientId: string, minute: number, duration?: number) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const lastMinute = useRef<number>(null);
  const drag = useRef<{ patient: string; pointerId: number; anchor: number; y: number } | null>(null);
  const [selection, setSelection] = useState<{ patient: string; start: number; duration: number }>();
  const earliest = Math.ceil(board.now / SLOT_MINUTES) * SLOT_MINUTES;

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
    <div ref={viewport} className="calendar-scroll" role="region" tabIndex={0} aria-label="Midnight to midnight time grid">
      <div className="calendar-grid" style={{ gridTemplateColumns: `76px repeat(${board.patients.length}, minmax(142px, 1fr))`, gridTemplateRows: `var(--calendar-header) calc(${TICKS.length} * var(--interval))` }}>
        <div className="calendar-corner">Time</div>
        {board.patients.map((patient) => <div className="calendar-room" key={patient.id}>
          <button className="room-details" onClick={() => onSelect(patient.id)}>
            <strong>{patient.name}</strong>
            <span className="room-label">Room {patient.room}</span>
            <small>{patient.signal.stage}</small>
          </button>
        </div>)}
        <div ref={ruler} className="calendar-ruler">
          {TICKS.filter((minute) => Math.abs(minute - board.now) >= 7).map((minute) =>
            <time key={minute} className={minute % 60 === 0 ? "hour-label" : undefined} style={{ top: offset(minute) }}>{timeLabel(minute)}</time>)}
          <span className="calendar-now-label" style={{ top: offset(board.now) }}>{timeLabel(board.now)}</span>
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
            const hasRevision = task.approval && task.revision;
            const status = completed ? "Completed" : draft ? fixed ? "Fixed draft" : "Draft" : fixed ? "Fixed" : hasRevision ? "Revision available" : "Approved";
            const urgent = !completed && (task.urgency === "critical" || task.kind === "assessment" && task.priority === "critical" && task.earliest <= board.now);
            const sleepDelay = task.revision && task.recommendation.sleepDelay;
            const sleepAdvance = task.revision && task.recommendation.sleepAdvance;
            const moveTo = task.approval && (sleepDelay || sleepAdvance) ? task.recommendation.time : null;
            const readyNow = !completed && !task.approval?.locked && task.recommendation.readyNow;
            const cue = urgent ? "Urgent" : moveTo !== null ? `→ ${timeLabel(moveTo)}` : readyNow ? "Available now"
              : sleepDelay ? "Sleep delay" : sleepAdvance ? "Earlier visit" : fixed ? "Fixed" : undefined;
            const moveLabel = moveTo === null ? cue : `${sleepDelay ? "Sleep delay" : "Earlier visit"} suggested for ${timeLabel(moveTo)}`;
            const description = [task.label, patient.name, timeLabel(time), status, moveLabel === status ? undefined : moveLabel].filter(Boolean).join(", ");
            const appearance = completed ? "event-done" : draft ? "event-draft" : "";
            const visibleMinutes = Math.min(displayMinutes, END - time);
            return <button className={`calendar-event kind-${task.kind} ${appearance}`} key={task.id} onClick={() => onSelect(patient.id, task.id)} title={description}
              style={{ top: offset(time), height: offset(visibleMinutes), left: lane / lanes * 100 + "%", width: 100 / lanes + "%" }}
              aria-label={description}>
              <span className="event-meta"><time>{timeLabel(time)}</time>
                <span className="event-state">
                  {cue && lanes === 1 && <Badge variant="outline" className={cue === "Available now" ? "event-cue event-ready" : "event-cue"}>{cue}</Badge>}
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
