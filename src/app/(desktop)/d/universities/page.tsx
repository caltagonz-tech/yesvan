import DataSheet from "@/components/desktop/DataSheet";
import type { ColumnDef } from "@/lib/supabase/types";

const columns: ColumnDef[] = [
  { key: "display_id", label: "ID", type: "text", editable: false, width: "80px" },
  { key: "name", label: "Name", type: "text", width: "200px" },
  { key: "city", label: "City", type: "text" },
  { key: "province", label: "Province", type: "text" },
  { key: "payment_terms", label: "Payment Terms", type: "text" },
  { key: "commission_scheme", label: "Commission Scheme", type: "text" },
  { key: "commission_type", label: "Commission Type", type: "text" },
  { key: "institution_requirements", label: "Requirements", type: "text", width: "200px" },
  { key: "contact_name", label: "Contact", type: "text", visible: false },
  { key: "contact_email", label: "Contact Email", type: "text", visible: false },
  { key: "contact_phone", label: "Contact Phone", type: "text", visible: false },
  { key: "institution_platform_url", label: "Platform URL", type: "text", visible: false },
  { key: "notes", label: "Notes", type: "text", width: "200px", visible: false },
];

export default function UniversitiesPage() {
  return <DataSheet tableName="universities" columns={columns} title="Universities" />;
}
