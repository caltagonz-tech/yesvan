"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

function statusBadge(status: string | null) {
  const map: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    completed: "bg-blue-100 text-blue-700",
    confirmed: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
    pending: "bg-yellow-100 text-yellow-700",
    arrival: "bg-purple-100 text-purple-700",
    departure: "bg-orange-100 text-orange-700",
  };
  const cls = map[status ?? ""] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${cls}`}>
      {status || "—"}
    </span>
  );
}

function fmtDate(val: string | null) {
  if (!val) return "—";
  return new Date(val).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(val: string | null) {
  if (!val) return "—";
  return new Date(val).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Student Expansion ────────────────────────────────────────────────────────

type HomestayForStudent = {
  id: string;
  arrival_date: string | null;
  departure_date: string | null;
  status: string | null;
  homestay_fee: number | null;
  host_families: { family_name: string } | null;
};

type TransportForStudent = {
  id: string;
  display_id: string | null;
  type: string | null;
  datetime: string | null;
  flight_number: string | null;
  status: string | null;
  drivers: { first_name: string | null; last_name: string | null } | null;
};

export function StudentExpansion({ row }: { row: Record<string, unknown> }) {
  const supabase = createClient();
  const [homestays, setHomestays] = useState<HomestayForStudent[]>([]);
  const [transports, setTransports] = useState<TransportForStudent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const studentId = row.id as string;
    Promise.all([
      supabase
        .from("homestays")
        .select("id, arrival_date, departure_date, status, homestay_fee, host_families(family_name)")
        .eq("student_id", studentId)
        .order("arrival_date"),
      supabase
        .from("transports")
        .select("id, display_id, type, datetime, flight_number, status, drivers(first_name, last_name)")
        .eq("student_id", studentId)
        .order("datetime"),
    ]).then(([{ data: h }, { data: t }]) => {
      setHomestays((h as unknown as HomestayForStudent[]) || []);
      setTransports((t as unknown as TransportForStudent[]) || []);
      setLoading(false);
    });
  }, [row.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="px-6 py-3 text-xs text-text-tertiary">Loading...</div>;

  return (
    <div className="px-6 py-4 grid grid-cols-2 gap-8">
      {/* Homestays */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary mb-2">Homestays</p>
        {homestays.length === 0 ? (
          <p className="text-xs text-text-tertiary">No homestays on record</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-text-tertiary border-b border-gray-100">
                <th className="pb-1.5 font-medium">Host</th>
                <th className="pb-1.5 font-medium">Arrival</th>
                <th className="pb-1.5 font-medium">Departure</th>
                <th className="pb-1.5 font-medium">Status</th>
                <th className="pb-1.5 font-medium text-right">Fee</th>
              </tr>
            </thead>
            <tbody>
              {homestays.map((h) => (
                <tr key={h.id} className="border-b border-gray-50">
                  <td className="py-1.5 pr-3">{h.host_families?.family_name || "—"}</td>
                  <td className="py-1.5 pr-3">{fmtDate(h.arrival_date)}</td>
                  <td className="py-1.5 pr-3">{fmtDate(h.departure_date)}</td>
                  <td className="py-1.5 pr-3">{statusBadge(h.status)}</td>
                  <td className="py-1.5 text-right">
                    {h.homestay_fee != null ? `$${Number(h.homestay_fee).toLocaleString("en-CA")}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Transports */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary mb-2">Transports</p>
        {transports.length === 0 ? (
          <p className="text-xs text-text-tertiary">No transports on record</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-text-tertiary border-b border-gray-100">
                <th className="pb-1.5 font-medium">Type</th>
                <th className="pb-1.5 font-medium">Date/Time</th>
                <th className="pb-1.5 font-medium">Driver</th>
                <th className="pb-1.5 font-medium">Flight #</th>
                <th className="pb-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {transports.map((t) => (
                <tr key={t.id} className="border-b border-gray-50">
                  <td className="py-1.5 pr-3 capitalize">{t.type || "—"}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{fmtDateTime(t.datetime)}</td>
                  <td className="py-1.5 pr-3">
                    {t.drivers ? `${t.drivers.first_name || ""} ${t.drivers.last_name || ""}`.trim() || "—" : "—"}
                  </td>
                  <td className="py-1.5 pr-3">{t.flight_number || "—"}</td>
                  <td className="py-1.5">{statusBadge(t.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Host Expansion ───────────────────────────────────────────────────────────

type HomestayForHost = {
  id: string;
  arrival_date: string | null;
  departure_date: string | null;
  status: string | null;
  homestay_fee: number | null;
  students: { display_id: string | null; first_name: string | null; last_name: string | null } | null;
};

export function HostExpansion({ row }: { row: Record<string, unknown> }) {
  const supabase = createClient();
  const [homestays, setHomestays] = useState<HomestayForHost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("homestays")
      .select("id, arrival_date, departure_date, status, homestay_fee, students(display_id, first_name, last_name)")
      .eq("host_id", row.id as string)
      .order("arrival_date")
      .then(({ data }) => {
        setHomestays((data as unknown as HomestayForHost[]) || []);
        setLoading(false);
      });
  }, [row.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="px-6 py-3 text-xs text-text-tertiary">Loading...</div>;

  return (
    <div className="px-6 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary mb-2">Homestays</p>
      {homestays.length === 0 ? (
        <p className="text-xs text-text-tertiary">No homestays on record</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-text-tertiary border-b border-gray-100">
              <th className="pb-1.5 font-medium">Student</th>
              <th className="pb-1.5 font-medium">Arrival</th>
              <th className="pb-1.5 font-medium">Departure</th>
              <th className="pb-1.5 font-medium">Status</th>
              <th className="pb-1.5 font-medium text-right">Fee</th>
            </tr>
          </thead>
          <tbody>
            {homestays.map((h) => (
              <tr key={h.id} className="border-b border-gray-50">
                <td className="py-1.5 pr-3">
                  {h.students
                    ? `${h.students.display_id || ""} ${h.students.first_name || ""} ${h.students.last_name || ""}`.trim()
                    : "—"}
                </td>
                <td className="py-1.5 pr-3">{fmtDate(h.arrival_date)}</td>
                <td className="py-1.5 pr-3">{fmtDate(h.departure_date)}</td>
                <td className="py-1.5 pr-3">{statusBadge(h.status)}</td>
                <td className="py-1.5 text-right">
                  {h.homestay_fee != null ? `$${Number(h.homestay_fee).toLocaleString("en-CA")}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Driver Expansion ─────────────────────────────────────────────────────────

type TransportForDriver = {
  id: string;
  display_id: string | null;
  type: string | null;
  datetime: string | null;
  flight_number: string | null;
  status: string | null;
  students: { display_id: string | null; first_name: string | null; last_name: string | null } | null;
};

export function DriverExpansion({ row }: { row: Record<string, unknown> }) {
  const supabase = createClient();
  const [transports, setTransports] = useState<TransportForDriver[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("transports")
      .select("id, display_id, type, datetime, flight_number, status, students(display_id, first_name, last_name)")
      .eq("driver_id", row.id as string)
      .order("datetime")
      .then(({ data }) => {
        setTransports((data as unknown as TransportForDriver[]) || []);
        setLoading(false);
      });
  }, [row.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="px-6 py-3 text-xs text-text-tertiary">Loading...</div>;

  return (
    <div className="px-6 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary mb-2">Transports</p>
      {transports.length === 0 ? (
        <p className="text-xs text-text-tertiary">No transports on record</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-text-tertiary border-b border-gray-100">
              <th className="pb-1.5 font-medium">ID</th>
              <th className="pb-1.5 font-medium">Type</th>
              <th className="pb-1.5 font-medium">Student</th>
              <th className="pb-1.5 font-medium">Date/Time</th>
              <th className="pb-1.5 font-medium">Flight #</th>
              <th className="pb-1.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {transports.map((t) => (
              <tr key={t.id} className="border-b border-gray-50">
                <td className="py-1.5 pr-3 text-text-tertiary">{t.display_id || "—"}</td>
                <td className="py-1.5 pr-3 capitalize">{t.type || "—"}</td>
                <td className="py-1.5 pr-3">
                  {t.students
                    ? `${t.students.display_id || ""} ${t.students.first_name || ""} ${t.students.last_name || ""}`.trim()
                    : "—"}
                </td>
                <td className="py-1.5 pr-3 whitespace-nowrap">{fmtDateTime(t.datetime)}</td>
                <td className="py-1.5 pr-3">{t.flight_number || "—"}</td>
                <td className="py-1.5">{statusBadge(t.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
