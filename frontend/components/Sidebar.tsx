"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  Bell, Camera, CircleHelp, CircleUserRound, Flame, LayoutGrid, LogOut, Map, Menu, Radar,
  Settings, ShieldAlert, TrendingUp, Upload, Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

const GROUPS = [
  [{ href: "/dashboard", label: "Dashboard", icon: LayoutGrid }],
  [
    { href: "/incidents", label: "Incidents", icon: ShieldAlert },
    { href: "/map", label: "Map", icon: Map },
    { href: "/hotspots", label: "Hotspots", icon: Flame },
  ],
  [
    { href: "/predictions", label: "Predictions", icon: TrendingUp },
    { href: "/alerts", label: "Alerts", icon: Bell },
    { href: "/communities", label: "Communities", icon: Users },
  ],
  [
    { href: "/surveillance", label: "Surveillance", icon: Camera },
    { href: "/uploads", label: "Uploads", icon: Upload },
  ],
];

export function Sidebar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const path = usePathname();
  const { user, logout } = useAuth();
  const active = (href: string) => path.startsWith(href);
  const item = (on: boolean) =>
    clsx(
      "flex items-center gap-3 rounded-md px-4 py-2.5 text-[15px]",
      on ? "bg-primary-soft text-[#2a3a8f]" : "text-ink-2 hover:bg-canvas",
    );

  return (
    <aside
      className={clsx(
        "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-surface px-5 pb-6 pt-6 transition-transform lg:translate-x-0",
        open ? "translate-x-0 shadow-xl" : "-translate-x-full",
      )}
    >
      <div className="mb-10 flex items-center gap-6 px-2">
        <button onClick={onToggle} className="text-muted hover:text-ink" aria-label="Toggle menu">
          <Menu size={20} strokeWidth={1.5} />
        </button>
        <span className="grid size-9 place-items-center rounded-full bg-black text-white" title="Benue–Plateau Monitor">
          <Radar size={20} strokeWidth={2} />
        </span>
      </div>

      <nav className="flex-1 space-y-8 overflow-y-auto">
        {GROUPS.map((g, i) => (
          <ul key={i} className="space-y-1">
            {g.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link href={href} onClick={() => open && onToggle()} className={item(active(href))}>
                  <Icon size={20} strokeWidth={1.4} />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        ))}
      </nav>

      <ul className="space-y-1 pt-6">
        <li>
          <Link href="/help" className={item(active("/help"))}>
            <CircleHelp size={20} strokeWidth={1.4} /> Help
          </Link>
        </li>
        <li>
          <Link href="/settings" className={item(active("/settings"))}>
            <Settings size={20} strokeWidth={1.4} /> Settings
          </Link>
        </li>
        <li className="flex items-center gap-3 rounded-md px-4 py-2.5 text-[15px] text-ink-2">
          <CircleUserRound size={20} strokeWidth={1.4} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate" title={user?.email}>
            {user?.name || user?.email}
            <span className="block text-xs capitalize text-muted">{user?.role.replace("_", " ")}</span>
          </span>
          <button onClick={logout} className="text-muted hover:text-ink" aria-label="Sign out" title="Sign out">
            <LogOut size={16} />
          </button>
        </li>
      </ul>
    </aside>
  );
}
