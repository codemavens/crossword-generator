import type { StepState, ViewId } from "../steps.ts";
import { STEP_LABELS } from "../steps.ts";
import { CheckIcon, FolderIcon, LockIcon, WarnIcon } from "./icons.tsx";

interface Props {
  steps: StepState[];
  current: ViewId;
  projectCount: number;
  onPick: (view: ViewId) => void;
}

export function StepRail({ steps, current, projectCount, onPick }: Props) {
  return (
    <nav className="rail" aria-label="Steps">
      <button
        type="button"
        className="rail-item projects"
        aria-current={current === "projects" ? "page" : undefined}
        onClick={() => onPick("projects")}
      >
        <span className="rail-icon" aria-hidden="true">
          <FolderIcon />
        </span>
        <span className="rail-text">
          <span className="rail-label">Projects</span>
        </span>
        <span className="rail-count">
          <span className="sr-only">, </span>
          {projectCount}
          <span className="sr-only"> saved</span>
        </span>
      </button>
      <div className="rail-divider" aria-hidden="true" />
      <p className="rail-heading" aria-hidden="true">
        This design
      </p>
      <ol className="rail-steps">
        {steps.map((s) => {
          const isCurrent = s.id === current;
          const locked = !s.openable;
          const className = ["rail-item", isCurrent && "current", locked && "locked", s.attention && "attention", s.complete && "complete"]
            .filter(Boolean)
            .join(" ");
          return (
            <li key={s.id}>
              <button
                type="button"
                className={className}
                aria-current={isCurrent ? "step" : undefined}
                // Stays focusable so the reason can be read; the click is ignored while locked.
                aria-disabled={locked || undefined}
                onClick={() => {
                  if (!locked) onPick(s.id);
                }}
              >
                <span className="rail-number" aria-hidden="true">
                  {s.complete && !isCurrent ? <CheckIcon size={13} /> : s.number}
                </span>
                <span className="rail-text">
                  <span className="rail-label">
                    <span className="sr-only">Step {s.number}: </span>
                    {s.label}
                  </span>
                  <span className="rail-summary">{s.summary}</span>
                  {locked && s.blockedBy && (
                    <span className="rail-state locked-note">
                      <LockIcon /> Locked: finish {STEP_LABELS[s.blockedBy]} first
                    </span>
                  )}
                  {s.attention && (
                    <span className="rail-state attention-note">
                      <WarnIcon /> Needs attention
                    </span>
                  )}
                  {s.complete && s.id !== "export" && <span className="sr-only">, complete</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
