"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Radar } from "lucide-react";
import { api, setToken } from "@/lib/api";
import { Button, ErrorNote, Field, inputCls } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ access_token: string }>("/api/auth/login", {
        method: "POST",
        body: new URLSearchParams({ username: email, password }),
      });
      setToken(res.access_token);
      router.replace("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-sm bg-surface p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-black text-white">
            <Radar size={22} />
          </span>
          <div>
            <h1 className="text-lg font-semibold">Benue–Plateau Monitor</h1>
            <p className="text-sm text-muted">Authorised personnel only</p>
          </div>
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Field label="Email">
          <input className={inputCls} type="email" autoComplete="username" value={email}
            onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password">
          <input className={inputCls} type="password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Button type="submit" disabled={busy} className="w-full">{busy ? "Signing in…" : "Sign in"}</Button>
      </form>
    </main>
  );
}
