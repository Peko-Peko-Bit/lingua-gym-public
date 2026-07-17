import { Session, SessionSummary } from "@/types";
import { apiFetch } from "./api-fetch";

// ---------------------------------------------------------------------------
// Concurrent-save guard — saves are chained so none is dropped and no two
// run at once (racing delete/insert on the server corrupts segments)
// ---------------------------------------------------------------------------
let saveChain: Promise<void> = Promise.resolve();

// ---------------------------------------------------------------------------
// Public API — thin fetch wrappers over /api/sessions
// All Supabase access is server-side only (see app/api/sessions/*)
// ---------------------------------------------------------------------------

export async function getAllSessions(): Promise<SessionSummary[]> {
  const res = await apiFetch("/api/sessions");
  if (!res.ok) {
    console.error("[storage] getAllSessions:", res.status);
    return [];
  }
  return res.json();
}

export async function getSession(id: string): Promise<Session | undefined> {
  const res = await apiFetch(`/api/sessions/${id}`);
  if (!res.ok) return undefined;
  const data = await res.json();
  return data ?? undefined;
}

export function saveSession(session: Session): Promise<void> {
  const run = async () => {
    const res = await apiFetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(session),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[storage] saveSession:", err);
    }
  };
  saveChain = saveChain.then(run, run);
  return saveChain;
}

export async function deleteSession(id: string): Promise<void> {
  const res = await apiFetch(`/api/sessions/${id}`, { method: "DELETE" });
  if (!res.ok) {
    console.error("[storage] deleteSession:", res.status);
  }
}

export async function pinSession(id: string, isPinned: boolean): Promise<void> {
  const res = await apiFetch(`/api/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "pin", isPinned }),
  });
  if (!res.ok) {
    console.error("[storage] pinSession:", res.status);
  }
}

export async function renameSession(id: string, title: string): Promise<void> {
  const res = await apiFetch(`/api/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "rename", title }),
  });
  if (!res.ok) {
    console.error("[storage] renameSession:", res.status);
  }
}

// ---------------------------------------------------------------------------
// Pure utilities
// ---------------------------------------------------------------------------

export function generateSessionId(): string {
  return `session-${crypto.randomUUID()}`;
}

export function generateSessionTitle(sourceText: string): string {
  if (!sourceText.trim()) return "Untitled Session";
  const firstLine = sourceText.trim().split("\n")[0];
  return firstLine.length > 40 ? firstLine.substring(0, 40) + "…" : firstLine;
}
