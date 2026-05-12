"use client";

import DataSheet from "@/components/desktop/DataSheet";
import PaymentsSummary from "@/components/desktop/PaymentsSummary";
import type { ColumnDef } from "@/lib/supabase/types";

const columns: ColumnDef[] = [
  { key: "display_id", label: "ID", type: "text", editable: false, width: "100px" },
  { key: "direction", label: "Direction", type: "text", width: "100px" },
  { key: "counterparty_type", label: "Type", type: "text", width: "100px" },
  { key: "category", label: "Category", type: "text" },
  { key: "amount", label: "Amount", type: "currency", width: "120px" },
  { key: "currency", label: "Currency", type: "text", width: "80px" },
  { key: "due_date", label: "Due Date", type: "date", width: "120px" },
  { key: "paid_date", label: "Paid Date", type: "date", width: "120px" },
  { key: "status", label: "Status", type: "text", width: "100px" },
  { key: "description", label: "Description", type: "text", width: "200px" },
  { key: "notes", label: "Notes", type: "text", width: "200px", visible: false },
];

export default function PaymentsPage() {
  return (
    <>
      <PaymentsSummary />
      <DataSheet tableName="payments" columns={columns} title="Payments" hasArchived={false} />
    </>
  );
}
