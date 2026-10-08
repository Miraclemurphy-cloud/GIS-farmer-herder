import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const API_URL = (process.env.API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
export type Role = "admin" | "analyst" | "field_agent" | "viewer";

function fromFile(): Record<string, { email: string; password: string }> {
  try {
    const text = readFileSync(resolve(__dirname, "../../demo-credentials.txt"), "utf-8");
    const out: Record<string, { email: string; password: string }> = {};
    for (const line of text.split("\n")) {
      const [role, email, password] = line.trim().split(/\s+/);
      if (role && !role.startsWith("#") && email && password) out[role] = { email, password };
    }
    return out;
  } catch {
    return {};
  }
}

export function creds(role: Role) {
  const key = role.toUpperCase();
  const env = { email: process.env[`DEMO_${key}_EMAIL`], password: process.env[`DEMO_${key}_PASSWORD`] };
  const c = env.email && env.password ? env : fromFile()[role];
  if (!c?.email || !c?.password) throw new Error(`No ${role} credentials: run demo-users or set DEMO_${key}_EMAIL/PASSWORD`);
  return c as { email: string; password: string };
}

const tokens: Partial<Record<Role, string>> = {};

export async function token(request: APIRequestContext, role: Role): Promise<string> {
  if (tokens[role]) return tokens[role]!;
  const { email, password } = creds(role);
  const res = await request.post(`${API_URL}/api/auth/login`, { form: { username: email, password } });
  expect(res.status(), `login as ${role}`).toBe(200);
  tokens[role] = (await res.json()).access_token;
  return tokens[role]!;
}

export async function api<T = unknown>(request: APIRequestContext, role: Role, path: string,
  opts: { method?: "GET" | "POST" | "PATCH"; data?: unknown } = {}) {
  const res = await request.fetch(`${API_URL}${path}`, {
    method: opts.method ?? "GET",
    headers: { Authorization: `Bearer ${await token(request, role)}` },
    data: opts.data,
  });
  return { status: res.status(), body: (res.headers()["content-type"]?.includes("json") ? await res.json() : null) as T };
}

/** Signs in by placing a session token in storage (the UI login itself is covered in auth.spec). */
export async function signIn(page: Page, request: APIRequestContext, role: Role) {
  const t = await token(request, role);
  await page.addInitScript((value) => window.localStorage.setItem("gis.token", value), t);
}
