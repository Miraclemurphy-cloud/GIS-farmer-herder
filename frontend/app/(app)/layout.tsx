"use client";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { AuthProvider } from "@/lib/auth";
import { LiveProvider } from "@/lib/live";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <AuthProvider>
      <LiveProvider>
        <Sidebar open={open} onToggle={() => setOpen(!open)} />
        {open && <div className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={() => setOpen(false)} />}
        <div className="min-h-screen lg:pl-[248px]">
          <button
            onClick={() => setOpen(true)}
            className="m-4 mb-0 rounded p-1 text-ink-2 lg:hidden"
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
          <main className="mx-auto max-w-[1480px] px-4 pb-16 pt-4 sm:px-6 lg:px-7 lg:pt-8">{children}</main>
        </div>
      </LiveProvider>
    </AuthProvider>
  );
}
