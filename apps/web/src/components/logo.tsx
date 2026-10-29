export function LogoMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M4 20V4h3.2l9.6 11.2V4H20v16h-3.2L7.2 8.8V20z" fill="currentColor" />
    </svg>
  );
}

export function Logo({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    <span
      className={`flex items-center gap-2 text-[15px] font-semibold ${tone === "light" ? "text-white" : "text-ink"}`}
    >
      <LogoMark className={`size-5 ${tone === "light" ? "text-white" : "text-brand"}`} />
      Nexo Assist
    </span>
  );
}
