"use client";

const CHAT_URL      = process.env.NEXT_PUBLIC_CHAT_URL      ?? "";
const GRAMMAR_URL   = process.env.NEXT_PUBLIC_GRAMMAR_URL   ?? "";
const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "";

const EXTERNAL_ITEMS = [
  { id: "chat",      label: "Chat",      url: CHAT_URL },
  { id: "grammar",   label: "Grammar",   url: GRAMMAR_URL },
  { id: "dashboard", label: "Dashboard", url: DASHBOARD_URL },
] as const;

export function AppNav() {
  const items = EXTERNAL_ITEMS.filter((i) => i.url);
  if (items.length === 0) return null;

  return (
    <nav className="flex items-center gap-1">
      {items.map((item) => (
        <a
          key={item.id}
          href={item.url}
          className="px-2.5 py-1 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400
                     hover:text-indigo-600 dark:hover:text-indigo-400
                     hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
        >
          {item.label} ↗
        </a>
      ))}
    </nav>
  );
}
