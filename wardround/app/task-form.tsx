import { useState, type FormEvent } from "react";
import { Button } from "../components/ui/button";
import { Field, FieldLabel } from "../components/ui/field";
import { Input } from "../components/ui/input";
import { NativeSelect, NativeSelectOption } from "../components/ui/native-select";
import { Textarea } from "../components/ui/textarea";
import { PRIORITIES, PROVIDERS, TASK_KINDS, taskBounds, timeInput, type Role, type TaskDraft, type Urgency } from "../lib/ward";

function minuteOfDay(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function TaskForm({ now, preferredStart, preferredDuration, role, busy, onSave, onCancel }: {
  now: number; preferredStart?: number; preferredDuration?: number; role: Role; busy: boolean;
  onSave: (draft: TaskDraft) => Promise<void>; onCancel: () => void;
}) {
  const [kind, setKind] = useState<TaskDraft["kind"]>("visit");
  const [fixed, setFixed] = useState(false);
  const { start, end } = taskBounds(kind);
  const first = Math.max(now, start, preferredStart !== undefined && preferredStart < end ? preferredStart : start);
  const duration = Math.max(1, Math.min(preferredDuration ?? 10, end - first));
  const last = Math.max(first, Math.min(first + 30, end - duration));
  const roles: Role[] = role === "student" ? ["student"] : ["physician", "nurse", "student"];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const baseline = minuteOfDay(String(values.get("start")));
    const assignedRole = values.get("provider") as Role;
    void onSave({
      label: String(values.get("name") ?? ""),
      kind,
      role: assignedRole,
      urgency: role === "student" ? "routine" : values.get("urgency") as Urgency,
      earliest: fixed ? baseline : minuteOfDay(String(values.get("earliest"))),
      latest: fixed ? baseline : minuteOfDay(String(values.get("latest"))),
      baseline,
      duration: Number(values.get("duration")),
      note: String(values.get("notes") ?? ""),
    });
  }

  return <form className="task-form" aria-labelledby="task-form-title" onSubmit={submit}>
    <h3 id="task-form-title">{role === "student" ? "Propose a task" : "Add a task or visit"}</h3>
    <Field>
      <FieldLabel htmlFor="new-task-name">Task name</FieldLabel>
      <Input id="new-task-name" name="name" required maxLength={80} autoFocus />
    </Field>
    <div className="task-form-fields">
      <Field>
        <FieldLabel htmlFor="new-task-kind">Task type</FieldLabel>
        <NativeSelect id="new-task-kind" value={kind} onChange={(event) => setKind(event.target.value as TaskDraft["kind"])}>
          {Object.entries(TASK_KINDS).map(([value, label]) => <NativeSelectOption key={value} value={value}
            disabled={now >= taskBounds(value as TaskDraft["kind"]).end}>{label}</NativeSelectOption>)}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor="new-task-provider">Assigned provider</FieldLabel>
        <NativeSelect id="new-task-provider" name="provider" defaultValue={role}>
          {roles.map((id) => <NativeSelectOption key={id} value={id}>{id === "nurse" ? "Nurse on duty" : PROVIDERS[id].name}</NativeSelectOption>)}
        </NativeSelect>
      </Field>
      {role !== "student" && <Field>
        <FieldLabel htmlFor="new-task-urgency">Task urgency</FieldLabel>
        <NativeSelect id="new-task-urgency" name="urgency" defaultValue="routine">
          {Object.entries(PRIORITIES).map(([value, label]) => <NativeSelectOption key={value} value={value}>{value === "critical" ? "Urgent" : label}</NativeSelectOption>)}
        </NativeSelect>
      </Field>}
      <Field>
        <FieldLabel htmlFor="new-task-timing">Timing</FieldLabel>
        <NativeSelect id="new-task-timing" value={fixed ? "fixed" : "window"} onChange={(event) => setFixed(event.target.value === "fixed")}>
          <NativeSelectOption value="window">Flexible window</NativeSelectOption>
          <NativeSelectOption value="fixed">Fixed start</NativeSelectOption>
        </NativeSelect>
      </Field>
    </div>
    <div className="task-form-fields" key={kind}>
      <Field>
        <FieldLabel htmlFor="new-task-start">{fixed ? "Fixed start" : "Preferred start"}</FieldLabel>
        <Input id="new-task-start" name="start" type="time" required min={timeInput(first)} max={timeInput(end - 1)} defaultValue={timeInput(first)} />
      </Field>
      <Field>
        <FieldLabel htmlFor="new-task-duration">Duration (min)</FieldLabel>
        <Input id="new-task-duration" name="duration" type="number" required min={1} max={end - first} defaultValue={duration} />
      </Field>
      {!fixed && <>
        <Field>
          <FieldLabel htmlFor="new-task-earliest">Earliest start</FieldLabel>
          <Input id="new-task-earliest" name="earliest" type="time" required min={timeInput(start)} max={timeInput(end - 1)} defaultValue={timeInput(first)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="new-task-latest">Latest start</FieldLabel>
          <Input id="new-task-latest" name="latest" type="time" required min={timeInput(first)} max={timeInput(end - 1)} defaultValue={timeInput(last)} />
        </Field>
      </>}
    </div>
    <Field>
      <FieldLabel htmlFor="new-task-notes">Instructions <small>(optional)</small></FieldLabel>
      <Textarea id="new-task-notes" name="notes" rows={2} maxLength={500} />
    </Field>
    <div className="task-form-actions">
      <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      <Button type="submit" disabled={busy || first >= end}>{role === "student" ? "Submit proposal" : "Save draft"}</Button>
    </div>
  </form>;
}
