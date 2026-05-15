"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Calendar,
  PencilLine,
  CheckCircle2,
  Settings as SettingsIcon,
} from "lucide-react";

const items = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/requests", label: "Blog Requests", icon: FileText },
  { href: "/admin/scheduled", label: "Scheduled", icon: Calendar },
  { href: "/admin/drafts", label: "Drafts", icon: PencilLine },
  { href: "/admin/published", label: "Published", icon: CheckCircle2 },
  { href: "/admin/settings", label: "Settings", icon: SettingsIcon },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-60 shrink-0 border-r border-zinc-200 bg-white flex flex-col">
      <div className="px-5 py-5 border-b border-zinc-200">
        <div className="text-base font-semibold tracking-tight">AutoBlog</div>
        <div className="text-xs text-zinc-500 mt-0.5">Faclon Labs</div>
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {items.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                active
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 text-[11px] text-zinc-400 border-t border-zinc-200">
        v1 · Groq-powered
      </div>
    </aside>
  );
}
