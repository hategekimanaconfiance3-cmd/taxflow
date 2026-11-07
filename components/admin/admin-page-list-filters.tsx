"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type RowInfo = { element: HTMLElement; date: string | null; isEmptyState: boolean };

function dateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const iso = value.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const slash = value.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${slash[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const monthName = value.match(/\b([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (monthName) {
    const parsed = new Date(`${monthName[1]} ${monthName[2]}, ${monthName[3]} UTC`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  const dayMonthName = value.match(/\b(\d{1,2})\s+([A-Za-z]{3,}),?\s+(\d{4})\b/);
  if (dayMonthName) {
    const parsed = new Date(`${dayMonthName[2]} ${dayMonthName[1]}, ${dayMonthName[3]} UTC`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function getRowDate(element: HTMLElement): string | null {
  const time = element.querySelector("time[datetime]")?.getAttribute("datetime");
  const dataDate = element.getAttribute("data-date") ?? element.querySelector("[data-date]")?.getAttribute("data-date");
  const explicitDate = dateKey(time ?? dataDate);
  if (explicitDate) return explicitDate;

  const table = element.closest("table");
  if (table && element.tagName === "TR") {
    const headerCells = Array.from(table.querySelectorAll("thead th"));
    const cells = Array.from(element.querySelectorAll("td"));
    const dateIndex = headerCells.findIndex((header) => /date|created|updated|received|submitted|registered|period|timestamp|time/i.test(header.textContent ?? ""));
    if (dateIndex >= 0) return dateKey(cells[dateIndex]?.textContent);
  }

  return dateKey(element.textContent);
}

function collectRows(root: HTMLElement): RowInfo[] {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(
    "tbody tr, [data-admin-filter-row], ul > li, ol > li, .divide-y > div",
  ));
  const unique = candidates.filter((element) => {
    if (element.closest("table") && element.tagName !== "TR") return false;
    if (element.tagName === "TR" && element.querySelector("td[colspan]")) return false;
    return !candidates.some((other) => other !== element && other.contains(element));
  });
  return unique.map((element) => ({
    element,
    date: getRowDate(element),
    isEmptyState: /no .*(found|records|available|yet)|nothing to (show|display)/i.test(element.textContent ?? ""),
  }));
}

export function AdminPageListFilters() {
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [through, setThrough] = useState("");
  const [hasRows, setHasRows] = useState(false);
  const [counts, setCounts] = useState({ visible: 0, total: 0 });
  const active = Boolean(query.trim() || from || through);
  const filterRef = useRef({ query, from, through, active });
  const applyRef = useRef<() => void>(() => undefined);
  filterRef.current = { query, from, through, active };

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("main");
    if (!root) return;
    const originalDisplays = new WeakMap<HTMLElement, string>();
    let lastTotal = -1;
    let lastVisible = -1;
    let lastHasRows = false;

    const apply = () => {
      const filters = filterRef.current;
      const rows = collectRows(root);
      const candidates = rows.filter((row) => !row.isEmptyState);
      let visible = 0;
      for (const row of rows) {
        if (!originalDisplays.has(row.element)) originalDisplays.set(row.element, row.element.style.display);
        const matchesText = !filters.query.trim() || (row.element.textContent ?? "").toLocaleLowerCase().includes(filters.query.trim().toLocaleLowerCase());
        const matchesDate = (!filters.from && !filters.through) || Boolean(row.date && (!filters.from || row.date >= filters.from) && (!filters.through || row.date <= filters.through));
        const matches = row.isEmptyState ? !filters.active : matchesText && matchesDate;
        row.element.style.display = matches ? originalDisplays.get(row.element) ?? "" : "none";
        if (matches && !row.isEmptyState) visible += 1;
      }
      const nextHasRows = candidates.length > 0;
      if (nextHasRows !== lastHasRows) { lastHasRows = nextHasRows; setHasRows(nextHasRows); }
      if (visible !== lastVisible || candidates.length !== lastTotal) {
        lastVisible = visible;
        lastTotal = candidates.length;
        setCounts({ visible, total: candidates.length });
      }
    };

    applyRef.current = apply;
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); applyRef.current = () => undefined; };
  }, []);

  useEffect(() => { applyRef.current(); }, [query, from, through, active]);

  const summary = useMemo(() => active
    ? `${counts.visible} of ${counts.total} rows shown`
    : `${counts.total} rows on this page`, [active, counts]);

  if (!hasRows) return null;

  function clear() {
    setQuery("");
    setFrom("");
    setThrough("");
  }

  return (
    <section aria-label="Filter admin lists on this page" className="mb-5 rounded-lg border bg-card px-3 py-3 shadow-sm sm:px-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">FILTER LISTS ON THIS PAGE</p>
        <p aria-live="polite" className="text-xs text-muted-foreground">{summary}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_minmax(145px,180px)_minmax(145px,180px)_auto]">
        <label className="relative min-w-0">
          <span className="sr-only">Search rows on this page</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search any list on this page…" className="h-10 pl-9" />
        </label>
        <label className="relative">
          <span className="sr-only">Filter from date</span>
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="date" value={from} max={through || undefined} onChange={(event) => setFrom(event.target.value)} className="h-10 pl-9" aria-label="From date" />
        </label>
        <label className="relative">
          <span className="sr-only">Filter through date</span>
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="date" value={through} min={from || undefined} onChange={(event) => setThrough(event.target.value)} className="h-10 pl-9" aria-label="Through date" />
        </label>
        {active && <Button type="button" variant="outline" onClick={clear} className="h-10 gap-1.5"><X className="h-4 w-4" />Clear filters</Button>}
      </div>
      {(from || through) && <p className="mt-2 text-[11px] text-muted-foreground">Date range filters each list row by its displayed date. These filters apply to records currently loaded on this page.</p>}
    </section>
  );
}
