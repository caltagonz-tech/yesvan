"use client";

import DataSheet from "@/components/desktop/DataSheet";
import { DriverExpansion } from "@/components/desktop/RelatedDataExpansion";
import type { ColumnDef } from "@/lib/supabase/types";

const columns: ColumnDef[] = [
  { key: "display_id", label: "ID", type: "text", editable: false, width: "80px" },
  { key: "first_name", label: "First Name", type: "text", width: "130px" },
  { key: "last_name", label: "Last Name", type: "text", width: "130px" },
  { key: "phone", label: "Phone", type: "text" },
  { key: "email", label: "Email", type: "text" },
  { key: "vehicle_info", label: "Vehicle", type: "text", width: "160px" },
  { key: "vehicle_capacity", label: "Capacity", type: "number", width: "90px" },
  { key: "region", label: "Region", type: "text" },
  { key: "status", label: "Status", type: "text", width: "100px" },
  { key: "notes", label: "Notes", type: "text", width: "200px", visible: false },
];

export default function DriversPage() {
  return (
    <DataSheet
      tableName="drivers"
      columns={columns}
      title="Drivers"
      renderExpandedRow={(row) => <DriverExpansion row={row} />}
    />
  );
}
