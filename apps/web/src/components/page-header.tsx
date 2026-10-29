import { ChevronRight } from "lucide-react";

export function PageHeader({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-line px-6">
      <p className="flex items-center gap-1.5 text-[13px] text-muted">
        Service desk de TI <ChevronRight className="size-3.5" />
        <span className="font-medium text-ink">{title}</span>
      </p>
      {aside}
    </header>
  );
}
