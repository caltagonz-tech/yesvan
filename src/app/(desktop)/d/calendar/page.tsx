"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

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
  const msPerDay = 86400000;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

type ViewMode = "month" | "timeline";

export default function CalendarPage() {
  const [homestays, setHomestays] = useState<Homestay[]>([]);
  const [transports, setTransports] = useState<Transport[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [view, setView] = useState<ViewMode>("month");

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

  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    homestays.forEach((h, i) => {
      map[h.id] = HOMESTAY_COLORS[i % HOMESTAY_COLORS.length];
    });
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

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDay(null);
  }

  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDay(null);
  }

  function goToday() {
    setCurrentDate(new Date());
    setSelectedDay(new Date().getDate());
  }

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedHomestays = selectedDay ? getHomestaysForDay(selectedDay) : [];
  const selectedTransports = selectedDay ? getTransportsForDay(selectedDay) : [];

  // Timeline data
  const timelineDays = useMemo(() => {
    const days: Date[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  }, [year, month, daysInMonth]);

  const timelineStartDate = new Date(year, month, 1);

  // Group homestays by student for timeline rows
  const timelineRows = useMemo(() => {
    const rows: {
      label: string;
      sublabel: string;
      homestay: Homestay;
      colorIndex: number;
      startCol: number;
      spanCols: number;
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
      const studentTransports = transports.filter(
        (t) => t.students?.display_id === studentId && t.datetime
      );
      const transportsOnRow = studentTransports
        .map((t) => {
          const td = new Date(t.datetime!);
          if (td.getFullYear() === year && td.getMonth() === month) {
            return { day: td.getDate(), transport: t };
          }
          return null;
        })
        .filter(Boolean) as { day: number; transport: Transport }[];

      rows.push({
        label: h.students ? `${h.students.display_id}` : "?",
        sublabel: h.students ? `${h.students.first_name} ${h.students.last_name}` : "Unknown",
        homestay: h,
        colorIndex: i,
        startCol,
        spanCols: Math.max(spanCols, 1),
        transportsOnRow,
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading font-bold text-xl text-text-primary">Homestay Calendar</h1>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-xl border border-gray-200 bg-white overflow-hidden">
            <button
              onClick={() => setView("month")}
              className={`px-3 py-1.5 text-sm font-medium flex items-center gap-1.5 transition-colors ${
                view === "month" ? "bg-text-primary text-white" : "text-text-secondary hover:bg-gray-50"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">calendar_view_month</span>
              Month
            </button>
            <button
              onClick={() => setView("timeline")}
              className={`px-3 py-1.5 text-sm font-medium flex items-center gap-1.5 transition-colors ${
                view === "timeline" ? "bg-text-primary text-white" : "text-text-secondary hover:bg-gray-50"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">view_timeline</span>
              Timeline
            </button>
          </div>

          <div className="w-px h-6 bg-gray-200" />

          <button onClick={goToday} className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-text-secondary hover:bg-gray-50">
            Today
          </button>
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

      {view === "month" ? (
        <MonthView
          cells={cells}
          year={year}
          month={month}
          isCurrentMonth={isCurrentMonth}
          today={today}
          selectedDay={selectedDay}
          setSelectedDay={setSelectedDay}
          getHomestaysForDay={getHomestaysForDay}
          getTransportsForDay={getTransportsForDay}
          isHomestayStart={isHomestayStart}
          isHomestayEnd={isHomestayEnd}
          colorMap={colorMap}
          homestays={homestays}
          selectedHomestays={selectedHomestays}
          selectedTransports={selectedTransports}
        />
      ) : (
        <TimelineView
          timelineDays={timelineDays}
          timelineRows={timelineRows}
          daysInMonth={daysInMonth}
          today={today}
          isCurrentMonth={isCurrentMonth}
          year={year}
          month={month}
        />
      )}
    </div>
  );
}

function MonthView({
  cells, year, month, isCurrentMonth, today, selectedDay, setSelectedDay,
  getHomestaysForDay, getTransportsForDay, isHomestayStart, isHomestayEnd,
  colorMap, homestays, selectedHomestays, selectedTransports,
}: {
  cells: (number | null)[];
  year: number;
  month: number;
  isCurrentMonth: boolean;
  today: Date;
  selectedDay: number | null;
  setSelectedDay: (d: number | null) => void;
  getHomestaysForDay: (d: number) => Homestay[];
  getTransportsForDay: (d: number) => Transport[];
  isHomestayStart: (h: Homestay, d: number) => boolean;
  isHomestayEnd: (h: Homestay, d: number) => boolean;
  colorMap: Record<string, string>;
  homestays: Homestay[];
  selectedHomestays: Homestay[];
  selectedTransports: Transport[];
}) {
  return (
    <div className="flex gap-6">
      <div className="flex-1 rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-100">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-2.5 text-center text-xs font-semibold text-text-tertiary">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (day === null) {
              return <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-gray-50 bg-gray-50/30" />;
            }

            const dayHomestays = getHomestaysForDay(day);
            const dayTransports = getTransportsForDay(day);
            const isToday = isCurrentMonth && day === today.getDate();
            const isSelected = selectedDay === day;

            return (
              <button
                key={day}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                className={`min-h-[80px] border-b border-r border-gray-50 p-1 text-left transition-colors ${
                  isSelected ? "bg-accent/5 ring-1 ring-accent/30 ring-inset" : "hover:bg-gray-50/50"
                }`}
              >
                <div className="flex items-center justify-between px-1">
                  <span className={`text-xs font-medium ${
                    isToday
                      ? "w-6 h-6 rounded-full bg-accent text-white flex items-center justify-center"
                      : "text-text-secondary"
                  }`}>
                    {day}
                  </span>
                  {dayTransports.length > 0 && (
                    <span className="material-symbols-outlined text-[12px] text-text-tertiary">flight</span>
                  )}
                </div>

                <div className="mt-1 space-y-0.5">
                  {dayHomestays.slice(0, 3).map((h) => {
                    const start = isHomestayStart(h, day);
                    const end = isHomestayEnd(h, day);
                    return (
                      <div
                        key={h.id}
                        className={`text-[10px] font-medium px-1.5 py-0.5 border truncate ${colorMap[h.id]} ${
                          start ? "rounded-l-md" : ""
                        } ${end ? "rounded-r-md" : ""} ${!start && !end ? "border-l-0 border-r-0" : ""}`}
                      >
                        {start ? (h.students?.display_id || "?") : ""}
                      </div>
                    );
                  })}
                  {dayHomestays.length > 3 && (
                    <div className="text-[10px] text-text-tertiary px-1">+{dayHomestays.length - 3}</div>
                  )}
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
                        <p className="text-xs font-medium">
                          {h.students ? `${h.students.first_name} ${h.students.last_name}` : "Unknown"}
                        </p>
                        <p className="text-[11px] mt-0.5 opacity-75">
                          Host: {h.host_families?.family_name || h.host_families?.display_id || "TBD"}
                        </p>
                        <p className="text-[11px] opacity-75">
                          {h.arrival_date} → {h.departure_date || "ongoing"}
                        </p>
                        <span className={`text-[10px] mt-1 inline-block px-1.5 py-0.5 rounded-full font-medium ${
                          h.status === "active" ? "bg-white/50" : "bg-white/30"
                        }`}>
                          {h.status}
                        </span>
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
                        <span className="material-symbols-outlined text-[14px] text-text-secondary">
                          {t.type === "arrival" ? "flight_land" : "flight_takeoff"}
                        </span>
                        <span className="text-xs font-semibold text-text-primary">
                          {t.type === "arrival" ? "Arrival" : "Departure"}
                        </span>
                      </div>
                      <p className="text-xs text-text-primary">{t.students?.display_id} — {t.students?.first_name}</p>
                      {t.flight_number && (
                        <p className="text-[11px] text-text-tertiary">Flight: {t.flight_number}</p>
                      )}
                      {t.datetime && (
                        <p className="text-[11px] text-text-tertiary">
                          {new Date(t.datetime).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      )}
                      <span className={`text-[10px] mt-1 inline-block px-1.5 py-0.5 rounded-full font-medium ${
                        t.status === "confirmed" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {t.status}
                      </span>
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
                      <span className="text-xs text-text-primary truncate">
                        {h.students?.display_id} — {h.host_families?.family_name || "TBD"}
                      </span>
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

function TimelineView({
  timelineDays, timelineRows, daysInMonth, today, isCurrentMonth, year, month,
}: {
  timelineDays: Date[];
  timelineRows: {
    label: string;
    sublabel: string;
    homestay: Homestay;
    colorIndex: number;
    startCol: number;
    spanCols: number;
    transportsOnRow: { day: number; transport: Transport }[];
  }[];
  daysInMonth: number;
  today: Date;
  isCurrentMonth: boolean;
  year: number;
  month: number;
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
          {/* Fixed label column */}
          <div className="flex-shrink-0 border-r border-gray-200 bg-gray-50/50 z-10">
            {/* Header spacer */}
            <div className="h-[52px] border-b border-gray-200 px-4 flex items-center">
              <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wide">Student</span>
            </div>
            {timelineRows.map((row) => (
              <div
                key={row.homestay.id}
                className={`h-[48px] border-b border-gray-100 px-4 flex items-center gap-2 transition-colors ${
                  hoveredRow === row.homestay.id ? "bg-gray-100/80" : ""
                }`}
                onMouseEnter={() => setHoveredRow(row.homestay.id)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                <div className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${TIMELINE_BAR_COLORS[row.colorIndex % TIMELINE_BAR_COLORS.length].bg}`} />
                <div className="min-w-[120px]">
                  <p className="text-xs font-semibold text-text-primary leading-tight">{row.label}</p>
                  <p className="text-[10px] text-text-tertiary leading-tight truncate max-w-[110px]">{row.sublabel}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Scrollable timeline grid */}
          <div className="flex-1 overflow-x-auto">
            <div style={{ minWidth: daysInMonth * colWidth }}>
              {/* Day headers */}
              <div className="flex border-b border-gray-200">
                {timelineDays.map((d, i) => {
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const isTodayCol = i === todayCol;
                  return (
                    <div
                      key={i}
                      className={`flex-shrink-0 text-center border-r border-gray-100 py-1 ${
                        isTodayCol ? "bg-accent/10" : isWeekend ? "bg-gray-50/60" : ""
                      }`}
                      style={{ width: colWidth }}
                    >
                      <div className="text-[9px] text-text-tertiary font-medium">
                        {WEEKDAYS[d.getDay()].charAt(0)}
                      </div>
                      <div className={`text-xs font-medium ${
                        isTodayCol
                          ? "w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center mx-auto"
                          : "text-text-secondary"
                      }`}>
                        {d.getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Timeline rows */}
              {timelineRows.map((row) => {
                const colors = TIMELINE_BAR_COLORS[row.colorIndex % TIMELINE_BAR_COLORS.length];
                return (
                  <div
                    key={row.homestay.id}
                    className={`relative h-[48px] border-b border-gray-100 transition-colors ${
                      hoveredRow === row.homestay.id ? "bg-gray-50/50" : ""
                    }`}
                    onMouseEnter={() => setHoveredRow(row.homestay.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    {/* Grid lines */}
                    <div className="absolute inset-0 flex pointer-events-none">
                      {timelineDays.map((d, i) => {
                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                        const isTodayCol = i === todayCol;
                        return (
                          <div
                            key={i}
                            className={`flex-shrink-0 border-r border-gray-50 ${
                              isTodayCol ? "bg-accent/5" : isWeekend ? "bg-gray-50/30" : ""
                            }`}
                            style={{ width: colWidth }}
                          />
                        );
                      })}
                    </div>

                    {/* Today line */}
                    {todayCol >= 0 && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-accent/40 z-10 pointer-events-none"
                        style={{ left: todayCol * colWidth + colWidth / 2 }}
                      />
                    )}

                    {/* Homestay bar */}
                    <div
                      className={`absolute top-2 h-7 rounded-lg border ${colors.bg} ${colors.border} ${colors.text} flex items-center px-2 text-[10px] font-semibold shadow-sm cursor-default z-20`}
                      style={{
                        left: row.startCol * colWidth + 2,
                        width: row.spanCols * colWidth - 4,
                      }}
                      title={`${row.sublabel} @ ${row.homestay.host_families?.family_name || "TBD"} · ${row.homestay.arrival_date} → ${row.homestay.departure_date || "ongoing"}`}
                    >
                      <span className="truncate">
                        {row.homestay.host_families?.family_name || "TBD"}
                      </span>
                      <span className={`ml-auto text-[9px] opacity-60 flex-shrink-0 ml-1 px-1 py-0.5 rounded ${
                        row.homestay.status === "active" ? "bg-white/40" : "bg-white/20"
                      }`}>
                        {row.homestay.status}
                      </span>
                    </div>

                    {/* Transport markers */}
                    {row.transportsOnRow.map((tp) => {
                      const col = tp.day - 1;
                      return (
                        <div
                          key={tp.transport.id}
                          className="absolute z-30 pointer-events-none"
                          style={{ left: col * colWidth + colWidth / 2 - 7, top: tp.transport.type === "arrival" ? 0 : 34 }}
                          title={`${tp.transport.type === "arrival" ? "Arrival" : "Departure"} — ${tp.transport.flight_number || ""}`}
                        >
                          <span className={`material-symbols-outlined text-[14px] ${
                            tp.transport.type === "arrival" ? "text-green-600" : "text-red-500"
                          }`}>
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

      {/* Legend */}
      <div className="border-t border-gray-200 px-4 py-2.5 flex items-center gap-4 bg-gray-50/30">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[14px] text-green-600">flight_land</span>
          <span className="text-[11px] text-text-tertiary">Arrival</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[14px] text-red-500">flight_takeoff</span>
          <span className="text-[11px] text-text-tertiary">Departure</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-px h-3 bg-accent/40" />
          <span className="text-[11px] text-text-tertiary">Today</span>
        </div>
        <div className="ml-auto text-[11px] text-text-tertiary">
          {timelineRows.length} active homestay{timelineRows.length !== 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
}
