"use client";

import { MessageSquare, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/atendimento", label: "Atendimento", icon: MessageSquare },
  { href: "/perfil", label: "Meu perfil", icon: User },
] as const;

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="space-y-1 px-3">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition ${
              active ? "bg-brand-soft text-brand" : "text-ink-soft hover:bg-canvas"
            }`}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
