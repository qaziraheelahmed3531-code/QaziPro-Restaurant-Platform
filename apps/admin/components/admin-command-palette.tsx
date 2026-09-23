"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type AdminCommand = { label: string; href: string; section: string };

const shortcuts: Record<string, string> = {
  "1": "/",
  "2": "/orders",
  "3": "/menu",
  "4": "/reports",
  "5": "/customers",
  "6": "/settings",
};

function isEditing(target: EventTarget | null) {
  return target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

export function AdminCommandPalette({ commands }: { commands: AdminCommand[] }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const visible = useMemo(() => commands.filter(command =>
    `${command.label} ${command.section}`.toLowerCase().includes(query.trim().toLowerCase()),
  ).slice(0, 24), [commands, query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(value => !value);
        return;
      }
      if (isEditing(event.target) || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey)) return;
      const href = shortcuts[event.key];
      if (href && commands.some(command => command.href === href)) {
        event.preventDefault();
        router.push(href);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("admin-open-command", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("admin-open-command", onOpen);
    };
  }, [commands, router]);

  useEffect(() => {
    if (open && !dialog.current?.open) {
      dialog.current?.showModal();
      input.current?.focus();
    } else if (!open && dialog.current?.open) {
      dialog.current.close();
    }
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
    setActive(0);
  }

  return (
    <dialog
      className="admin-command-dialog"
      ref={dialog}
      aria-label="Search pages and actions"
      onClose={close}
      onClick={event => { if (event.target === dialog.current) close(); }}
      onKeyDown={event => {
        if (event.key === "ArrowDown") { event.preventDefault(); setActive(value => Math.min(value + 1, visible.length - 1)); }
        if (event.key === "ArrowUp") { event.preventDefault(); setActive(value => Math.max(0, value - 1)); }
        if (event.key === "Enter" && visible[active]) { event.preventDefault(); router.push(visible[active].href); close(); }
      }}
    >
      <div className="admin-command-dialog__search">
        <Search aria-hidden="true" />
        <input
          ref={input}
          value={query}
          onChange={event => { setQuery(event.target.value); setActive(0); }}
          placeholder="Search permitted pages…"
          aria-label="Search permitted pages"
          aria-controls="admin-command-results"
        />
        <button type="button" aria-label="Close search" onClick={close}><X aria-hidden="true" /></button>
      </div>
      <div id="admin-command-results" className="admin-command-dialog__results" role="listbox" aria-label="Pages">
        {visible.length ? visible.map((command, index) => (
          <Link
            key={`${command.section}-${command.href}`}
            href={command.href}
            role="option"
            aria-selected={index === active}
            onMouseEnter={() => setActive(index)}
            onClick={close}
          >
            <span>{command.label}<small>{command.section}</small></span>
            <span aria-hidden="true">↵</span>
          </Link>
        )) : <p>No matching pages in your access.</p>}
      </div>
      <footer><span>↑ ↓ Navigate</span><span>Enter Open</span><span>Esc Close</span></footer>
    </dialog>
  );
}
