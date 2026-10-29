const TONES = [
  "bg-brand-soft text-brand",
  "bg-orange-100 text-orange-700",
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-pink-100 text-pink-700",
  "bg-slate-100 text-slate-600",
  "bg-amber-100 text-amber-700",
];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
  ).toUpperCase();
}

/** Cor estável por pessoa, como na lista de conversas do protótipo. */
function toneFor(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length] ?? "bg-brand-soft text-brand";
}

export function Avatar({
  name,
  seed = name,
  size = "md",
  self = false,
}: {
  name: string;
  seed?: string;
  size?: "sm" | "md";
  /** O próprio usuário logado: sempre na cor da marca. */
  self?: boolean;
}) {
  const box = size === "sm" ? "size-7 text-[11px]" : "size-9 text-[12px]";
  const tone = self ? "bg-brand-soft text-brand" : toneFor(seed);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${box} ${tone}`}
    >
      {initials(name)}
    </span>
  );
}
