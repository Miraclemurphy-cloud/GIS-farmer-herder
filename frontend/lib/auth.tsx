"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken, setToken } from "./api";

export type User = { id: number; email: string; name: string; role: "admin" | "analyst" | "field_agent" | "viewer" };
const RANK = { viewer: 0, field_agent: 1, analyst: 2, admin: 3 } as const;

const AuthCtx = createContext<{ user: User | null; logout: () => void; can: (r: User["role"]) => boolean }>({
  user: null,
  logout: () => {},
  can: () => false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api<User>("/api/auth/me").then(setUser).catch(() => router.replace("/login"));
  }, [router]);

  const logout = () => {
    setToken(null);
    router.replace("/login");
  };
  const can = (r: User["role"]) => !!user && RANK[user.role] >= RANK[r];

  if (!user) return <div className="grid h-screen place-items-center text-muted">Loading…</div>;
  return <AuthCtx.Provider value={{ user, logout, can }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
