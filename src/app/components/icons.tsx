// Small inline icons; all decorative (aria-hidden), the text beside them carries the meaning.
interface IconProps {
  size?: number;
}

const base = (size: number) => ({
  "aria-hidden": true,
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function CheckIcon({ size = 14 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={3}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function LockIcon({ size = 12 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2.4}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function WarnIcon({ size = 12 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2.4}>
      <path d="M12 3l9.5 17h-19z" />
      <path d="M12 10v4.5M12 17.5v.01" />
    </svg>
  );
}

export function FolderIcon({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

export function ArrowIcon({ size = 14 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2.4}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
