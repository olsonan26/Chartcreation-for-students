"use client";

import type { CSSProperties, FormEvent, ImgHTMLAttributes } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  type MonthsSet,
  Report,
  isValidDob,
  normalizeDob,
  normalizeName,
} from "../lib/numerology";

type Client = {
  id: string;
  fullName: string;
  calledName: string;
  dob: string;
};

type AppView = "people" | "chart" | "compare";
type CompareMode = "years" | "months";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type StaticImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  priority?: boolean;
  unoptimized?: boolean;
};

function Image({ priority = false, unoptimized: _unoptimized, loading, ...props }: StaticImageProps) {
  return <img {...props} loading={priority ? "eager" : (loading ?? "lazy")} decoding="async" />;
}

function useDialogFocus(onClose: () => void) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector =
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
    const initialTarget = dialog.querySelector<HTMLElement>("input") ?? dialog.querySelector<HTMLElement>("button");

    initialTarget?.focus({ preventScroll: true });

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    dialog.addEventListener("keydown", handleKeyDown);
    return () => {
      dialog.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [onClose]);

  return dialogRef;
}

const STORAGE_KEY = "pass7-mobile-clients-v1";
const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const PRINT_DOTTED_ROWS = 2;

function spacedSequence(value: string): string {
  return value.split("").join(" ");
}

function NameNumberStack({ report }: { report: Report }) {
  const letterGroups = report.fullLetters.trim().split(/\s+/);
  const partTotals = report.fullLettersTotalPart.trim().split(/\s+/);
  const style = {
    gridTemplateColumns: `repeat(${letterGroups.length}, max-content) max-content`,
  } as CSSProperties;

  return (
    <div className="name-number-stack" style={style} aria-label="Name numbers and centered reductions">
      {letterGroups.map((value, index) => (
        <code key={`letters-${index}`} style={{ gridColumn: index + 1, gridRow: 1 }}>{value}</code>
      ))}
      <code className="name-grand-total" style={{ gridColumn: letterGroups.length + 1, gridRow: 1 }}>{report.fullLettersTotal}</code>
      {partTotals.map((value, index) => (
        <code className="name-part-total" key={`total-${index}`} style={{ gridColumn: index + 1, gridRow: 2 }}>{value}</code>
      ))}
    </div>
  );
}

const EMPTY_MONTH: MonthsSet = {
  essence: "............",
  personalYear: "............",
  personalMonth: "............",
  personalMonthEssence: "............",
  combined: "............",
};

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function YearGrid({
  report,
  start,
  length,
  includeNames = true,
  label = "Year chart",
}: {
  report: Report;
  start: number;
  length: number;
  includeNames?: boolean;
  label?: string;
}) {
  const set = report.getYearSet(start, length);
  const ages = Array.from({ length }, (_, index) => start + index);
  const rows = [
    ...(includeNames
      ? set.names.map((value, index) => ({ label: report.names[index] || `Name ${index + 1}`, value, tone: "name" }))
      : []),
    { label: "Essence", value: set.essence, tone: "essence" },
    { label: "Combined", value: set.combined, tone: "combined" },
    { label: "Personal", value: set.personalYear, tone: "personal" },
    { label: "Calendar", value: set.calendarYear, tone: "calendar" },
  ];
  const gridStyle = {
    gridTemplateColumns: `82px repeat(${length}, 30px)`,
  } as CSSProperties;

  return (
    <div className="chart-scroll" role="region" aria-label={label} tabIndex={0}>
      <div className="number-grid" style={gridStyle}>
        <div className="grid-label grid-heading">Age</div>
        {ages.map((age) => (
          <div
            className={`number-cell age-cell ${age === report.age ? "current-cell" : ""}`}
            key={`age-${age}`}
            title={age === report.age ? "Current age" : undefined}
          >
            {age}
          </div>
        ))}
        {rows.map((row) => (
          <div className="grid-row-fragment" key={`${row.label}-${row.value}`}>
            <div className={`grid-label tone-${row.tone}`}>{row.label}</div>
            {Array.from(row.value).map((value, index) => (
              <div
                className={`number-cell tone-${row.tone} ${ages[index] === report.age ? "current-column" : ""}`}
                key={`${row.label}-${index}`}
              >
                {value === " " ? "·" : value}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthCard({ title, set }: { title: string; set: MonthsSet }) {
  const rows = [
    { label: "Ess", value: set.essence, tone: "name" },
    { label: "PME", value: set.personalMonthEssence, tone: "essence" },
    { label: "Comb", value: set.combined, tone: "combined" },
    { label: "PM", value: set.personalMonth, tone: "personal" },
    { label: "Month", value: MONTHS.join(""), tone: "calendar" },
    { label: "PY", value: set.personalYear, tone: "name" },
  ];
  return (
    <article className="month-card">
      <h4>{title}</h4>
      <div className="month-grid">
        {rows.map((row) => (
          <div className="month-row" key={`${title}-${row.label}`}>
            <span className={`month-label tone-${row.tone}`}>{row.label}</span>
            {Array.from(row.value).map((value, index) => (
              <span className={`month-value tone-${row.tone}`} key={`${row.label}-${index}`}>
                {value}
              </span>
            ))}
          </div>
        ))}
      </div>
    </article>
  );
}

function MonthBand({ report, focusAge }: { report: Report; focusAge: number }) {
  const birthYear = new Date().getFullYear() - report.age;
  return (
    <div className="month-band" tabIndex={0} role="region" aria-label="Three-year monthly cycle chart; scroll horizontally to explore">
      {[focusAge - 1, focusAge, focusAge + 1].map((age) => (
        <MonthCard
          key={age}
          title={age < 0 ? "Before birth" : `${birthYear + age} · age ${age}`}
          set={age < 0 ? EMPTY_MONTH : report.getMonthSet(age)}
        />
      ))}
    </div>
  );
}

type PrintTone = "black" | "red" | "blue" | "cyan" | "green";

function PrintCharacterRow({
  value,
  length,
  tone = "black",
  label = "",
}: {
  value: string;
  length: number;
  tone?: PrintTone;
  label?: string;
}) {
  const characters = Array.from(value.padEnd(length, " ").slice(0, length));
  const style = { "--print-columns": length } as CSSProperties;
  return (
    <div className="print-data-row">
      <div className={`print-character-row print-tone-${tone}`} style={style}>
        {characters.map((character, index) => (
          <span key={index}>{character === " " ? "\u00a0" : character}</span>
        ))}
      </div>
      <span className={`print-row-label print-tone-${tone}`}>{label}</span>
    </div>
  );
}

function ageMarker(start: number, length: number, kind: "tens" | "ones"): string {
  return Array.from({ length }, (_, index) => {
    const age = start + index;
    if (kind === "ones") return String(age % 10);
    return age % 10 === 0 ? String(Math.floor(age / 10) % 10) : " ";
  }).join("");
}

function PrintYearSection({
  report,
  start,
  length,
  variant,
}: {
  report: Report;
  start: number;
  length: number;
  variant: "focus" | "lifetime";
}) {
  const set = report.getYearSet(start, length);
  const markerIndex = report.age - start;
  const marker = markerIndex >= 0 && markerIndex < length
    ? `${" ".repeat(markerIndex)}*`
    : "";

  return (
    <section className={`print-year-section print-year-${variant}`} aria-label={`${variant} year cycles`}>
      {variant === "focus" && <PrintCharacterRow value={marker} length={length} tone="red" />}
      <PrintCharacterRow value={ageMarker(start, length, "tens")} length={length} />
      <PrintCharacterRow value={ageMarker(start, length, "ones")} length={length} />
      {set.names.map((value, index) => (
        <PrintCharacterRow key={`name-${index}`} value={value} length={length} tone="red" />
      ))}
      {Array.from({ length: PRINT_DOTTED_ROWS }, (_, index) => (
        <PrintCharacterRow key={`dots-${index}`} value={":".repeat(length)} length={length} tone="red" />
      ))}
      <PrintCharacterRow value={set.essence} length={length} tone="blue" label="ESS" />
      <PrintCharacterRow value={set.combined} length={length} tone="cyan" label="COM" />
      <PrintCharacterRow value={set.personalYear} length={length} tone="blue" label="PY" />
      <PrintCharacterRow value={set.calendarYear} length={length} tone="green" label="CY" />
    </section>
  );
}

function PrintMonthSection({
  report,
  currentYear,
  focusYear,
}: {
  report: Report;
  currentYear: number;
  focusYear: number;
}) {
  const focusAge = report.age + focusYear - currentYear;
  const ages = [focusAge - 1, focusAge, focusAge + 1];
  const sets = ages.map((age) => age < 0 ? EMPTY_MONTH : report.getMonthSet(age));
  const join = (select: (set: MonthsSet) => string) => sets.map(select).join("");
  const birthYear = currentYear - report.age;

  return (
    <section className="print-month-section" aria-label={`Three year monthly cycles centered on ${focusYear}`}>
      <PrintCharacterRow value={join((set) => set.essence)} length={36} tone="red" label="ESS" />
      <PrintCharacterRow value={join((set) => set.personalMonthEssence)} length={36} tone="blue" label="PME" />
      <PrintCharacterRow value={join((set) => set.combined)} length={36} tone="cyan" label="MCOM" />
      <PrintCharacterRow value={join((set) => set.personalMonth)} length={36} tone="blue" label="PM" />
      <PrintCharacterRow value={MONTHS.join("").repeat(3)} length={36} tone="green" label="CM" />
      <PrintCharacterRow value={join((set) => set.personalYear)} length={36} tone="red" label="PY" />
      <div className="print-month-years">
        {ages.map((age) => <span key={age}>{birthYear + age}</span>)}
      </div>
    </section>
  );
}

function PassPrintReport({
  client,
  report,
  currentYear,
  chartDate,
}: {
  client: Client;
  report: Report;
  currentYear: number;
  chartDate: string;
}) {
  const focusStart = Math.max(0, report.age - 14);
  const birthYear = currentYear - report.age;
  const minMonthYear = birthYear;
  const maxMonthYear = Math.max(currentYear + 40, birthYear + 119);
  const [monthFocusYear, setMonthFocusYear] = useState(currentYear);

  useEffect(() => {
    setMonthFocusYear(currentYear);
  }, [client.id, currentYear]);

  function changeMonthFocusYear(year: number) {
    setMonthFocusYear(Math.min(maxMonthYear, Math.max(minMonthYear, year)));
  }

  return (
    <article className="pass-print-report" aria-label={`Printable Aionis timeline chart for ${client.fullName}`}>
      <div className="print-ornaments" aria-hidden="true">
        <span>Ω</span><span>Φ</span><span>Ψ</span><span>Δ</span>
      </div>
      <header className="print-report-masthead">
        <Image className="print-report-seal" src="/aionis-report-seal.png" alt="" width={120} height={140} unoptimized />
        <div className="print-brand" aria-label="Aionis Timeline Formula">
          <span><strong>AIONIS</strong><small>TIMELINE FORMULA</small></span>
        </div>
        <p className="print-tagline">You are time in motion.</p>
        <div className="print-masthead-meta">
          <time>{chartDate}</time>
          <code>UG: {report.ultimateGoal}</code>
        </div>
      </header>
      <section className="print-report-summary" aria-label="Chart identity and birth calculations">
        <div className="print-summary-identity">
          <code>{report.hdc}  {report.hdcTotal}</code>
          <code>{client.fullName.toUpperCase()}</code>
          <NameNumberStack report={report} />
        </div>
        <div className="print-summary-pmei">
          {report.pmei.map((value, index) => <code key={value}>{["P", "M", "E", "I"][index]} {value}</code>)}
        </div>
        <div className="print-summary-birth">
          <code>{report.dob}</code>
          <code>{report.birthForce}</code>
        </div>
        <div className="print-summary-pincha">
          <code>P: {spacedSequence(report.pin)}</code>
          <code>C: {spacedSequence(report.cha)}</code>
        </div>
        <div className="print-summary-seasons">
          <code>Age : {report.age}</code>
          {report.seasons.map((season) => <code key={season}>{season}</code>)}
        </div>
      </section>
      <section className="print-report-panel print-focus-panel">
        <h2>Yearly Timeline - Personal Cycles</h2>
        <div className="print-panel-scroll" tabIndex={0} role="region" aria-label="Yearly personal cycles; scroll horizontally on small screens">
          <PrintYearSection report={report} start={focusStart} length={30} variant="focus" />
        </div>
      </section>
      <section className="print-report-panel print-month-panel">
        <h2>Yearly / Monthly Timeline Summary</h2>
        <div className="focus-controls no-print" aria-label="Monthly timeline year controls">
          <button
            type="button"
            aria-label="Previous year"
            disabled={monthFocusYear <= minMonthYear}
            onClick={() => changeMonthFocusYear(monthFocusYear - 1)}
          >
            ‹
          </button>
          <label
            style={{
              display: "grid",
              gap: 6,
              alignItems: "center",
              textAlign: "center",
              color: "#8b591c",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            <span>Center year: {monthFocusYear}</span>
            <input
              type="range"
              min={minMonthYear}
              max={maxMonthYear}
              step={1}
              value={monthFocusYear}
              onChange={(event) => changeMonthFocusYear(Number(event.target.value))}
              aria-label="Choose center year for monthly timeline"
            />
          </label>
          <button
            type="button"
            aria-label="Next year"
            disabled={monthFocusYear >= maxMonthYear}
            onClick={() => changeMonthFocusYear(monthFocusYear + 1)}
          >
            ›
          </button>
        </div>
        <div className="print-panel-scroll" tabIndex={0} role="region" aria-label="Three year monthly timeline; scroll horizontally on small screens">
          <PrintMonthSection report={report} currentYear={currentYear} focusYear={monthFocusYear} />
        </div>
      </section>
      <section className="print-report-panel print-lifetime-panel">
        <h2>Sequence Timeline - Extended Cycles</h2>
        <div className="print-panel-scroll" tabIndex={0} role="region" aria-label="Extended sequence timeline; scroll horizontally on small screens">
          <PrintYearSection report={report} start={0} length={80} variant="lifetime" />
        </div>
      </section>
      <footer className="print-report-footer">
        <span aria-hidden="true">✦</span> Aionis Timeline Formula · Private and confidential. <span aria-hidden="true">✦</span>
      </footer>
    </article>
  );
}

function PersonForm({
  person,
  onCancel,
  onSave,
}: {
  person: Client | null;
  onCancel: () => void;
  onSave: (client: Client) => void;
}) {
  const [fullName, setFullName] = useState(person?.fullName ?? "");
  const [calledName, setCalledName] = useState(person?.calledName ?? "");
  const [dob, setDob] = useState(person?.dob ?? "");
  const [error, setError] = useState("");
  const dialogRef = useDialogFocus(onCancel);

  function submit(event: FormEvent) {
    event.preventDefault();
    const normalizedName = normalizeName(fullName);
    if (!normalizedName) {
      setError("Enter the full birth name used for the chart.");
      return;
    }
    if (!isValidDob(dob)) {
      setError("Enter a valid date in DD/MM/YYYY format.");
      return;
    }
    onSave({
      id: person?.id ?? makeId(),
      fullName: normalizedName,
      calledName: normalizeName(calledName),
      dob,
    });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section ref={dialogRef} className="sheet" role="dialog" aria-modal="true" aria-labelledby="person-form-title">
        <div className="sheet-handle" />
        <div className="section-heading">
          <div>
            <p className="eyebrow">Chart subject</p>
            <h2 id="person-form-title">{person ? "Edit person" : "Add a person"}</h2>
          </div>
          <button className="text-button" type="button" onClick={onCancel}>Cancel</button>
        </div>
        <form className="person-form" onSubmit={submit}>
          <label>
            Full birth name
            <input
              type="text"
              inputMode="text"
              autoComplete="name"
              autoCapitalize="words"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Alexander Morgan Hale"
            />
          </label>
          <label>
            Called name <span className="optional">Optional</span>
            <input
              type="text"
              inputMode="text"
              autoCapitalize="words"
              value={calledName}
              onChange={(event) => setCalledName(event.target.value)}
              placeholder="Alexander Hale"
            />
          </label>
          <label>
            Date of birth
            <input
              inputMode="numeric"
              autoComplete="bday"
              value={dob}
              onChange={(event) => setDob(normalizeDob(event.target.value))}
              placeholder="DD/MM/YYYY"
              maxLength={10}
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button full-button" type="submit">
            {person ? "Save changes" : "Create chart"}
          </button>
        </form>
      </section>
    </div>
  );
}

function InstallHelp({ onClose }: { onClose: () => void }) {
  const dialogRef = useDialogFocus(onClose);

  return (
    <div className="modal-backdrop" role="presentation">
      <section ref={dialogRef} className="sheet install-sheet" role="dialog" aria-modal="true" aria-labelledby="install-title">
        <div className="sheet-handle" />
        <div className="section-heading">
          <div>
            <p className="eyebrow">Phone installation</p>
            <h2 id="install-title">Add Aionis to your home screen</h2>
          </div>
          <button className="text-button" type="button" onClick={onClose}>Done</button>
        </div>
        <div className="install-steps">
          <div>
            <strong>iPhone or iPad</strong>
            <p>Open this page in Safari, tap Share, then choose Add to Home Screen.</p>
          </div>
          <div>
            <strong>Android</strong>
            <p>Open the browser menu and choose Install app or Add to Home screen.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function Home() {
  const currentYear = new Date().getFullYear();
  const chartDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
  const [clients, setClients] = useState<Client[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<AppView>("people");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<Client | "new" | null>(null);
  const [focusYear, setFocusYear] = useState(currentYear);
  const [compareMode, setCompareMode] = useState<CompareMode>("years");
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) setClients(JSON.parse(stored) as Client[]);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
      setHydrated(true);
    });
    let removeServiceWorkerListener: () => void = () => undefined;
    if ("serviceWorker" in navigator) {
      const hadController = Boolean(navigator.serviceWorker.controller);
      let refreshedForUpdate = false;
      const acceptUpdatedApp = () => {
        if (!hadController || refreshedForUpdate) return;
        refreshedForUpdate = true;
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", acceptUpdatedApp);
      removeServiceWorkerListener = () => navigator.serviceWorker.removeEventListener("controllerchange", acceptUpdatedApp);
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => undefined);
    }

    const captureInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", captureInstall);
    return () => {
      removeServiceWorkerListener();
      window.removeEventListener("beforeinstallprompt", captureInstall);
    };
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
  }, [clients, hydrated]);

  const selectedClient = clients.find((client) => client.id === selectedId) ?? null;
  const selectedReport = useMemo(
    () => (selectedClient ? new Report(selectedClient.fullName, selectedClient.dob, currentYear) : null),
    [currentYear, selectedClient],
  );
  const compareClients = clients.filter((client) => compareIds.includes(client.id));

  function openChart(client: Client) {
    setSelectedId(client.id);
    setView("chart");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function saveClient(client: Client) {
    setClients((current) => {
      const exists = current.some((item) => item.id === client.id);
      return exists
        ? current.map((item) => (item.id === client.id ? client : item))
        : [...current, client].sort((a, b) => a.fullName.localeCompare(b.fullName));
    });
    setEditing(null);
    openChart(client);
  }

  function deleteClient(client: Client) {
    if (!window.confirm(`Remove ${client.fullName} from this phone?`)) return;
    setClients((current) => current.filter((item) => item.id !== client.id));
    setCompareIds((current) => current.filter((id) => id !== client.id));
    if (selectedId === client.id) {
      setSelectedId(null);
      setView("people");
    }
  }

  function toggleCompare(id: string) {
    setCompareIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function installApp() {
    if (!installPrompt) {
      setShowInstallHelp(true);
      return;
    }
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  return (
    <main className="app-shell">
      <div className="cosmic-glyphs no-print" aria-hidden="true">
        <span>Ω</span><span>Φ</span><span>Ψ</span><span>Δ</span>
      </div>
      <header className="app-header no-print">
        <button className="brand-button" type="button" onClick={() => setView("people")} aria-label="Open people list">
          <Image src="/aionis-logo-transparent.png" alt="Aionis Timeline Formula" width={50} height={50} priority unoptimized />
          <span>
            <strong>AIONIS</strong>
            <small>Timeline Formula</small>
          </span>
        </button>
        <nav className="desktop-nav" aria-label="Primary desktop navigation">
          <button className={view === "people" ? "active" : ""} aria-current={view === "people" ? "page" : undefined} type="button" onClick={() => setView("people")}>Dashboard</button>
          <button type="button" onClick={() => setView("people")}>People</button>
          <button className={view === "chart" ? "active" : ""} aria-current={view === "chart" ? "page" : undefined} type="button" disabled={!selectedClient} onClick={() => setView("chart")}>Charts</button>
          <button className={view === "compare" ? "active" : ""} aria-current={view === "compare" ? "page" : undefined} type="button" onClick={() => setView("compare")}>Compare</button>
        </nav>
        <button className="install-button" type="button" onClick={installApp}>Install</button>
      </header>

      <div className="content-shell">
        {view === "people" && (
          <section className="people-view view-section">
            <div className="hero-card">
              <div className="hero-ornaments" aria-hidden="true"><span>Ω</span><span>Φ</span></div>
              <div className="hero-content">
                <div className="hero-copy">
                  <p className="eyebrow">Aionis Timeline Formula</p>
                  <h1>Map the patterns that shape a lifetime.</h1>
                  <p>Precise timeline calculations with private, device-only storage on phone and web.</p>
                </div>
                <div className="hero-actions">
                  <button className="primary-button" type="button" onClick={() => setEditing("new")}>+ Add person</button>
                  <button className="secondary-button" type="button" onClick={installApp}>Add to phone</button>
                </div>
                <div className="privacy-line"><span className="privacy-dot" /> Saved on this device · works offline</div>
              </div>
            </div>

            <div className="aionis-trust-ribbon" aria-label="Aionis principles">
              <article><span aria-hidden="true">Ω</span><div><strong>Private by design</strong><small>Your chart data never leaves this device.</small></div></article>
              <article><span aria-hidden="true">Φ</span><div><strong>Precision</strong><small>Exact timeline mathematics, preserved.</small></div></article>
              <article><span aria-hidden="true">Ψ</span><div><strong>Sovereign</strong><small>Your people and timelines remain yours.</small></div></article>
            </div>

            <div className="section-heading people-heading">
              <div>
                <p className="eyebrow">Chart subjects</p>
                <h2>People</h2>
              </div>
              <span className="count-badge">{clients.length}</span>
            </div>

            {!hydrated ? (
              <div className="empty-card"><p>Loading your saved people…</p></div>
            ) : clients.length === 0 ? (
              <div className="empty-card">
                <div className="empty-mark">T</div>
                <h3>Add your first person</h3>
                <p>Enter a full birth name and date of birth to create an Aionis timeline chart.</p>
                <button className="primary-button" type="button" onClick={() => setEditing("new")}>Add person</button>
              </div>
            ) : (
              <div className="people-list">
                {clients.map((client) => (
                  <article className="person-card" key={client.id}>
                    <button className="person-main" type="button" onClick={() => openChart(client)}>
                      <span className="person-initials">{client.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>
                      <span className="person-copy">
                        <strong>{client.fullName}</strong>
                        <small>{client.calledName || "No called name"} · {client.dob}</small>
                      </span>
                      <span className="chevron" aria-hidden="true">›</span>
                    </button>
                    <div className="person-actions">
                      <label className="compare-check">
                        <input type="checkbox" checked={compareIds.includes(client.id)} onChange={() => toggleCompare(client.id)} />
                        Compare
                      </label>
                      <button type="button" onClick={() => setEditing(client)}>Edit</button>
                      <button className="danger-text" type="button" onClick={() => deleteClient(client)}>Remove</button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {compareIds.length >= 2 && (
              <button className="compare-fab" type="button" onClick={() => setView("compare")}>
                Compare {compareIds.length} people
              </button>
            )}
          </section>
        )}

        {view === "chart" && selectedClient && selectedReport && (
          <section className="chart-view view-section">
            <div className="chart-report-toolbar no-print">
              <button className="back-button no-print" type="button" onClick={() => setView("people")}>‹ People</button>
              <div>
                <p className="eyebrow">Complete Aionis report</p>
                <h1>{selectedClient.fullName}</h1>
                <p>{selectedClient.dob} · Age {selectedReport.age}</p>
              </div>
              <button className="secondary-button compact-button no-print" type="button" onClick={() => window.print()}>Print / PDF</button>
            </div>
            <p className="chart-report-hint no-print">This is the complete print-ready report. On smaller screens, swipe inside a timeline panel to read every cycle.</p>
            <PassPrintReport
              client={selectedClient}
              report={selectedReport}
              currentYear={currentYear}
              chartDate={chartDate}
            />
          </section>
        )}

        {view === "compare" && (
          <section className="compare-view view-section">
            <div className="chart-title-row">
              <button className="back-button no-print" type="button" onClick={() => setView("people")}>‹ People</button>
              <div className="print-title">
                <p className="eyebrow">Aionis Timeline Comparison</p>
                <h1>Compare people</h1>
                <p>{compareClients.length} selected</p>
              </div>
            </div>

            <div className="compare-picker no-print">
              {clients.map((client) => (
                <label key={client.id}>
                  <input type="checkbox" checked={compareIds.includes(client.id)} onChange={() => toggleCompare(client.id)} />
                  <span>{client.fullName}</span>
                </label>
              ))}
            </div>

            {compareClients.length < 2 ? (
              <div className="empty-card">
                <div className="empty-mark">2</div>
                <h3>Select at least two people</h3>
                <p>Choose the people above to align their timeline cycles around one year.</p>
              </div>
            ) : (
              <>
                <div className="compare-toolbar no-print">
                  <div className="segmented-control" aria-label="Comparison mode">
                    <button className={compareMode === "years" ? "active" : ""} aria-pressed={compareMode === "years"} type="button" onClick={() => setCompareMode("years")}>Years</button>
                    <button className={compareMode === "months" ? "active" : ""} aria-pressed={compareMode === "months"} type="button" onClick={() => setCompareMode("months")}>Months</button>
                  </div>
                  <div className="year-stepper">
                    <button type="button" aria-label="Previous year" onClick={() => setFocusYear((year) => year - 1)}>−</button>
                    <label>Focus year<input type="number" value={focusYear} onChange={(event) => setFocusYear(Number(event.target.value))} /></label>
                    <button type="button" aria-label="Next year" onClick={() => setFocusYear((year) => year + 1)}>+</button>
                  </div>
                </div>

                <div className="comparison-stack">
                  {compareClients.map((client) => {
                    const report = new Report(client.fullName, client.dob, currentYear);
                    const ageAtFocus = report.age + focusYear - currentYear;
                    return (
                      <article className="comparison-card" key={client.id}>
                        <div className="comparison-person">
                          <div><h2>{client.fullName}</h2><p>{client.dob}</p></div>
                          <span>{focusYear} · age {ageAtFocus}</span>
                        </div>
                        {ageAtFocus < 0 ? (
                          <p className="before-birth">This focus year is before the person&apos;s birth.</p>
                        ) : compareMode === "years" ? (
                          <YearGrid report={report} start={Math.max(0, ageAtFocus - 10)} length={21} includeNames={false} label={`Comparison chart for ${client.fullName}`} />
                        ) : (
                          <MonthBand report={report} focusAge={ageAtFocus} />
                        )}
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        )}
      </div>

      <nav className="bottom-nav no-print" aria-label="Primary navigation">
        <button className={view === "people" ? "active" : ""} aria-current={view === "people" ? "page" : undefined} type="button" onClick={() => setView("people")}><span>People</span><small>{clients.length}</small></button>
        <button className={view === "chart" ? "active" : ""} aria-current={view === "chart" ? "page" : undefined} type="button" disabled={!selectedClient} onClick={() => setView("chart")}><span>Chart</span><small>{selectedClient ? "Open" : "—"}</small></button>
        <button className={view === "compare" ? "active" : ""} aria-current={view === "compare" ? "page" : undefined} type="button" onClick={() => setView("compare")}><span>Compare</span><small>{compareIds.length}</small></button>
      </nav>

      {editing && <PersonForm person={editing === "new" ? null : editing} onCancel={() => setEditing(null)} onSave={saveClient} />}
      {showInstallHelp && <InstallHelp onClose={() => setShowInstallHelp(false)} />}
    </main>
  );
}
