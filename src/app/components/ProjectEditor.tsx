import type { NameArtProject } from "../../core/models/project.ts";
import { NamesEditor } from "./NamesEditor.tsx";

interface Props {
  project: NameArtProject;
  hasErrors: boolean;
  saving: boolean;
  onChange: (project: NameArtProject) => void;
  onSave: () => void;
}

export const DETAILS_FORM_ID = "details-form";

// Whether Save is unavailable; the Save button itself lives in the top bar.
export const saveBlocked = (project: NameArtProject, hasErrors: boolean, saving: boolean): boolean =>
  hasErrors || project.projectName.trim() === "" || saving;

export function ProjectEditor({ project, hasErrors, saving, onChange, onSave }: Props) {
  const projectNameMissing = project.projectName.trim() === "";
  const blocked = saveBlocked(project, hasErrors, saving);
  return (
    <form
      id={DETAILS_FORM_ID}
      onSubmit={(e) => {
        e.preventDefault();
        if (!blocked) onSave();
      }}
    >
      <div className="field">
        <label htmlFor="projectName">Project name <span className="label-note">(required)</span></label>
        <input
          id="projectName"
          value={project.projectName}
          aria-invalid={projectNameMissing ? true : undefined}
          onChange={(e) => onChange({ ...project, projectName: e.target.value })}
        />
        {projectNameMissing && <p className="error">Project name is required.</p>}
      </div>
      <div className="field">
        <label htmlFor="customerName">Customer name <span className="label-note">(optional)</span></label>
        <input
          id="customerName"
          value={project.customerName ?? ""}
          onChange={(e) => {
            const { customerName: _drop, ...rest } = project;
            onChange(e.target.value === "" ? rest : { ...rest, customerName: e.target.value });
          }}
        />
      </div>
      <div className="field-pair">
        <div className="field">
          <label htmlFor="familyName">Family name</label>
          <input
            id="familyName"
            value={project.familyName}
            onChange={(e) => onChange({ ...project, familyName: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="year">Year <span className="label-note">(optional)</span></label>
          <input
            id="year"
            value={project.year ?? ""}
            onChange={(e) => {
              const { year: _drop, ...rest } = project;
              onChange(e.target.value === "" ? rest : { ...rest, year: e.target.value });
            }}
          />
        </div>
      </div>
      <NamesEditor names={project.names} onChange={(names) => onChange({ ...project, names })} />
    </form>
  );
}
