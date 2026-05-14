"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

// ─── Calendar types ───────────────────────────────────────────────────────────
type Homestay = {
  id: string;
  arrival_date: string;
  departure_date: string | null;
  status: string;
  students: { display_id: string; first_name: string; last_name: string } | null;
  host_families: { display_id: string; family_name: string } | null;
};

type Transport = {
  id: string;
  type: "arrival" | "departure";
  datetime: string | null;
  flight_number: string | null;
  status: string;
  students: { display_id: string; first_name: string } | null;
};

// ─── Sheet types ──────────────────────────────────────────────────────────────
type HomestayRow = {
  id: string;
  student_id: string;
  host_id: string;
  arrival_date: string;
  departure_date: string | null;
  status: string;
  homestay_fee: number | null;
  total: number | null;
  total_paid: number | null;
  total_pending: number | null;
  payment_date: string | null;
  code_of_conduct_signed: boolean;
  custody_status: string | null;
  notes: string | null;
  updated_at: string | null;
  students: { display_id: string; first_name: string; last_name: string } | null;
  host_families: { display_id: string; family_name: string } | null;
  _student: string;
  _host: string;
};

type TransportRow = {
  id: string;
  display_id: string;
  type: "arrival" | "departure";
  student_id: string;
  driver_id: string | null;
  datetime: string | null;
  airport_code: string | null;
  flight_number: string | null;
  pickup_confirmed: boolean;
  flight_details_sent: boolean;
  driver_paid: boolean;
  driver_payment_amount: number | null;
  status: string;
  notes: string | null;
  students: { display_id: string; first_name: string; last_name: string } | null;
  drivers: { display_id: string; first_name: string; last_name: string } | null;
  _student: string;
  _driver: string;
};

type SheetCol = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "datetime" | "boolean" | "select" | "currency";
  editable?: boolean;
  computed?: boolean;
  options?: string[];
  visible?: boolean;
  width?: string;
};

const HOMESTAY_COLS: SheetCol[] = [
  { key: "_student", label: "Student", type: "text", computed: true, width: "170px" },
  { key: "_host", label: "Host Family", type: "text", computed: true, width: "150px" },
  { key: "arrival_date", label: "Arrival", type: "date", width: "110px" },
  { key: "departure_date", label: "Departure", type: "date", width: "110px" },
  { key: "status", label: "Status", type: "select", options: ["pending", "active", "completed", "cancelled"], width: "110px" },
  { key: "code_of_conduct_signed", label: "COC Signed", type: "boolean", width: "110px" },
  { key: "homestay_fee", label: "Homestay Fee", type: "currency", width: "120px" },
  { key: "total_paid", label: "Total Paid", type: "currency", width: "110px" },
  { key: "total_pending", label: "Pending", type: "currency", width: "100px", visible: false },
  { key: "total", label: "Total", type: "currency", width: "90px", visible: false },
  { key: "payment_date", label: "Payment Date", type: "date", visible: false },
  { key: "custody_status", label: "Custody Status", type: "text", visible: false },
  { key: "notes", label: "Notes", type: "text", width: "200px", visible: false },
];

const TRANSPORT_COLS: SheetCol[] = [
  { key: "display_id", label: "ID", type: "text", editable: false, width: "90px" },
  { key: "type", label: "Type", type: "select", options: ["arrival", "departure"], width: "100px" },
  { key: "_student", label: "Student", type: "text", computed: true, width: "170px" },
  { key: "_driver", label: "Driver", type: "text", computed: true, width: "150px" },
  { key: "datetime", label: "Date / Time", type: "datetime", width: "150px" },
  { key: "flight_number", label: "Flight #", type: "text", width: "100px" },
  { key: "status", label: "Status", type: "select", options: ["pending", "confirmed", "completed", "cancelled"], width: "110px" },
  { key: "pickup_confirmed", label: "Pickup Confirmed", type: "boolean", width: "140px" },
  { key: "airport_code", label: "Airport", type: "text", width: "90px", visible: false },
  { key: "flight_details_sent", label: "Flight Details Sent", type: "boolean", width: "150px", visible: false },
  { key: "driver_paid", label: "Driver Paid", type: "boolean", width: "110px", visible: false },
  { key: "driver_payment_amount", label: "Driver Fee", type: "currency", width: "100px", visible: false },
  { key: "notes", label: "Notes", type: "text", width: "200px", visible: false },
];

function fmtCell(value: unknown, type: SheetCol["type"]): string {
  if (value == null || value === "") return "—";
  if (type === "boolean") return value ? "Yes" : "No";
  if (type === "currency") return `$${Number(value).toLocaleString("en-CA", { minimumFractionDigits: 2 })}`;
  if (type === "date") return new Date(String(value)).toLocaleDateString("en-CA");
  if (type === "datetime") {
    const d = new Date(String(value));
    return (
      d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) +
      " " +
      d.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" })
    );
  }
  return String(value);
}

// ─── Calendar constants ───────────────────────────────────────────────────────
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const HOMESTAY_COLORS = [
  "bg-violet-200 border-violet-300 text-violet-800",
  "bg-sky-200 border-sky-300 text-sky-800",
  "bg-emerald-200 border-emerald-300 text-emerald-800",
  "bg-amber-200 border-amber-300 text-amber-800",
  "bg-rose-200 border-rose-300 text-rose-800",
  "bg-teal-200 border-teal-300 text-teal-800",
  "bg-indigo-200 border-indigo-300 text-indigo-800",
  "bg-orange-200 border-orange-300 text-orange-800",
];

const TIMELINE_BAR_COLORS = [
  { bg: "bg-violet-300", border: "border-violet-400", text: "text-violet-900" },
  { bg: "bg-sky-300", border: "border-sky-400", text: "text-sky-900" },
  { bg: "bg-emerald-300", border: "border-emerald-400", text: "text-emerald-900" },
  { bg: "bg-amber-300", border: "border-amber-400", text: "text-amber-900" },
  { bg: "bg-rose-300", border: "border-rose-400", text: "text-rose-900" },
  { bg: "bg-teal-300", border: "border-teal-400", text: "text-teal-900" },
  { bg: "bg-indigo-300", border: "border-indigo-400", text: "text-indigo-900" },
  { bg: "bg-orange-300", border: "border-orange-400", text: "text-orange-900" },
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

type ViewMode = "month" | "timeline";

// ─── CalendarPage ─────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const [homestays, setHomestays] = useState<Homestay[]>([]);
  const [transports, setTransports] = useState<Transport[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [view, setView] = useState<ViewMode>("timeline");

  const supabase = createClient();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);

  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const fetchData = useCallback(async () => {
    const [homestayRes, transportRes] = await Promise.all([
      supabase
        .from("homestays")
        .select("id, arrival_date, departure_date, status, students(display_id, first_name, last_name), host_families(display_id, family_name)")
        .or(`arrival_date.lte.${monthEnd},departure_date.gte.${monthStart},departure_date.is.null`)
        .neq("status", "cancelled"),
      supabase
        .from("transports")
        .select("id, type, datetime, flight_number, status, students(display_id, first_name)")
        .gte("datetime", `${monthStart}T00:00:00`)
        .lte("datetime", `${monthEnd}T23:59:59`)
        .neq("status", "cancelled"),
    ]);

    if (homestayRes.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filtered = (homestayRes.data as any[]).filter((h: Homestay) => {
        const arrival = new Date(h.arrival_date);
        const departure = h.departure_date ? new Date(h.departure_date) : new Date(year + 1, 0, 1);
        const mStart = new Date(monthStart);
        const mEnd = new Date(monthEnd);
        return arrival <= mEnd && departure >= mStart;
      });
      setHomestays(filtered);
    }
    if (transportRes.data) setTransports(transportRes.data as unknown as Transport[]);
    setLoading(false);
  }, [supabase, monthStart, monthEnd, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel("calendar-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "homestays" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "transports" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, fetchData]);

  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    homestays.forEach((h, i) => { map[h.id] = HOMESTAY_COLORS[i % HOMESTAY_COLORS.length]; });
    return map;
  }, [homestays]);

  function getHomestaysForDay(day: number): Homestay[] {
    const date = new Date(year, month, day);
    return homestays.filter((h) => {
      const arrival = new Date(h.arrival_date);
      const departure = h.departure_date ? new Date(h.departure_date) : new Date(year + 1, 0, 1);
      return date >= arrival && date <= departure;
    });
  }

  function getTransportsForDay(day: number): Transport[] {
    return transports.filter((t) => {
      if (!t.datetime) return false;
      const d = new Date(t.datetime);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });
  }

  function isHomestayStart(h: Homestay, day: number): boolean {
    const d = new Date(h.arrival_date);
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
  }

  function isHomestayEnd(h: Homestay, day: number): boolean {
    if (!h.departure_date) return false;
    const d = new Date(h.departure_date);
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
  }

  function prevMonth() { setCurrentDate(new Date(year, month - 1, 1)); setSelectedDay(null); }
  function nextMonth() { setCurrentDate(new Date(year, month + 1, 1)); setSelectedDay(null); }
  function goToday() { setCurrentDate(new Date()); setSelectedDay(new Date().getDate()); }

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedHomestays = selectedDay ? getHomestaysForDay(selectedDay) : [];
  const selectedTransports = selectedDay ? getTransportsForDay(selectedDay) : [];

  const timelineDays = useMemo(() => {
    const days: Date[] = [];
    for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d));
    return days;
  }, [year, month, daysInMonth]);

  const timelineStartDate = new Date(year, month, 1);

  const timelineRows = useMemo(() => {
    const rows: {
      label: string; sublabel: string; homestay: Homestay; colorIndex: number;
      startCol: number; spanCols: number;
      transportsOnRow: { day: number; transport: Transport }[];
    }[] = [];

    homestays.forEach((h, i) => {
      const arrival = new Date(h.arrival_date);
      const departure = h.departure_date ? new Date(h.departure_date) : new Date(year, month, daysInMonth);
      const clampedStart = arrival < timelineStartDate ? timelineStartDate : arrival;
      const monthEndDate = new Date(year, month, daysInMonth);
      const clampedEnd = departure > monthEndDate ? monthEndDate : departure;
      const startCol = daysBetween(timelineStartDate, clampedStart);
      const spanCols = daysBetween(clampedStart, clampedEnd) + 1;
      const studentId = h.students?.display_id || "?";
      const studentTransports = transports.filter((t) => t.students?.display_id === studentId && t.datetime);
      const transportsOnRow = studentTransports
        .map((t) => {
          const td = new Date(t.datetime!);
          if (td.getFullYear() === year && td.getMonth() === month) return { day: td.getDate(), transport: t };
          return null;
        })
        .filter(Boolean) as { day: number; transport: Transport }[];

      rows.push({
        label: h.students ? `${h.students.display_id}` : "?",
        sublabel: h.students ? `${h.students.first_name} ${h.students.last_name}` : "Unknown",
        homestay: h, colorIndex: i,
        startCol, spanCols: Math.max(spanCols, 1), transportsOnRow,
      });
    });
    return rows;
  }, [homestays, transports, year, month, daysInMonth, timelineStartDate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-pulse text-text-secondary text-sm">Loading calendar...</div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading font-bold text-xl text-text-primary">Homestay Calendar</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-gray-200 bg-white overflow-hidden">
            <button onClick={() => setView("month")} className={`px-3 py-1.5 text-sm font-medium flex items-center gap-1.5 transition-colors ${view === "month" ? "bg-text-primary text-white" : "text-text-secondary hover:bg-gray-50"}`}>
              <span className="material-symbols-outlined text-[16px]">calendar_view_month</span>Month
            </button>
            <button onClick={() => setView("timeline")} className={`px-3 py-1.5 text-sm font-medium flex items-center gap-1.5 transition-colors ${view === "timeline" ? "bg-text-primary text-white" : "text-text-secondary hover:bg-gray-50"}`}>
              <span className="material-symbols-outlined text-[16px]">view_timeline</span>Timeline
            </button>
          </div>
          <div className="w-px h-6 bg-gray-200" />
          <button onClick={goToday} className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-text-secondary hover:bg-gray-50">Today</button>
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-text-secondary">
            <span className="material-symbols-outlined text-[20px]">chevron_left</span>
          </button>
          <span className="text-sm font-semibold text-text-primary min-w-[140px] text-center">
            {currentDate.toLocaleString("en-CA", { month: "long", year: "numeric" })}
          </span>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-text-secondary">
            <span className="material-symbols-outlined text-[20px]">chevron_right</span>
          </button>
        </div>
      </div>

      {/* Calendar views */}
      {view === "month" ? (
        <MonthView
          cells={cells} year={year} month={month} isCurrentMonth={isCurrentMonth} today={today}
          selectedDay={selectedDay} setSelectedDay={setSelectedDay}
          getHomestaysForDay={getHomestaysForDay} getTransportsForDay={getTransportsForDay}
          isHomestayStart={isHomestayStart} isHomestayEnd={isHomestayEnd}
          colorMap={colorMap} homestays={homestays}
          selectedHomestays={selectedHomestays} selectedTransports={selectedTransports}
        />
      ) : (
        <TimelineView
          timelineDays={timelineDays} timelineRows={timelineRows} daysInMonth={daysInMonth}
          today={today} isCurrentMonth={isCurrentMonth} year={year} month={month}
        />
      )}

      {/* Data sheets */}
      <div className="mt-12 space-y-10">
        <HomestaySheet />
        <TransportSheet />
      </div>
    </div>
  );
}

// ─── MonthView (unchanged) ────────────────────────────────────────────────────
function MonthView({
  cells, year, month, isCurrentMonth, today, selectedDay, setSelectedDay,
  getHomestaysForDay, getTransportsForDay, isHomestayStart, isHomestayEnd,
  colorMap, homestays, selectedHomestays, selectedTransports,
}: {
  cells: (number | null)[]; year: number; month: number; isCurrentMonth: boolean; today: Date;
  selectedDay: number | null; setSelectedDay: (d: number | null) => void;
  getHomestaysForDay: (d: number) => Homestay[]; getTransportsForDay: (d: number) => Transport[];
  isHomestayStart: (h: Homestay, d: number) => boolean; isHomestayEnd: (h: Homestay, d: number) => boolean;
  colorMap: Record<string, string>; homestays: Homestay[];
  selectedHomestays: Homestay[]; selectedTransports: Transport[];
}) {
  return (
    <div className="flex gap-6">
      <div className="flex-1 rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-100">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-2.5 text-center text-xs font-semibold text-text-tertiary">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-gray-50 bg-gray-50/30" />;
            const dayHomestays = getHomestaysForDay(day);
            const dayTransports = getTransportsForDay(day);
            const isToday = isCurrentMonth && day === today.getDate();
            const isSelected = selectedDay === day;
            return (
              <button key={day} onClick={() => setSelectedDay(isSelected ? null : day)}
                className={`min-h-[80px] border-b border-r border-gray-50 p-1 text-left transition-colors ${isSelected ? "bg-accent/5 ring-1 ring-accent/30 ring-inset" : "hover:bg-gray-50/50"}`}>
                <div className="flex items-center justify-between px-1">
                  <span className={`text-xs font-medium ${isToday ? "w-6 h-6 rounded-full bg-accent text-white flex items-center justify-center" : "text-text-secondary"}`}>{day}</span>
                  {dayTransports.length > 0 && <span className="material-symbols-outlined text-[12px] text-text-tertiary">flight</span>}
                </div>
                <div className="mt-1 space-y-0.5">
                  {dayHomestays.slice(0, 3).map((h) => {
                    const start = isHomestayStart(h, day);
                    const end = isHomestayEnd(h, day);
                    return (
                      <div key={h.id} className={`text-[10px] font-medium px-1.5 py-0.5 border truncate ${colorMap[h.id]} ${start ? "rounded-l-md" : ""} ${end ? "rounded-r-md" : ""} ${!start && !end ? "border-l-0 border-r-0" : ""}`}>
                        {start ? (h.students?.display_id || "?") : ""}
                      </div>
                    );
                  })}
                  {dayHomestays.length > 3 && <div className="text-[10px] text-text-tertiary px-1">+{dayHomestays.length - 3}</div>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="w-72 flex-shrink-0">
        {selectedDay ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <h3 className="font-heading font-semibold text-sm text-text-primary mb-3">
              {new Date(year, month, selectedDay).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })}
            </h3>
            {selectedHomestays.length === 0 && selectedTransports.length === 0 && (
              <p className="text-xs text-text-tertiary py-2">No events on this day.</p>
            )}
            {selectedHomestays.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Homestays</p>
                <div className="space-y-2">
                  {selectedHomestays.map((h) => {
                    const start = isHomestayStart(h, selectedDay);
                    const end = isHomestayEnd(h, selectedDay);
                    return (
                      <div key={h.id} className={`rounded-xl border p-3 ${colorMap[h.id]}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          {start && <span className="material-symbols-outlined text-[14px]">login</span>}
                          {end && <span className="material-symbols-outlined text-[14px]">logout</span>}
                          <span className="text-xs font-semibold">{h.students?.display_id || "?"}</span>
                        </div>
                        <p className="text-xs font-medium">{h.students ? `${h.students.first_name} ${h.students.last_name}` : "Unknown"}</p>
                        <p className="text-[11px] mt-0.5 opacity-75">Host: {h.host_families?.family_name || h.host_families?.display_id || "TBD"}</p>
                        <p className="text-[11px] opacity-75">{h.arrival_date} → {h.departure_date || "ongoing"}</p>
                        <span className={`text-[10px] mt-1 inline-block px-1.5 py-0.5 rounded-full font-medium ${h.status === "active" ? "bg-white/50" : "bg-white/30"}`}>{h.status}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {selectedTransports.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Transports</p>
                <div className="space-y-2">
                  {selectedTransports.map((t) => (
                    <div key={t.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="material-symbols-outlined text-[14px] text-text-secondary">{t.type === "arrival" ? "flight_land" : "flight_takeoff"}</span>
                        <span className="text-xs font-semibold text-text-primary">{t.type === "arrival" ? "Arrival" : "Departure"}</span>
                      </div>
                      <p className="text-xs text-text-primary">{t.students?.display_id} — {t.students?.first_name}</p>
                      {t.flight_number && <p className="text-[11px] text-text-tertiary">Flight: {t.flight_number}</p>}
                      {t.datetime && <p className="text-[11px] text-text-tertiary">{new Date(t.datetime).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" })}</p>}
                      <span className={`text-[10px] mt-1 inline-block px-1.5 py-0.5 rounded-full font-medium ${t.status === "confirmed" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{t.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 text-center">
            <span className="material-symbols-outlined text-[28px] text-text-tertiary mb-2">event</span>
            <p className="text-xs text-text-tertiary">Click a day to see details.</p>
            {homestays.length > 0 && (
              <div className="mt-4 text-left">
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">This month</p>
                <div className="space-y-1.5">
                  {homestays.map((h) => (
                    <div key={h.id} className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${colorMap[h.id]?.split(" ")[0]}`} />
                      <span className="text-xs text-text-primary truncate">{h.students?.display_id} — {h.host_families?.family_name || "TBD"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TimelineView (unchanged) ─────────────────────────────────────────────────
function TimelineView({
  timelineDays, timelineRows, daysInMonth, today, isCurrentMonth, year, month,
}: {
  timelineDays: Date[];
  timelineRows: { label: string; sublabel: string; homestay: Homestay; colorIndex: number; startCol: number; spanCols: number; transportsOnRow: { day: number; transport: Transport }[] }[];
  daysInMonth: number; today: Date; isCurrentMonth: boolean; year: number; month: number;
}) {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const todayCol = isCurrentMonth ? today.getDate() - 1 : -1;
  const colWidth = 36;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      {timelineRows.length === 0 ? (
        <div className="p-8 text-center">
          <span className="material-symbols-outlined text-[32px] text-text-tertiary">event_busy</span>
          <p className="text-sm text-text-tertiary mt-2">No homestays this month</p>
        </div>
      ) : (
        <div className="flex">
          <div className="flex-shrink-0 border-r border-gray-200 bg-gray-50/50 z-10">
            <div className="h-[52px] border-b border-gray-200 px-4 flex items-center">
              <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wide">Student</span>
            </div>
            {timelineRows.map((row) => (
              <div key={row.homestay.id}
                className={`h-[48px] border-b border-gray-100 px-4 flex items-center gap-2 transition-colors ${hoveredRow === row.homestay.id ? "bg-gray-100/80" : ""}`}
                onMouseEnter={() => setHoveredRow(row.homestay.id)} onMouseLeave={() => setHoveredRow(null)}>
                <div className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${TIMELINE_BAR_COLORS[row.colorIndex % TIMELINE_BAR_COLORS.length].bg}`} />
                <div className="min-w-[120px]">
                  <p className="text-xs font-semibold text-text-primary leading-tight">{row.label}</p>
                  <p className="text-[10px] text-text-tertiary leading-tight truncate max-w-[110px]">{row.sublabel}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-x-auto">
            <div style={{ minWidth: daysInMonth * colWidth }}>
              <div className="flex border-b border-gray-200">
                {timelineDays.map((d, i) => {
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const isTodayCol = i === todayCol;
                  return (
                    <div key={i} className={`flex-shrink-0 text-center border-r border-gray-100 py-1 ${isTodayCol ? "bg-accent/10" : isWeekend ? "bg-gray-50/60" : ""}`} style={{ width: colWidth }}>
                      <div className="text-[9px] text-text-tertiary font-medium">{WEEKDAYS[d.getDay()].charAt(0)}</div>
                      <div className={`text-xs font-medium ${isTodayCol ? "w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center mx-auto" : "text-text-secondary"}`}>{d.getDate()}</div>
                    </div>
                  );
                })}
              </div>

              {timelineRows.map((row) => {
                const colors = TIMELINE_BAR_COLORS[row.colorIndex % TIMELINE_BAR_COLORS.length];
                return (
                  <div key={row.homestay.id}
                    className={`relative h-[48px] border-b border-gray-100 transition-colors ${hoveredRow === row.homestay.id ? "bg-gray-50/50" : ""}`}
                    onMouseEnter={() => setHoveredRow(row.homestay.id)} onMouseLeave={() => setHoveredRow(null)}>
                    <div className="absolute inset-0 flex pointer-events-none">
                      {timelineDays.map((d, i) => {
                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                        const isTodayCol = i === todayCol;
                        return <div key={i} className={`flex-shrink-0 border-r border-gray-50 ${isTodayCol ? "bg-accent/5" : isWeekend ? "bg-gray-50/30" : ""}`} style={{ width: colWidth }} />;
                      })}
                    </div>
                    {todayCol >= 0 && <div className="absolute top-0 bottom-0 w-px bg-accent/40 z-10 pointer-events-none" style={{ left: todayCol * colWidth + colWidth / 2 }} />}
                    <div className={`absolute top-2 h-7 rounded-lg border ${colors.bg} ${colors.border} ${colors.text} flex items-center px-2 text-[10px] font-semibold shadow-sm cursor-default z-20`}
                      style={{ left: row.startCol * colWidth + 2, width: row.spanCols * colWidth - 4 }}
                      title={`${row.sublabel} @ ${row.homestay.host_families?.family_name || "TBD"} · ${row.homestay.arrival_date} → ${row.homestay.departure_date || "ongoing"}`}>
                      <span className="truncate">{row.homestay.host_families?.family_name || "TBD"}</span>
                      <span className={`ml-auto text-[9px] opacity-60 flex-shrink-0 ml-1 px-1 py-0.5 rounded ${row.homestay.status === "active" ? "bg-white/40" : "bg-white/20"}`}>{row.homestay.status}</span>
                    </div>
                    {row.transportsOnRow.map((tp) => {
                      const col = tp.day - 1;
                      return (
                        <div key={tp.transport.id} className="absolute z-30 pointer-events-none"
                          style={{ left: col * colWidth + colWidth / 2 - 7, top: tp.transport.type === "arrival" ? 0 : 34 }}
                          title={`${tp.transport.type === "arrival" ? "Arrival" : "Departure"} — ${tp.transport.flight_number || ""}`}>
                          <span className={`material-symbols-outlined text-[14px] ${tp.transport.type === "arrival" ? "text-green-600" : "text-red-500"}`}>
                            {tp.transport.type === "arrival" ? "flight_land" : "flight_takeoff"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-gray-200 px-4 py-2.5 flex items-center gap-4 bg-gray-50/30">
        <div className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px] text-green-600">flight_land</span><span className="text-[11px] text-text-tertiary">Arrival</span></div>
        <div className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px] text-red-500">flight_takeoff</span><span className="text-[11px] text-text-tertiary">Departure</span></div>
        <div className="flex items-center gap-1.5"><div className="w-px h-3 bg-accent/40" /><span className="text-[11px] text-text-tertiary">Today</span></div>
        <div className="ml-auto text-[11px] text-text-tertiary">{timelineRows.length} active homestay{timelineRows.length !== 1 ? "s" : ""}</div>
      </div>
    </div>
  );
}

// ─── HomestaySheet ────────────────────────────────────────────────────────────
function HomestaySheet() {
  const supabase = createClient();
  const [rows, setRows] = useState<HomestayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("arrival_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState("");
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);
  const [editVal, setEditVal] = useState("");
  const [visible, setVisible] = useState<Set<string>>(
    new Set(HOMESTAY_COLS.filter((c) => c.visible !== false).map((c) => c.key))
  );
  const [showCols, setShowCols] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const fetchRows = useCallback(async () => {
    const { data } = await supabase
      .from("homestays")
      .select("*, students(display_id, first_name, last_name), host_families(display_id, family_name)")
      .order("arrival_date", { ascending: false });
    if (data) {
      setRows(
        (data as Omit<HomestayRow, "_student" | "_host">[]).map((r) => ({
          ...r,
          _student: r.students ? `${r.students.display_id} ${r.students.first_name} ${r.students.last_name}` : "—",
          _host: (r as unknown as { host_families: { family_name?: string } | null }).host_families?.family_name || "—",
        } as HomestayRow))
      );
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (statusFilter) result = result.filter((r) => r.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((r) =>
        HOMESTAY_COLS.some((col) => String((r as Record<string, unknown>)[col.key] ?? "").toLowerCase().includes(q))
      );
    }
    return [...result].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey] ?? "";
      const bv = (b as Record<string, unknown>)[sortKey] ?? "";
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, search, statusFilter, sortKey, sortDir]);

  const activeCols = HOMESTAY_COLS.filter((c) => visible.has(c.key));

  async function saveCell(id: string, key: string, raw: string) {
    const col = HOMESTAY_COLS.find((c) => c.key === key);
    if (!col || col.computed) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    let value: unknown = raw || null;
    if (col.type === "number" || col.type === "currency") value = raw ? Number(raw) : null;
    await supabase.from("homestays").update({ [key]: value, updated_by: user.id }).eq("id", id);
    setEditing(null);
    fetchRows();
  }

  async function toggleBoolean(id: string, key: string, current: boolean) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("homestays").update({ [key]: !current, updated_by: user.id }).eq("id", id);
    fetchRows();
  }

  async function handleBulkStatusChange(status: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || selectedRows.size === 0) return;
    for (const id of selectedRows) {
      await supabase.from("homestays").update({ status, updated_by: user.id }).eq("id", id);
    }
    setSelectedRows(new Set());
    fetchRows();
  }

  function exportCSV() {
    const rowsToExport = selectedRows.size > 0 ? filtered.filter((r) => selectedRows.has(r.id)) : filtered;
    const header = activeCols.map((c) => c.label).join(",");
    const csvRows = rowsToExport.map((r) =>
      activeCols.map((c) => {
        const v = (r as Record<string, unknown>)[c.key];
        const s = c.computed ? String(v || "") : fmtCell(v, c.type).replace("—", "");
        return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(",")
    );
    const blob = new Blob([[header, ...csvRows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "homestays_export.csv";
    a.click();
  }

  function toggleSelectAll() {
    setSelectedRows(selectedRows.size === filtered.length ? new Set() : new Set(filtered.map((r) => r.id)));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading font-bold text-xl text-text-primary">Homestay Records</h2>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-text-secondary hover:bg-gray-50">Export CSV</button>
          <div className="relative">
            <button onClick={() => setShowCols(!showCols)} className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-text-secondary hover:bg-gray-50">Columns</button>
            {showCols && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-50 max-h-80 overflow-y-auto">
                {HOMESTAY_COLS.map((col) => (
                  <label key={col.key} className="flex items-center gap-2 py-1 text-sm text-text-secondary cursor-pointer">
                    <input type="checkbox" className="rounded" checked={visible.has(col.key)} onChange={() => {
                      const next = new Set(visible);
                      if (next.has(col.key)) next.delete(col.key); else next.add(col.key);
                      setVisible(next);
                    }} />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mb-3">
        <input type="text" placeholder="Search homestays..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs font-medium text-text-tertiary">Status:</span>
        {["pending", "active", "completed", "cancelled"].map((s) => (
          <button key={s} onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${statusFilter === s ? "bg-accent/10 text-accent border-accent/30" : "bg-gray-100 text-text-secondary hover:bg-gray-200 border-transparent"}`}>
            {s}
          </button>
        ))}
        {statusFilter && <button onClick={() => setStatusFilter("")} className="px-2.5 py-1 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50">Clear</button>}
      </div>

      {selectedRows.size > 0 && (
        <div className="mb-3 flex items-center gap-3 bg-accent/5 border border-accent/20 rounded-xl px-4 py-2">
          <span className="text-sm font-medium text-text-primary">{selectedRows.size} selected</span>
          <div className="h-4 w-px bg-gray-300" />
          <button onClick={exportCSV} className="text-xs font-medium text-accent hover:underline">Export selected</button>
          <button onClick={() => handleBulkStatusChange("active")} className="text-xs font-medium text-green-600 hover:underline">Set active</button>
          <button onClick={() => handleBulkStatusChange("completed")} className="text-xs font-medium text-blue-600 hover:underline">Set completed</button>
          <button onClick={() => setSelectedRows(new Set())} className="ml-auto text-xs text-text-tertiary hover:text-text-primary">Clear selection</button>
        </div>
      )}

      <div className="border border-gray-200 rounded-2xl bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="w-10 px-3 py-2.5">
                  <input type="checkbox" className="rounded" checked={selectedRows.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
                </th>
                {activeCols.map((col) => (
                  <th key={col.key} className="px-3 py-2.5 text-left font-semibold text-text-secondary cursor-pointer hover:text-text-primary select-none whitespace-nowrap"
                    style={{ minWidth: col.width || "120px" }}
                    onClick={() => { if (sortKey === col.key) setSortDir(sortDir === "asc" ? "desc" : "asc"); else { setSortKey(col.key); setSortDir("asc"); } }}>
                    {col.label}{sortKey === col.key && <span className="ml-1 text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={activeCols.length + 1} className="px-3 py-8 text-center text-text-tertiary">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={activeCols.length + 1} className="px-3 py-8 text-center text-text-tertiary">No homestays found.</td></tr>
              ) : filtered.map((row) => (
                <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors group">
                  <td className="px-3 py-2">
                    <input type="checkbox" className="rounded" checked={selectedRows.has(row.id)} onChange={() => {
                      const next = new Set(selectedRows);
                      if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
                      setSelectedRows(next);
                    }} />
                  </td>
                  {activeCols.map((col) => {
                    const val = (row as Record<string, unknown>)[col.key];
                    const isEditing = editing?.id === row.id && editing?.key === col.key;
                    const canEdit = col.editable !== false && !col.computed;
                    const display = col.computed ? String(val || "—") : fmtCell(val, col.type);

                    return (
                      <td key={col.key} className="px-3 py-2">
                        {isEditing ? (
                          col.type === "select" ? (
                            <select autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)}
                              onBlur={() => saveCell(row.id, col.key, editVal)}
                              className="w-full px-1.5 py-0.5 rounded-lg border border-accent/40 bg-white text-sm focus:outline-none">
                              {col.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input autoFocus
                              type={col.type === "date" ? "date" : col.type === "number" || col.type === "currency" ? "number" : "text"}
                              value={editVal} onChange={(e) => setEditVal(e.target.value)}
                              onBlur={() => saveCell(row.id, col.key, editVal)}
                              onKeyDown={(e) => { if (e.key === "Enter") saveCell(row.id, col.key, editVal); if (e.key === "Escape") setEditing(null); }}
                              className="w-full px-1.5 py-0.5 rounded-lg border border-accent/40 bg-white text-sm focus:outline-none" />
                          )
                        ) : col.type === "boolean" && canEdit ? (
                          <button onClick={() => toggleBoolean(row.id, col.key, !!val)}
                            className={`text-xs font-medium px-2 py-0.5 rounded-full ${val ? "bg-green-100 text-green-700" : "bg-gray-100 text-text-tertiary"}`}>
                            {val ? "Yes" : "No"}
                          </button>
                        ) : (
                          <div
                            className={`truncate ${canEdit ? "cursor-pointer hover:bg-accent/5 rounded px-1 -mx-1" : "text-text-secondary"}`}
                            onClick={() => { if (!canEdit) return; setEditing({ id: row.id, key: col.key }); setEditVal(val != null ? String(val) : ""); }}
                            title={canEdit ? "Click to edit" : undefined}>
                            {display === "—" ? <span className="text-text-tertiary">—</span> : display}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-text-tertiary mt-2">
        {filtered.length} {filtered.length === 1 ? "row" : "rows"}
        {statusFilter && ` · status: "${statusFilter}"`}
        {search && ` matching "${search}"`}
      </p>
    </div>
  );
}

// ─── TransportSheet ───────────────────────────────────────────────────────────
function TransportSheet() {
  const supabase = createClient();
  const [rows, setRows] = useState<TransportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("datetime");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);
  const [editVal, setEditVal] = useState("");
  const [visible, setVisible] = useState<Set<string>>(
    new Set(TRANSPORT_COLS.filter((c) => c.visible !== false).map((c) => c.key))
  );
  const [showCols, setShowCols] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const fetchRows = useCallback(async () => {
    const { data } = await supabase
      .from("transports")
      .select("*, students(display_id, first_name, last_name), drivers(display_id, first_name, last_name)")
      .order("datetime", { ascending: false });
    if (data) {
      setRows(
        (data as Omit<TransportRow, "_student" | "_driver">[]).map((r) => ({
          ...r,
          _student: r.students ? `${r.students.display_id} ${r.students.first_name} ${r.students.last_name}` : "—",
          _driver: r.drivers ? `${r.drivers.display_id} ${r.drivers.first_name} ${r.drivers.last_name}` : "—",
        } as TransportRow))
      );
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (typeFilter) result = result.filter((r) => r.type === typeFilter);
    if (statusFilter) result = result.filter((r) => r.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((r) =>
        TRANSPORT_COLS.some((col) => String((r as Record<string, unknown>)[col.key] ?? "").toLowerCase().includes(q))
      );
    }
    return [...result].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey] ?? "";
      const bv = (b as Record<string, unknown>)[sortKey] ?? "";
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, search, typeFilter, statusFilter, sortKey, sortDir]);

  const activeCols = TRANSPORT_COLS.filter((c) => visible.has(c.key));

  async function saveCell(id: string, key: string, raw: string) {
    const col = TRANSPORT_COLS.find((c) => c.key === key);
    if (!col || col.computed || col.editable === false) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    let value: unknown = raw || null;
    if (col.type === "number" || col.type === "currency") value = raw ? Number(raw) : null;
    // datetime-local gives local time with no tz — convert to UTC ISO before storing
    if (col.type === "datetime" && raw) value = new Date(raw).toISOString();
    await supabase.from("transports").update({ [key]: value, updated_by: user.id }).eq("id", id);
    setEditing(null);
    fetchRows();
  }

  async function toggleBoolean(id: string, key: string, current: boolean) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("transports").update({ [key]: !current, updated_by: user.id }).eq("id", id);
    fetchRows();
  }

  async function handleBulkStatusChange(status: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || selectedRows.size === 0) return;
    for (const id of selectedRows) {
      await supabase.from("transports").update({ status, updated_by: user.id }).eq("id", id);
    }
    setSelectedRows(new Set());
    fetchRows();
  }

  function exportCSV() {
    const rowsToExport = selectedRows.size > 0 ? filtered.filter((r) => selectedRows.has(r.id)) : filtered;
    const header = activeCols.map((c) => c.label).join(",");
    const csvRows = rowsToExport.map((r) =>
      activeCols.map((c) => {
        const v = (r as Record<string, unknown>)[c.key];
        const s = c.computed ? String(v || "") : fmtCell(v, c.type).replace("—", "");
        return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(",")
    );
    const blob = new Blob([[header, ...csvRows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "transports_export.csv";
    a.click();
  }

  function toggleSelectAll() {
    setSelectedRows(selectedRows.size === filtered.length ? new Set() : new Set(filtered.map((r) => r.id)));
  }

  const hasActiveFilter = typeFilter || statusFilter;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading font-bold text-xl text-text-primary">Transport Records</h2>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-text-secondary hover:bg-gray-50">Export CSV</button>
          <div className="relative">
            <button onClick={() => setShowCols(!showCols)} className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-text-secondary hover:bg-gray-50">Columns</button>
            {showCols && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-50 max-h-80 overflow-y-auto">
                {TRANSPORT_COLS.map((col) => (
                  <label key={col.key} className="flex items-center gap-2 py-1 text-sm text-text-secondary cursor-pointer">
                    <input type="checkbox" className="rounded" checked={visible.has(col.key)} onChange={() => {
                      const next = new Set(visible);
                      if (next.has(col.key)) next.delete(col.key); else next.add(col.key);
                      setVisible(next);
                    }} />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mb-3">
        <input type="text" placeholder="Search transports..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30" />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-text-tertiary">Type:</span>
          {["arrival", "departure"].map((t) => (
            <button key={t} onClick={() => setTypeFilter(typeFilter === t ? "" : t)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${typeFilter === t ? "bg-accent/10 text-accent border-accent/30" : "bg-gray-100 text-text-secondary hover:bg-gray-200 border-transparent"}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-text-tertiary">Status:</span>
          {["pending", "confirmed", "completed", "cancelled"].map((s) => (
            <button key={s} onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${statusFilter === s ? "bg-accent/10 text-accent border-accent/30" : "bg-gray-100 text-text-secondary hover:bg-gray-200 border-transparent"}`}>
              {s}
            </button>
          ))}
        </div>
        {hasActiveFilter && (
          <button onClick={() => { setTypeFilter(""); setStatusFilter(""); }} className="px-2.5 py-1 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50">Clear filters</button>
        )}
      </div>

      {selectedRows.size > 0 && (
        <div className="mb-3 flex items-center gap-3 bg-accent/5 border border-accent/20 rounded-xl px-4 py-2">
          <span className="text-sm font-medium text-text-primary">{selectedRows.size} selected</span>
          <div className="h-4 w-px bg-gray-300" />
          <button onClick={exportCSV} className="text-xs font-medium text-accent hover:underline">Export selected</button>
          <button onClick={() => handleBulkStatusChange("confirmed")} className="text-xs font-medium text-green-600 hover:underline">Set confirmed</button>
          <button onClick={() => handleBulkStatusChange("completed")} className="text-xs font-medium text-blue-600 hover:underline">Set completed</button>
          <button onClick={() => setSelectedRows(new Set())} className="ml-auto text-xs text-text-tertiary hover:text-text-primary">Clear selection</button>
        </div>
      )}

      <div className="border border-gray-200 rounded-2xl bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="w-10 px-3 py-2.5">
                  <input type="checkbox" className="rounded" checked={selectedRows.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
                </th>
                {activeCols.map((col) => (
                  <th key={col.key} className="px-3 py-2.5 text-left font-semibold text-text-secondary cursor-pointer hover:text-text-primary select-none whitespace-nowrap"
                    style={{ minWidth: col.width || "120px" }}
                    onClick={() => { if (sortKey === col.key) setSortDir(sortDir === "asc" ? "desc" : "asc"); else { setSortKey(col.key); setSortDir("asc"); } }}>
                    {col.label}{sortKey === col.key && <span className="ml-1 text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={activeCols.length + 1} className="px-3 py-8 text-center text-text-tertiary">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={activeCols.length + 1} className="px-3 py-8 text-center text-text-tertiary">No transports found.</td></tr>
              ) : filtered.map((row) => (
                <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors group">
                  <td className="px-3 py-2">
                    <input type="checkbox" className="rounded" checked={selectedRows.has(row.id)} onChange={() => {
                      const next = new Set(selectedRows);
                      if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
                      setSelectedRows(next);
                    }} />
                  </td>
                  {activeCols.map((col) => {
                    const val = (row as Record<string, unknown>)[col.key];
                    const isEditing = editing?.id === row.id && editing?.key === col.key;
                    const canEdit = col.editable !== false && !col.computed;
                    const display = col.computed ? String(val || "—") : fmtCell(val, col.type);

                    return (
                      <td key={col.key} className="px-3 py-2">
                        {isEditing ? (
                          col.type === "select" ? (
                            <select autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)}
                              onBlur={() => saveCell(row.id, col.key, editVal)}
                              className="w-full px-1.5 py-0.5 rounded-lg border border-accent/40 bg-white text-sm focus:outline-none">
                              {col.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input autoFocus
                              type={col.type === "datetime" ? "datetime-local" : col.type === "date" ? "date" : col.type === "number" || col.type === "currency" ? "number" : "text"}
                              value={editVal} onChange={(e) => setEditVal(e.target.value)}
                              onBlur={() => saveCell(row.id, col.key, editVal)}
                              onKeyDown={(e) => { if (e.key === "Enter") saveCell(row.id, col.key, editVal); if (e.key === "Escape") setEditing(null); }}
                              className="w-full px-1.5 py-0.5 rounded-lg border border-accent/40 bg-white text-sm focus:outline-none" />
                          )
                        ) : col.type === "boolean" && canEdit ? (
                          <button onClick={() => toggleBoolean(row.id, col.key, !!val)}
                            className={`text-xs font-medium px-2 py-0.5 rounded-full ${val ? "bg-green-100 text-green-700" : "bg-gray-100 text-text-tertiary"}`}>
                            {val ? "Yes" : "No"}
                          </button>
                        ) : (
                          <div
                            className={`truncate ${canEdit ? "cursor-pointer hover:bg-accent/5 rounded px-1 -mx-1" : "text-text-secondary"}`}
                            onClick={() => {
                              if (!canEdit) return;
                              let initVal = val != null ? String(val) : "";
                              if (col.type === "datetime" && val) {
                                const d = new Date(String(val));
                                // datetime-local input needs LOCAL time, not UTC
                                const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                                initVal = localIso;
                              }
                              setEditing({ id: row.id, key: col.key });
                              setEditVal(initVal);
                            }}
                            title={canEdit ? "Click to edit" : undefined}>
                            {display === "—" ? <span className="text-text-tertiary">—</span> : display}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-text-tertiary mt-2">
        {filtered.length} {filtered.length === 1 ? "row" : "rows"}
        {typeFilter && ` · type: "${typeFilter}"`}
        {statusFilter && ` · status: "${statusFilter}"`}
        {search && ` matching "${search}"`}
      </p>
    </div>
  );
}
