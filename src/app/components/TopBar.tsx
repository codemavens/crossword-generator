import { DETAILS_FORM_ID } from "./ProjectEditor.tsx";
import { CheckIcon } from "./icons.tsx";

interface Props {
  projectName: string;
  status: string;
  saving: boolean;
  saveDisabled: boolean;
}

export function TopBar({ projectName, status, saving, saveDisabled }: Props) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          S&amp;L
        </span>
        <h1>Sloth &amp; Llama Name Art Designer</h1>
      </div>
      <span className="topbar-divider" aria-hidden="true" />
      <p className="topbar-project">
        <span className="sr-only">Current project: </span>
        {projectName}
      </p>
      <p className="save-status" role="status">
        {status && (
          <span className="chip ok">
            <CheckIcon size={13} />
            {status}
          </span>
        )}
      </p>
      <span className="grow" />
      {/* Submits the Details form, so Enter in a Details field and this button share one save path. */}
      <button type="submit" form={DETAILS_FORM_ID} className="primary" disabled={saveDisabled}>
        {saving ? "Saving..." : "Save"}
      </button>
    </header>
  );
}
