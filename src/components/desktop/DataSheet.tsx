"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ColumnDef } from "@/lib/supabase/types";

type DataSheetProps = {
  tableName: string;
  columns: ColumnDef[];
  title: string;
  displayIdPrefix?: string;
  hasArchived?: boolean;
  onRowAction?: (rowId: string) => void;
  rowActionLabel?: string;
  renderExpandedRow?: (row: Record<string, unknown>) => React.ReactNode;
};

type CellHistoryEntry = {
  id: number;
  column_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  changed_at: string;
  change_source: string;
  user_name?: string;
};

export default function DataSheet({ tableName, columns, title, hasArchived = true, onRowAction, rowActionLabel, renderExpandedRow }: DataSheetProps) {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingCell, setEditingCell] = useState<{ rowId: string; colKey: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(columns.filter((c) => c.visible !== false).map((c) => c.key))
  );
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Cell history
  const [cellHistory, setCellHistory] = useState<{ rowId: string; colKey: string; entries: CellHistoryEntry[] } | null>(null);
  const [cellHistoryLoading, setCellHistoryLoading] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Column filters
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [filterDropdown, setFilterDropdown] = useState<string | null>(null);

  // Users cache for showing names
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});

  const supabase = createClient();

  // Fetch users for displaying editor names
  useEffect(() => {
    supabase.from("users").select("id, first_name, last_name").then(({ data: users }) => {
      if (users) {
        const map: Record<string, string> = {};
        for (const u of users) map[u.id] = `${u.first_name || ""} ${u.last_name || ""}`.trim() || "Unknown";
        setUsersMap(map);
      }
    });
  }, [supabase]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    let query = supabase.from(tableName).select("*");
    if (hasArchived) query = query.eq("archived", false);
    const { data: rows, error } = await query.order("created_at", { ascending: false });

    if (!error && rows) setData(rows);
    setLoading(false);
  }, [tableName, supabase, hasArchived]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`${tableName}-changes`)
      .on("postgres_changes", { event: "*", schema: "public", table: tableName }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tableName, supabase, fetchData]);

  // Close history popup on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setCellHistory(null);
      }
    }
    if (cellHistory) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [cellHistory]);

  // Get unique values for filter dropdowns
  const columnUniqueValues = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const col of columns) {
      if (col.type === "text" || col.type === "select") {
        const vals = new Set<string>();
        for (const row of data) {
          const v = row[col.key];
          if (v != null && String(v).trim()) vals.add(String(v));
        }
        const sorted = Array.from(vals).sort();
        if (sorted.length > 0 && sorted.length <= 50) {
          map[col.key] = sorted;
        }
      }
    }
    return map;
  }, [data, columns]);

  const filteredData = useMemo(() => {
    let rows = data;

    // Apply column filters
    for (const [colKey, filterVal] of Object.entries(activeFilters)) {
      if (filterVal) {
        rows = rows.filter((row) => String(row[colKey] ?? "") === filterVal);
      }
    }

    // Apply search
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((row) =>
        columns.some((col) => {
          const val = row[col.key];
          return val != null && String(val).toLowerCase().includes(q);
        })
      );
    }

    // Apply sort
    if (sortCol) {
      rows = [...rows].sort((a, b) => {
        const aVal = a[sortCol] ?? "";
        const bVal = b[sortCol] ?? "";
        const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [data, search, sortCol, sortDir, columns, activeFilters]);

  const activeColumns = columns.filter((c) => visibleColumns.has(c.key));

  async function handleCellSave(rowId: string, colKey: string, value: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const updateData: Record<string, unknown> = { [colKey]: value || null, updated_by: user.id };
    await supabase.from(tableName).update(updateData).eq("id", rowId);
    setEditingCell(null);
    fetchData();
  }

  async function handleAddRow() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const newRow: Record<string, unknown> = { created_by: user.id, updated_by: user.id };
    const textCols = columns.filter((c) => c.type === "text");
    if (textCols.length > 0) {
      const nameCol = textCols.find((c) => c.key.includes("name") || c.key.includes("first_name"));
      if (nameCol) newRow[nameCol.key] = "New entry";
    }

    await supabase.from(tableName).insert(newRow);
    fetchData();
  }

  async function handleExportCSV() {
    const csvColumns = activeColumns;
    const rowsToExport = selectedRows.size > 0
      ? filteredData.filter((r) => selectedRows.has(r.id as string))
      : filteredData;

    const header = csvColumns.map((c) => c.label).join(",");
    const rows = rowsToExport.map((row) =>
      csvColumns.map((c) => {
        const val = row[c.key];
        if (val == null) return "";
        const str = String(val);
        return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tableName}_export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Bulk actions
  async function handleBulkArchive() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || selectedRows.size === 0) return;
    for (const rowId of selectedRows) {
      await supabase.from(tableName).update({ archived: true, updated_by: user.id }).eq("id", rowId);
    }
    setSelectedRows(new Set());
    fetchData();
  }

  async function handleBulkStatusChange(status: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || selectedRows.size === 0) return;
    for (const rowId of selectedRows) {
      await supabase.from(tableName).update({ status, updated_by: user.id }).eq("id", rowId);
    }
    setSelectedRows(new Set());
    fetchData();
  }

  // Cell history
  async function fetchCellHistory(rowId: string, colKey: string) {
    if (cellHistory?.rowId === rowId && cellHistory?.colKey === colKey) {
      setCellHistory(null);
      return;
    }
    setCellHistoryLoading(true);
    const { data: entries } = await supabase
      .from("change_log")
      .select("*")
      .eq("table_name", tableName)
      .eq("record_id", rowId)
      .eq("column_name", colKey)
      .order("changed_at", { ascending: false })
      .limit(20);

    const enriched = (entries || []).map((e: CellHistoryEntry) => ({
      ...e,
      user_name: usersMap[e.changed_by] || "Unknown",
    }));

    setCellHistory({ rowId, colKey, entries: enriched });
    setCellHistoryLoading(false);
  }

  // Get last editor for a row
  function getLastEditor(row: Record<string, unknown>): string | null {
    const updatedBy = row.updated_by as string | null;
    if (updatedBy && usersMap[updatedBy]) return usersMap[updatedBy];
    return null;
  }

  function handleSort(colKey: string) {
    if (sortCol === colKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(colKey);
      setSortDir("asc");
    }
  }

  function toggleSelectAll() {
    if (selectedRows.size === filteredData.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredData.map((r) => r.id as string)));
    }
  }

  function formatCellValue(value: unknown, col: ColumnDef): string {
    if (value == null) return "";
    if (col.type === "boolean") return value ? "Yes" : "No";
    if (col.type === "currency") return `$${Number(value).toLocaleString("en-CA", { minimumFractionDigits: 2 })}`;
    if (col.type === "date" && value) {
      return new Date(String(value)).toLocaleDateString("en-CA");
    }
    return String(value);
  }

  function formatRelativeTime(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  }

  const hasStatusColumn = columns.some((c) => c.key === "status");
  const activeFilterCount = Object.values(activeFilters).filter(Boolean).length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-heading font-bold text-xl text-text-primary">{title}</h1>
        <div className="flex items-center gap-2">
          <button onClick={handleAddRow}
            className="px-3 py-1.5 rounded-xl bg-text-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity">
            + Add row
          </button>
          <button onClick={handleExportCSV}
            className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-text-secondary hover:bg-gray-50">
            Export CSV
          </button>
          <div className="relative">
            <button onClick={() => setShowColumnPicker(!showColumnPicker)}
              className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-text-secondary hover:bg-gray-50">
              Columns
            </button>
            {showColumnPicker && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-50 max-h-80 overflow-y-auto">
                {columns.map((col) => (
                  <label key={col.key} className="flex items-center gap-2 py-1 text-sm text-text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.has(col.key)}
                      onChange={() => {
                        const next = new Set(visibleColumns);
                        if (next.has(col.key)) next.delete(col.key);
                        else next.add(col.key);
                        setVisibleColumns(next);
                      }}
                      className="rounded"
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-3">
        <input
          type="text"
          placeholder="Search across all columns..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {columns.filter((c) => columnUniqueValues[c.key]).map((col) => (
          <div key={col.key} className="relative">
            <button
              onClick={() => setFilterDropdown(filterDropdown === col.key ? null : col.key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                activeFilters[col.key]
                  ? "bg-accent/10 text-accent border border-accent/30"
                  : "bg-gray-100 text-text-secondary hover:bg-gray-200 border border-transparent"
              }`}
            >
              {col.label}
              {activeFilters[col.key] && (
                <span className="ml-1">: {activeFilters[col.key]}</span>
              )}
              <span className="ml-1 text-[10px]">▾</span>
            </button>
            {filterDropdown === col.key && (
              <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
                <button
                  onClick={() => {
                    const next = { ...activeFilters };
                    delete next[col.key];
                    setActiveFilters(next);
                    setFilterDropdown(null);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-text-tertiary hover:bg-gray-50"
                >
                  Clear filter
                </button>
                {(columnUniqueValues[col.key] || []).map((val) => (
                  <button
                    key={val}
                    onClick={() => {
                      setActiveFilters({ ...activeFilters, [col.key]: val });
                      setFilterDropdown(null);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${
                      activeFilters[col.key] === val ? "text-accent font-medium" : "text-text-primary"
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {activeFilterCount > 0 && (
          <button
            onClick={() => setActiveFilters({})}
            className="px-2.5 py-1 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50"
          >
            Clear all filters
          </button>
        )}
      </div>

      {/* Bulk actions */}
      {selectedRows.size > 0 && (
        <div className="mb-3 flex items-center gap-3 bg-accent/5 border border-accent/20 rounded-xl px-4 py-2">
          <span className="text-sm font-medium text-text-primary">{selectedRows.size} selected</span>
          <div className="h-4 w-px bg-gray-300" />
          <button
            onClick={handleExportCSV}
            className="text-xs font-medium text-accent hover:underline"
          >
            Export selected
          </button>
          {hasArchived && (
            <button
              onClick={handleBulkArchive}
              className="text-xs font-medium text-amber-600 hover:underline"
            >
              Archive
            </button>
          )}
          {hasStatusColumn && (
            <>
              <button
                onClick={() => handleBulkStatusChange("active")}
                className="text-xs font-medium text-green-600 hover:underline"
              >
                Set active
              </button>
              <button
                onClick={() => handleBulkStatusChange("completed")}
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                Set completed
              </button>
            </>
          )}
          <button
            onClick={() => setSelectedRows(new Set())}
            className="ml-auto text-xs text-text-tertiary hover:text-text-primary"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div className="border border-gray-200 rounded-2xl bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={selectedRows.size === filteredData.length && filteredData.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                </th>
                {renderExpandedRow && <th className="w-6 px-1" />}
                {activeColumns.map((col) => (
                  <th
                    key={col.key}
                    className="px-3 py-2.5 text-left font-semibold text-text-secondary cursor-pointer hover:text-text-primary select-none whitespace-nowrap"
                    style={{ minWidth: col.width || "120px" }}
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    {sortCol === col.key && (
                      <span className="ml-1 text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={activeColumns.length + 1} className="px-3 py-8 text-center text-text-tertiary">
                    Loading...
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={activeColumns.length + 1} className="px-3 py-8 text-center text-text-tertiary">
                    {search || activeFilterCount > 0 ? "No results found" : "No data yet. Click '+ Add row' to start."}
                  </td>
                </tr>
              ) : (
                filteredData.map((row) => {
                  const rowId = row.id as string;
                  const lastEditor = getLastEditor(row);
                  const updatedAt = row.updated_at as string | null;
                  const isExpanded = expandedRowId === rowId;
                  return (
                    <React.Fragment key={rowId}>
                    <tr className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors group ${isExpanded ? "bg-gray-50/60" : ""}`}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedRows.has(rowId)}
                          onChange={() => {
                            const next = new Set(selectedRows);
                            if (next.has(rowId)) next.delete(rowId);
                            else next.add(rowId);
                            setSelectedRows(next);
                          }}
                          className="rounded"
                        />
                      </td>
                      {renderExpandedRow && (
                        <td className="px-1 py-2 w-6">
                          <button
                            onClick={() => setExpandedRowId(isExpanded ? null : rowId)}
                            className="flex items-center justify-center text-text-tertiary hover:text-text-primary transition-colors"
                            title={isExpanded ? "Collapse" : "Expand"}
                          >
                            <span className={`material-symbols-outlined text-[16px] transition-transform duration-150 ${isExpanded ? "rotate-180" : ""}`}>
                              expand_more
                            </span>
                          </button>
                        </td>
                      )}
                      {activeColumns.map((col) => {
                        const isEditing = editingCell?.rowId === rowId && editingCell?.colKey === col.key;
                        const cellEditable = col.editable !== false;
                        const showingHistory = cellHistory?.rowId === rowId && cellHistory?.colKey === col.key;

                        return (
                          <td key={col.key} className="px-3 py-2 relative">
                            {isEditing ? (
                              <input
                                autoFocus
                                type={col.type === "number" || col.type === "currency" ? "number" : col.type === "date" ? "date" : "text"}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => handleCellSave(rowId, col.key, editValue)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleCellSave(rowId, col.key, editValue);
                                  if (e.key === "Escape") setEditingCell(null);
                                }}
                                className="w-full px-1.5 py-0.5 rounded-lg border border-accent/40 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-accent/40"
                              />
                            ) : (
                              <div className="flex items-center gap-1">
                                <div
                                  className={`truncate flex-1 ${cellEditable ? "cursor-pointer hover:bg-accent/5 rounded px-1 -mx-1" : ""}`}
                                  onClick={() => {
                                    if (!cellEditable) return;
                                    setEditingCell({ rowId, colKey: col.key });
                                    setEditValue(row[col.key] != null ? String(row[col.key]) : "");
                                  }}
                                  title={cellEditable ? "Click to edit" : undefined}
                                >
                                  {formatCellValue(row[col.key], col) || (
                                    <span className="text-text-tertiary">—</span>
                                  )}
                                </div>
                                {/* History icon — visible on hover */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); fetchCellHistory(rowId, col.key); }}
                                  className="opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity p-0.5 rounded"
                                  title="View edit history"
                                >
                                  <span className="material-symbols-outlined text-[14px]">history</span>
                                </button>
                              </div>
                            )}

                            {/* Cell history popup */}
                            {showingHistory && (
                              <div
                                ref={historyRef}
                                className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-3"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-semibold text-text-primary">
                                    Edit history — {columns.find((c) => c.key === col.key)?.label}
                                  </span>
                                  <button onClick={() => setCellHistory(null)} className="text-text-tertiary hover:text-text-primary">
                                    <span className="material-symbols-outlined text-[14px]">close</span>
                                  </button>
                                </div>

                                {/* Current state */}
                                {lastEditor && updatedAt && (
                                  <div className="text-[11px] text-text-tertiary mb-2 pb-2 border-b border-gray-100">
                                    Last edited by <span className="font-medium text-text-secondary">{lastEditor}</span>
                                    {" · "}{formatRelativeTime(updatedAt)}
                                  </div>
                                )}

                                {cellHistoryLoading ? (
                                  <p className="text-xs text-text-tertiary py-2">Loading...</p>
                                ) : cellHistory.entries.length === 0 ? (
                                  <p className="text-xs text-text-tertiary py-2">No changes recorded for this cell.</p>
                                ) : (
                                  <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {cellHistory.entries.map((entry) => (
                                      <div key={entry.id} className="text-[11px] border-l-2 border-accent/30 pl-2">
                                        <div className="text-text-secondary">
                                          <span className="font-medium">{entry.user_name}</span>
                                          {" · "}{formatRelativeTime(entry.changed_at)}
                                          {entry.change_source !== "manual" && (
                                            <span className="ml-1 px-1 py-0.5 rounded bg-gray-100 text-[9px] uppercase">{entry.change_source}</span>
                                          )}
                                        </div>
                                        <div className="text-text-tertiary mt-0.5">
                                          <span className="line-through">{entry.old_value || "(empty)"}</span>
                                          {" → "}
                                          <span className="text-text-primary font-medium">{entry.new_value || "(empty)"}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      {onRowAction && (
                        <td className="px-2 py-2">
                          <button
                            onClick={() => onRowAction(rowId)}
                            className="text-[11px] text-accent font-medium hover:underline opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
                          >
                            {rowActionLabel || "Details"}
                          </button>
                        </td>
                      )}
                    </tr>
                    {renderExpandedRow && isExpanded && (
                      <tr className="border-b border-gray-100 bg-gray-50/40">
                        <td colSpan={activeColumns.length + 2 + (onRowAction ? 1 : 0)}>
                          {renderExpandedRow(row)}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row count */}
      <p className="text-xs text-text-tertiary mt-2">
        {filteredData.length} {filteredData.length === 1 ? "row" : "rows"}
        {search && ` matching "${search}"`}
        {activeFilterCount > 0 && ` · ${activeFilterCount} filter${activeFilterCount > 1 ? "s" : ""} active`}
      </p>
    </div>
  );
}
