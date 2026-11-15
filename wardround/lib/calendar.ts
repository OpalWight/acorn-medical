import type { Snapshot } from "./ward";

type Task = Snapshot["tasks"][number];

export const EVENT_MINUTES = 10;
export const SLOT_MINUTES = 5;

export function calendarSelection(anchor: number, pointerMinute: number, earliest: number, end: number, dragging: boolean) {
  if (!dragging) return { start: anchor, duration: Math.min(15, end - anchor) };
  const edge = Math.max(earliest, Math.min(end, Math.round(pointerMinute / SLOT_MINUTES) * SLOT_MINUTES));
  const start = Math.min(anchor, edge);
  const finish = Math.max(anchor, edge, start + SLOT_MINUTES);
  return { start, duration: finish - start };
}

export function eventTime(task: Task) {
  return task.completedAt ?? task.approval?.time ?? task.recommendation.time ?? task.baseline;
}

export function layoutEvents(tasks: Task[]) {
  const events = tasks.map((task) => {
    const time = eventTime(task);
    return { task, time, displayMinutes: Math.max(EVENT_MINUTES, task.duration), lane: 0, lanes: 1 };
  }).sort((a, b) => a.time - b.time || a.task.id.localeCompare(b.task.id));

  for (let start = 0; start < events.length;) {
    const ends: number[] = [];
    let end = start;
    let clusterEnd = -Infinity;
    do {
      const event = events[end++];
      const available = ends.findIndex((time) => time <= event.time);
      event.lane = available < 0 ? ends.length : available;
      ends[event.lane] = event.time + event.displayMinutes;
      clusterEnd = Math.max(clusterEnd, ends[event.lane]);
    } while (end < events.length && events[end].time < clusterEnd);
    for (let index = start; index < end; index++) events[index].lanes = ends.length;
    start = end;
  }
  return events;
}
