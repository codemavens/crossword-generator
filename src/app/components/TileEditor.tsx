import type { ChangeEvent } from "react";
import { BUILTIN_ARTWORK } from "../../core/artwork/builtin.ts";
import type { ArtworkAsset, DecorativeTile } from "../../core/models/project.ts";

export function ArtworkThumb({ asset }: { asset: ArtworkAsset | null }) {
  if (!asset) return <svg className="art-thumb" viewBox="0 0 10 10" aria-hidden="true" />;
  const { minX, minY, maxX, maxY } = asset.bounds;
  const pad = Math.max(maxX - minX, maxY - minY, 1) * 0.1;
  return (
    <svg
      className="art-thumb"
      viewBox={`${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`}
      aria-hidden="true"
    >
      <g fill="#8a3b3b" stroke="none">
        {asset.shapes.map((shape, i) => (
          <path key={i} d={shape.d} fillRule={shape.fillRule} />
        ))}
      </g>
    </svg>
  );
}

interface Props {
  title: string;
  tile: DecorativeTile;
  uploads: ArtworkAsset[];
  busy: boolean;
  message: string;
  warnings: string[];
  onPick: (artworkId: string | null) => void;
  onUpload: (file: File) => void;
  onRemoveTile: () => void;
  onDeleteArtwork: (id: string) => void;
  onClose: () => void;
}

export function TileEditor({
  title,
  tile,
  uploads,
  busy,
  message,
  warnings,
  onPick,
  onUpload,
  onRemoveTile,
  onDeleteArtwork,
  onClose,
}: Props) {
  const choices: { id: string | null; name: string; asset: ArtworkAsset | null }[] = [
    { id: null, name: "Blank", asset: null },
    ...BUILTIN_ARTWORK.map((a) => ({ id: a.id, name: a.name, asset: a })),
    ...uploads.map((a) => ({ id: a.id, name: a.name, asset: a })),
  ];
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    // Reset so the same file can be chosen again.
    input.value = "";
    if (file) onUpload(file);
  };
  return (
    <section className="tile-editor" aria-label={title}>
      <h3>{title}</h3>
      <div className="art-grid" role="group" aria-label="Picture">
        {choices.map((c) => (
          <button
            key={c.id ?? "blank"}
            type="button"
            className="art-choice"
            aria-label={c.name}
            aria-pressed={tile.artworkId === c.id}
            onClick={() => onPick(c.id)}
          >
            <ArtworkThumb asset={c.asset} />
            <span className="small">{c.name}</span>
          </button>
        ))}
      </div>
      <div className="row">
        <label className="file-upload">
          Upload SVG…{" "}
          <input type="file" accept=".svg,image/svg+xml" disabled={busy} onChange={onFile} />
        </label>
        {tile.source === "manual" && (
          <button type="button" className="danger" onClick={onRemoveTile}>
            Remove tile
          </button>
        )}
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      {message && (
        <p className="banner warn" role="alert">
          {message}
        </p>
      )}
      {warnings.length > 0 && (
        <ul className="banner warn" role="status">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      {uploads.length > 0 && (
        <div>
          <h4>Uploaded pictures</h4>
          <ul className="upload-list">
            {uploads.map((a) => (
              <li key={a.id}>
                <ArtworkThumb asset={a} />
                <span>{a.name}</span>
                <button type="button" className="danger" aria-label={`Delete ${a.name}`} onClick={() => onDeleteArtwork(a.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
