import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

const speakers = ["Alvin", "Simon", "Theodore"] as const;

type Step = {
  speaker: 0 | 1 | 2;
  pose: 0 | 1 | 2 | 3;
  text: string;
  target?: string;
  action?: string;
  input?: boolean;
  button?: string;
};

export const tutorialSteps: readonly Step[] = [
  { speaker: 0, pose: 0, button: "Start tutorial", text: "Welcome to Acorn Medical! Let’s run through a practice shift together." },
  { speaker: 0, pose: 1, target: "calendar-headings", text: "Time runs down the left. Each patient column starts with their name, room, and current sleep stage." },
  { speaker: 0, pose: 2, target: "med", action: "med", text: "Open Marcus Reed’s Time-critical medication to see its exact start time." },
  { speaker: 0, pose: 1, target: "task-time", text: "This simulated order is fixed at 6:00 AM. Its start stays the same as sleep readings change." },
  { speaker: 0, pose: 0, target: "close", action: "close", text: "Close this task. Next we’ll look at a check with a flexible start time." },
  { speaker: 1, pose: 0, target: "before-dawn-marcus", action: "before-dawn-marcus", text: "Open Marcus’s Bedside check. He’s in deep sleep, so the app suggests a short delay." },
  { speaker: 1, pose: 2, target: "task-window", text: "This check can start from 4:55 to 5:20 AM. The app can suggest waiting for lighter sleep within that window." },
  { speaker: 1, pose: 1, target: "close", action: "close", text: "Close the drawer so we can see what changes in five minutes." },
  { speaker: 0, pose: 1, target: "advance", action: "advance", text: "Click +5 min to move from 4:55 to 5:00 AM. The play button runs the demo clock continuously." },
  { speaker: 1, pose: 2, target: "before-dawn-marcus", action: "before-dawn-marcus", text: "Marcus is in light sleep now. Open the check again to see the updated suggestion." },
  { speaker: 1, pose: 1, target: "approve", action: "approve", text: "The suggested start is now 5:00 AM. Click Approve suggestion to schedule the check." },
  { speaker: 1, pose: 3, target: "task-time", text: "Scheduled now shows 5:00 AM. Check this field to confirm which time was saved." },
  { speaker: 1, pose: 1, target: "close", action: "close", text: "Close the check. Let’s draft a follow-up for Nina." },
  { speaker: 1, pose: 2, target: "room-np", action: "room-np", text: "Click Nina Patel’s name at the top of Room 407 to open her patient details." },
  { speaker: 1, pose: 3, target: "add", action: "add", text: "Click Add task. You can also drag across an empty future slot on the calendar to start a draft with that time and duration." },
  { speaker: 1, pose: 1, target: "name", input: true, text: "Type ‘Practice follow-up’ in Task name, then click Continue." },
  { speaker: 1, pose: 2, target: "task-settings", text: "Keep the default visit and flexible window. Preferred start is your first choice. Earliest and latest start set the allowed range. Duration is how long the visit takes." },
  { speaker: 1, pose: 3, target: "save", action: "addTask", text: "Click Save draft. The follow-up will appear on the practice calendar awaiting approval." },
  { speaker: 2, pose: 0, target: "close", action: "close", text: "Close Nina’s details to get back to the calendar." },
  { speaker: 2, pose: 2, target: "patients", action: "patients", text: "Open Patients for a quick look at everyone’s sleep stage, urgency, and walking time." },
  { speaker: 2, pose: 1, target: "agenda", action: "agenda", text: "Open Agenda to see each patient’s next care task and the suggested visit order." },
  { speaker: 2, pose: 2, target: "priority", action: "priority", text: "Click Priority to focus on patients with elevated urgency or rapid decline." },
  { speaker: 2, pose: 0, target: "provider", action: "student", text: "Choose Jordan Ellis · Student. Students can propose a task or time for a physician or nurse to approve." },
  { speaker: 2, pose: 1, target: "rounds", action: "rounds", text: "Open Student rounds to see the order of your assigned visits." },
  { speaker: 2, pose: 2, target: "route", text: "Compare the projected finish with your deadline. Each stop shows its room, estimated visit time, and walking time." },
  { speaker: 0, pose: 3, button: "Finish tutorial", text: "Nice work! Finish to return to your original shift. You can replay this walkthrough from Tutorial." },
];

function spotlightBounds(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  let left = Math.max(0, rect.left);
  let top = Math.max(0, rect.top);
  let right = Math.min(window.innerWidth, rect.right);
  let bottom = Math.min(window.innerHeight, rect.bottom);

  for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const clip = parent.getBoundingClientRect();
    const style = getComputedStyle(parent);
    if (style.overflowX !== "visible") {
      left = Math.max(left, clip.left);
      right = Math.min(right, clip.right);
    }
    if (style.overflowY !== "visible") {
      top = Math.max(top, clip.top);
      bottom = Math.min(bottom, clip.bottom);
    }
  }
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

export function Tutorial({ index, exit, advance }: { index: number; exit: () => void; advance: () => void }) {
  const step = tutorialSteps[index];
  const panel = useRef<HTMLElement>(null);
  const mask = useRef<HTMLDivElement>(null);
  const spotlight = useRef<HTMLDivElement>(null);
  const [nameReady, setNameReady] = useState(false);
  const exitRef = useRef(exit);
  useLayoutEffect(() => { exitRef.current = exit; }, [exit]);

  useLayoutEffect(() => {
    const dialogue = panel.current!;
    const outline = spotlight.current!;
    const dimmer = mask.current!;
    const interactive = Boolean(step.action || step.input);
    let target: HTMLElement | null = null;
    let targetControl: HTMLElement | null = null;
    let frame = 0;
    let locateFrame = 0;

    function measure() {
      document.body.style.setProperty("--tutorial-space", `${dialogue.offsetHeight}px`);
      const bounds = target && spotlightBounds(target);
      const visible = bounds && bounds.width > 0 && bounds.height > 0;
      dimmer.hidden = Boolean(visible);
      outline.hidden = !visible;
      if (visible) Object.assign(outline.style, {
        left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px`,
      });
    }

    function queueMeasure() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    }

    function blockOtherControls(event: Event) {
      const element = event.target;
      if (element instanceof Node && (dialogue.contains(element) || targetControl?.contains(element))) return;
      event.preventDefault();
      event.stopPropagation();
    }

    function keys(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        exitRef.current();
      }
      if (event.key !== "Tab") return;
      const controls = [...dialogue.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      const targetEnabled = targetControl && !targetControl.matches(":disabled");
      const stops = targetEnabled ? [targetControl, ...controls] : controls;
      const current = stops.findIndex((control) => control === document.activeElement);
      const next = current < 0 ? (event.shiftKey ? stops.length - 1 : 0) : (current + (event.shiftKey ? -1 : 1) + stops.length) % stops.length;
      event.preventDefault();
      stops[next]?.focus();
    }

    function readName() {
      if (targetControl instanceof HTMLInputElement) setNameReady(Boolean(targetControl.value.trim()));
    }

    const resize = new ResizeObserver(queueMeasure);
    resize.observe(dialogue);

    function locate() {
      if (step.target) {
        const selector = `[data-tour="${step.target}"]`;
        target = document.querySelector<HTMLElement>(`.practice-ward ${selector}, .practice-dialog ${selector}`);
        if (!target) {
          locateFrame = requestAnimationFrame(locate);
          return;
        }
        targetControl = interactive ? target : null;
        target.scrollIntoView({ block: "center", inline: "center" });
        resize.observe(target);
      }
      const nextButton = dialogue.querySelector<HTMLElement>(".tutorial-continue");
      (targetControl ?? nextButton)?.focus({ preventScroll: true });
      measure();
      if (step.input) {
        readName();
        targetControl?.addEventListener("input", readName);
      }
    }

    measure();
    locate();
    window.addEventListener("resize", queueMeasure);
    window.addEventListener("scroll", queueMeasure, true);
    window.addEventListener("pointerdown", blockOtherControls, true);
    window.addEventListener("click", blockOtherControls, true);
    window.addEventListener("keydown", keys, true);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(locateFrame);
      resize.disconnect();
      targetControl?.removeEventListener("input", readName);
      window.removeEventListener("resize", queueMeasure);
      window.removeEventListener("scroll", queueMeasure, true);
      window.removeEventListener("pointerdown", blockOtherControls, true);
      window.removeEventListener("click", blockOtherControls, true);
      window.removeEventListener("keydown", keys, true);
      document.body.style.removeProperty("--tutorial-space");
    };
  }, [step]);

  const done = index === tutorialSteps.length - 1;
  return <>
    <div className="tutorial-mask" ref={mask} aria-hidden="true" />
    <div className="tutorial-spotlight" ref={spotlight} aria-hidden="true" hidden />
    <section className="tutorial-panel" ref={panel} aria-label="Practice tutorial">
      <div className="tutorial-dialogue" data-guide={speakers[step.speaker].toLowerCase()}>
        <span className="tutorial-sprite" aria-hidden="true" style={{
          "--sprite-x": `${step.pose * 100 / 3}%`, "--sprite-y": `${step.speaker * 50}%`,
        } as CSSProperties} />
        <div className="tutorial-words" aria-live="polite" aria-atomic="true">
          <strong>{speakers[step.speaker]}</strong>
          <p>{step.text}</p>
        </div>
        <div className="tutorial-actions">
          <button className="button tutorial-skip" type="button" onClick={exit}>Skip tutorial</button>
          {!step.action && <button className="button solid tutorial-continue" type="button" disabled={step.input && !nameReady}
            onClick={done ? exit : advance}>{step.button ?? "Continue"}</button>}
        </div>
      </div>
    </section>
  </>;
}
