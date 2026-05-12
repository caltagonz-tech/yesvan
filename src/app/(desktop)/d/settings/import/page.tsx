"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type TableTarget = "students" | "host_families" | "drivers" | "universities" | "payments";

const TABLE_COLUMNS: Record<TableTarget, { key: string; label: string; required?: boolean }[]> = {
  students: [
    { key: "first_name", label: "First name", required: true },
    { key: "last_name", label: "Last name", required: true },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "country_of_origin", label: "Country" },
    { key: "program", label: "Program" },
    { key: "intake", label: "Intake" },
    { key: "stage", label: "Stage" },
    { key: "english_level", label: "English level" },
    { key: "education_level", label: "Education level" },
    { key: "area_of_study", label: "Area of study" },
    { key: "preferred_city", label: "Preferred city" },
    { key: "referred_by", label: "Referred by" },
    { key: "notes", label: "Notes" },
  ],
  host_families: [
    { key: "family_name", label: "Family name", required: true },
    { key: "primary_contact", label: "Primary contact", required: true },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "address", label: "Address" },
    { key: "city", label: "City" },
    { key: "capacity", label: "Capacity" },
    { key: "monthly_rate", label: "Monthly rate" },
    { key: "notes", label: "Notes" },
  ],
  drivers: [
    { key: "name", label: "Name", required: true },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "vehicle_type", label: "Vehicle type" },
    { key: "rate_airport", label: "Airport rate" },
    { key: "notes", label: "Notes" },
  ],
  universities: [
    { key: "name", label: "Name", required: true },
    { key: "short_name", label: "Short name" },
    { key: "city", label: "City" },
    { key: "type", label: "Type" },
    { key: "contact_name", label: "Contact name" },
    { key: "contact_email", label: "Contact email" },
    { key: "contact_phone", label: "Contact phone" },
    { key: "commission_scheme", label: "Commission scheme" },
    { key: "notes", label: "Notes" },
  ],
  payments: [
    { key: "type", label: "Type", required: true },
    { key: "amount", label: "Amount", required: true },
    { key: "currency", label: "Currency" },
    { key: "status", label: "Status" },
    { key: "direction", label: "Direction" },
    { key: "method", label: "Method" },
    { key: "notes", label: "Notes" },
  ],
};

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

function autoMap(csvHeaders: string[], tableColumns: { key: string; label: string }[]): Record<number, string> {
  const mapping: Record<number, string> = {};
  csvHeaders.forEach((h, i) => {
    const normalized = h.toLowerCase().replace(/[^a-z0-9]/g, "");
    const match = tableColumns.find((col) => {
      const colNorm = col.key.replace(/_/g, "");
      const labelNorm = col.label.toLowerCase().replace(/[^a-z0-9]/g, "");
      return colNorm === normalized || labelNorm === normalized || normalized.includes(colNorm) || colNorm.includes(normalized);
    });
    if (match) mapping[i] = match.key;
  });
  return mapping;
}

export default function CSVImportPage() {
  const [step, setStep] = useState<"upload" | "map" | "preview" | "done">("upload");
  const [target, setTarget] = useState<TableTarget>("students");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: string[] }>({ success: 0, errors: [] });
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = createClient();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseCSV(text);
      setCsvHeaders(headers);
      setCsvRows(rows);
      const autoMapped = autoMap(headers, TABLE_COLUMNS[target]);
      setMapping(autoMapped);
      setStep("map");
    };
    reader.readAsText(file);
  }

  function updateMapping(csvIndex: number, dbColumn: string) {
    setMapping({ ...mapping, [csvIndex]: dbColumn || "" });
  }

  function getMappedRows(): Record<string, string>[] {
    return csvRows.map((row) => {
      const obj: Record<string, string> = {};
      Object.entries(mapping).forEach(([csvIdx, dbCol]) => {
        if (dbCol && row[Number(csvIdx)] !== undefined) {
          obj[dbCol] = row[Number(csvIdx)];
        }
      });
      return obj;
    }).filter((obj) => Object.keys(obj).length > 0);
  }

  function getPreviewErrors(): string[] {
    const errors: string[] = [];
    const requiredCols = TABLE_COLUMNS[target].filter((c) => c.required).map((c) => c.key);
    const mappedCols = new Set(Object.values(mapping).filter(Boolean));

    requiredCols.forEach((col) => {
      if (!mappedCols.has(col)) {
        const label = TABLE_COLUMNS[target].find((c) => c.key === col)?.label || col;
        errors.push(`Required column "${label}" is not mapped`);
      }
    });

    const mappedRows = getMappedRows();
    mappedRows.forEach((row, i) => {
      requiredCols.forEach((col) => {
        if (!row[col]?.trim()) {
          errors.push(`Row ${i + 1}: missing required value for "${col}"`);
        }
      });
    });

    return errors.slice(0, 10);
  }

  async function handleImport() {
    setImporting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setImporting(false); return; }

    const rows = getMappedRows();
    let success = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row: Record<string, string> = { ...rows[i], created_by: user.id };

      if (target === "payments" && row.amount) {
        row.amount = String(parseFloat(row.amount) || 0);
      }

      const { error } = await supabase.from(target).insert(row);
      if (error) {
        errors.push(`Row ${i + 1}: ${error.message}`);
      } else {
        success++;
      }
    }

    setImportResult({ success, errors });
    setStep("done");
    setImporting(false);
  }

  const columns = TABLE_COLUMNS[target];
  const previewErrors = step === "preview" ? getPreviewErrors() : [];
  const mappedRows = step === "preview" ? getMappedRows() : [];
  const hasRequiredMissing = previewErrors.some((e) => e.startsWith("Required"));

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push("/d/settings")} className="p-1 rounded-lg hover:bg-gray-100 text-text-secondary">
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <div>
          <h1 className="font-heading font-bold text-xl text-text-primary">CSV Import</h1>
          <p className="text-xs text-text-tertiary mt-0.5">Import data from CSV files into any table</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {["Upload", "Map columns", "Preview", "Done"].map((label, i) => {
          const stepNames = ["upload", "map", "preview", "done"];
          const currentIdx = stepNames.indexOf(step);
          const isActive = i === currentIdx;
          const isDone = i < currentIdx;
          return (
            <div key={label} className="flex items-center gap-2">
              {i > 0 && <div className={`w-8 h-px ${isDone ? "bg-accent" : "bg-gray-200"}`} />}
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                isActive ? "bg-accent/10 text-accent" : isDone ? "text-accent" : "text-text-tertiary"
              }`}>
                {isDone ? (
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                ) : (
                  <span className="text-[11px] font-bold">{i + 1}</span>
                )}
                {label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Step: Upload */}
      {step === "upload" && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="mb-4">
            <label className="text-sm font-medium text-text-primary block mb-2">Target table</label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as TableTarget)}
              className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="students">Students</option>
              <option value="host_families">Host Families</option>
              <option value="drivers">Drivers</option>
              <option value="universities">Universities</option>
              <option value="payments">Payments</option>
            </select>
          </div>

          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-2xl p-10 text-center cursor-pointer hover:border-accent/40 hover:bg-accent/5 transition-colors"
          >
            <span className="material-symbols-outlined text-[40px] text-text-tertiary mb-2">upload_file</span>
            <p className="text-sm font-medium text-text-primary">Drop a CSV file here or click to browse</p>
            <p className="text-xs text-text-tertiary mt-1">First row should be column headers</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              className="hidden"
            />
          </div>
        </div>
      )}

      {/* Step: Map */}
      {step === "map" && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-heading font-semibold text-sm text-text-primary">Column mapping</h2>
              <p className="text-xs text-text-tertiary mt-0.5">
                {csvRows.length} rows found · Map CSV columns to database fields
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep("upload")} className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary">
                Back
              </button>
              <button
                onClick={() => setStep("preview")}
                className="px-4 py-1.5 rounded-xl bg-text-primary text-white text-sm font-semibold hover:opacity-90"
              >
                Preview
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {csvHeaders.map((header, i) => (
              <div key={i} className="flex items-center gap-4 py-2">
                <div className="w-48 flex-shrink-0">
                  <span className="text-sm font-medium text-text-primary">{header}</span>
                  <span className="text-xs text-text-tertiary block truncate">
                    e.g. {csvRows[0]?.[i] || "—"}
                  </span>
                </div>
                <span className="material-symbols-outlined text-[16px] text-text-tertiary">arrow_forward</span>
                <select
                  value={mapping[i] || ""}
                  onChange={(e) => updateMapping(i, e.target.value)}
                  className={`px-3 py-1.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 ${
                    mapping[i] ? "border-accent/30 bg-accent/5" : "border-gray-200 bg-white"
                  }`}
                >
                  <option value="">— Skip —</option>
                  {columns.map((col) => (
                    <option key={col.key} value={col.key}>
                      {col.label}{col.required ? " *" : ""}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step: Preview */}
      {step === "preview" && (
        <div className="space-y-4">
          {previewErrors.length > 0 && (
            <div className={`rounded-2xl border p-4 ${hasRequiredMissing ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-[18px] text-red-600">warning</span>
                <span className="text-sm font-medium text-red-800">Issues found</span>
              </div>
              <ul className="space-y-1">
                {previewErrors.map((err, i) => (
                  <li key={i} className="text-xs text-red-700">{err}</li>
                ))}
                {previewErrors.length >= 10 && (
                  <li className="text-xs text-red-500 italic">...and more</li>
                )}
              </ul>
            </div>
          )}

          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-heading font-semibold text-sm text-text-primary">Preview</h2>
                <p className="text-xs text-text-tertiary mt-0.5">
                  {mappedRows.length} rows will be imported into <strong>{target.replace(/_/g, " ")}</strong>
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep("map")} className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary">
                  Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing || hasRequiredMissing || mappedRows.length === 0}
                  className="px-4 py-1.5 rounded-xl bg-text-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {importing ? "Importing..." : `Import ${mappedRows.length} rows`}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-2 font-semibold text-text-secondary">#</th>
                    {Object.values(mapping).filter(Boolean).map((col) => (
                      <th key={col} className="text-left py-2 px-2 font-semibold text-text-secondary">
                        {columns.find((c) => c.key === col)?.label || col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mappedRows.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-1.5 px-2 text-text-tertiary">{i + 1}</td>
                      {Object.values(mapping).filter(Boolean).map((col) => (
                        <td key={col} className="py-1.5 px-2 text-text-primary truncate max-w-[150px]">
                          {row[col] || <span className="text-text-tertiary">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {mappedRows.length > 10 && (
                <p className="text-xs text-text-tertiary text-center py-2">
                  Showing first 10 of {mappedRows.length} rows
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step: Done */}
      {step === "done" && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <span className="material-symbols-outlined text-[48px] text-green-500 mb-3">check_circle</span>
          <h2 className="font-heading font-semibold text-lg text-text-primary mb-1">Import complete</h2>
          <p className="text-sm text-text-secondary">
            {importResult.success} row{importResult.success !== 1 ? "s" : ""} imported successfully
            {importResult.errors.length > 0 && `, ${importResult.errors.length} failed`}
          </p>

          {importResult.errors.length > 0 && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-left max-h-40 overflow-y-auto">
              {importResult.errors.map((err, i) => (
                <p key={i} className="text-xs text-red-700">{err}</p>
              ))}
            </div>
          )}

          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => { setStep("upload"); setCsvHeaders([]); setCsvRows([]); setMapping({}); }}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-text-secondary hover:bg-gray-50"
            >
              Import more
            </button>
            <button
              onClick={() => router.push(`/d/${target === "host_families" ? "hosts" : target}`)}
              className="px-4 py-2 rounded-xl bg-text-primary text-white text-sm font-semibold hover:opacity-90"
            >
              View {target.replace(/_/g, " ")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
