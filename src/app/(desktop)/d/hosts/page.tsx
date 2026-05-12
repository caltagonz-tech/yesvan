"use client";

import { useState } from "react";
import DataSheet from "@/components/desktop/DataSheet";
import HostPaymentDetail from "@/components/desktop/HostPaymentDetail";
import type { ColumnDef } from "@/lib/supabase/types";

const columns: ColumnDef[] = [
  { key: "display_id", label: "ID", type: "text", editable: false, width: "90px" },
  { key: "family_name", label: "Family Name", type: "text", width: "150px" },
  { key: "primary_contact_name", label: "Contact", type: "text", width: "140px" },
  { key: "city", label: "City", type: "text" },
  { key: "region", label: "Region", type: "text" },
  { key: "capacity", label: "Capacity", type: "number", width: "90px" },
  { key: "number_of_rooms", label: "Rooms", type: "number", width: "80px" },
  { key: "family_rate", label: "Monthly Rate", type: "currency", width: "120px" },
  { key: "payment_day", label: "Payment Day", type: "number", width: "110px" },
  { key: "invoice_status", label: "Invoice Status", type: "text" },
  { key: "status", label: "Status", type: "text", width: "100px" },
  { key: "phone", label: "Phone", type: "text", visible: false },
  { key: "email", label: "Email", type: "text", visible: false },
  { key: "address", label: "Address", type: "text", visible: false },
  { key: "preferences", label: "Preferences", type: "text", visible: false },
  { key: "notes", label: "Notes", type: "text", width: "200px", visible: false },
];

export default function HostsPage() {
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);

  return (
    <>
      <DataSheet
        tableName="host_families"
        columns={columns}
        title="Host Families"
        onRowAction={(rowId) => setSelectedHostId(rowId)}
        rowActionLabel="Payments"
      />
      {selectedHostId && (
        <HostPaymentDetail hostId={selectedHostId} onClose={() => setSelectedHostId(null)} />
      )}
    </>
  );
}
