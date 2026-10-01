import { encode } from "uqr";

/** A QR code as one SVG path, always dark on white so any scanner reads it in either theme. */
export function QrCode({ value, label, size = 184 }: { value: string; label: string; size?: number }) {
  const { data } = encode(value, { ecc: "M", border: 2 });
  const path = data.flatMap((row, y) => row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : ""))).join("");
  return (
    <svg
      viewBox={`0 0 ${data.length} ${data.length}`}
      width={size}
      height={size}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className="rounded-lg border border-line bg-white"
    >
      <path d={path} fill="#16181d" />
    </svg>
  );
}
