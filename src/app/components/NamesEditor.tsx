import type { NameEntry } from "../../core/models/project.ts";
import { MAX_NAMES, validateNameText } from "../../core/models/validation.ts";

interface Props {
  names: NameEntry[];
  onChange: (names: NameEntry[]) => void;
}

export function NamesEditor({ names, onChange }: Props) {
  const edit = (id: string, text: string) =>
    onChange(names.map((n) => (n.id === id ? { ...n, text } : n)));
  const remove = (id: string) => onChange(names.filter((n) => n.id !== id));
  const add = () => onChange([...names, { id: crypto.randomUUID(), text: "" }]);

  return (
    <fieldset className="names">
      <legend>
        <span className="group-title">Names</span>
        <span className="muted small">
          {names.length} of {MAX_NAMES}
        </span>
      </legend>
      {names.length === 0 && <p className="muted">No names yet.</p>}
      {names.map((n, i) => {
        const error = validateNameText(n.text);
        const inputId = `name-${n.id}`;
        return (
          <div className="name-row" key={n.id}>
            <span className="name-number" aria-hidden="true">{i + 1}</span>
            <label htmlFor={inputId} className="sr-only">Name {i + 1}</label>
            <input
              id={inputId}
              value={n.text}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${inputId}-err` : undefined}
              onChange={(e) => edit(n.id, e.target.value)}
            />
            <button type="button" className="danger quiet" onClick={() => remove(n.id)}>Remove</button>
            {error && <p id={`${inputId}-err`} className="error inline-error">{error}</p>}
          </div>
        );
      })}
      <button type="button" className="dashed add-name" onClick={add}>Add name</button>
    </fieldset>
  );
}
