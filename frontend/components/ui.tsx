"use client";
import clsx from "clsx";
import { CalendarDays, ChevronDown, CircleHelp } from "lucide-react";
import { useEffect, useRef, useState } from "react";

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onOutside();
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onOutside]);
  return ref;
}

export function PageTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-[32px] font-normal tracking-tight text-ink">{title}</h1>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={clsx("rounded-sm bg-surface", className)}>{children}</section>;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-[19px] font-semibold text-ink">{children}</h2>
      {right}
    </div>
  );
}

export function BigStat({ value, caption }: { value: React.ReactNode; caption: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="display-num text-[46px] text-ink">{value}</span>
      <span className="text-[15px] text-ink-2">{caption}</span>
    </div>
  );
}

export function StackedStat({ value, caption, hint }: { value: React.ReactNode; caption: string; hint?: string }) {
  return (
    <div>
      <div className="display-num text-[42px] text-ink">{value}</div>
      <div className="mt-2 max-w-[11rem] text-[15px] leading-snug text-ink-2">
        {caption}
        {hint && (
          <span className="tip ml-1.5 inline-block align-[-2px] text-muted" data-tip={hint}>
            <CircleHelp size={14} />
          </span>
        )}
      </div>
    </div>
  );
}

export function Swatch({ color, className }: { color: string; className?: string }) {
  return <span className={clsx("inline-block size-4 shrink-0 rounded-[3px]", className)} style={{ background: color }} />;
}

export function Chip({ active, onClick, children, color }: {
  active?: boolean; onClick?: () => void; children: React.ReactNode; color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-2 rounded-md border px-3 py-1 text-[15px] transition-colors",
        active ? "border-transparent bg-primary-soft text-[#2a3a8f]" : "border-line bg-surface text-ink-2 hover:bg-canvas",
      )}
    >
      {color && <Swatch color={color} />}
      {children}
    </button>
  );
}

export const RANGES = [
  { value: 1, label: "last month" },
  { value: 3, label: "last 3 months" },
  { value: 6, label: "last 6 months" },
  { value: 12, label: "last 12 months" },
  { value: 36, label: "last 3 years" },
];

export function Dropdown<T extends string | number>({ value, options, onChange, icon }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; icon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const current = options.find((o) => o.value === value);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-[15px] text-muted hover:text-ink-2">
        {icon && <CalendarDays size={20} strokeWidth={1.3} />}
        {current?.label}
        <ChevronDown size={14} />
      </button>
      {open && (
        <ul className="absolute right-0 z-30 mt-2 min-w-40 rounded-md border border-line bg-surface py-1 shadow-lg">
          {options.map((o) => (
            <li key={String(o.value)}>
              <button
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={clsx("block w-full px-4 py-2 text-left text-sm hover:bg-canvas", o.value === value && "text-primary")}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Menu({ label, items }: { label: string; items: { label: string; onClick?: () => void; href?: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 rounded-[4px] bg-primary px-4 py-2.5 text-[15px] text-white shadow-sm hover:brightness-110"
      >
        {label} <ChevronDown size={16} fill="currentColor" />
      </button>
      {open && (
        <ul className="absolute right-0 z-30 mt-2 w-52 rounded-md border border-line bg-surface py-1 shadow-lg">
          {items.map((i) => (
            <li key={i.label}>
              {i.href ? (
                <a href={i.href} className="block px-4 py-2 text-sm text-ink-2 hover:bg-canvas">{i.label}</a>
              ) : (
                <button
                  onClick={() => {
                    i.onClick?.();
                    setOpen(false);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-ink-2 hover:bg-canvas"
                >
                  {i.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-8">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={clsx(
            "-mb-px border-b-2 px-2 pb-3 text-[16px]",
            t.value === value ? "border-[#2a3a8f] text-[#2a3a8f]" : "border-transparent text-ink hover:text-ink-2",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Button({ variant = "primary", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
}) {
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-[4px] px-4 py-2 text-[15px] disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-primary text-white shadow-sm hover:brightness-110",
        variant === "ghost" && "border border-line bg-surface text-ink-2 hover:bg-canvas",
        variant === "danger" && "border border-[#f3c9cd] bg-surface text-crimson hover:bg-[#fdf2f3]",
        className,
      )}
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-[4px] border border-line bg-surface px-3 py-2 text-[15px] outline-none focus:border-primary";

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-10 text-center text-sm text-muted">{children}</div>;
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-[#f3c9cd] bg-[#fdf2f3] px-4 py-3 text-sm text-crimson">{children}</div>;
}

export function Badge({ children, tone = "grey" }: { children: React.ReactNode; tone?: "grey" | "red" | "amber" | "green" | "blue" }) {
  const tones = {
    grey: "bg-canvas text-ink-2",
    red: "bg-[#fdecee] text-crimson",
    amber: "bg-[#fff5dc] text-[#8a6100]",
    green: "bg-[#e8f4ec] text-[#2b6b45]",
    blue: "bg-primary-soft text-[#2a3a8f]",
  };
  return <span className={clsx("inline-block rounded px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function Drawer({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="text-2xl leading-none text-muted hover:text-ink" aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
