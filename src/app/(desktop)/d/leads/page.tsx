import DataSheet from "@/components/desktop/DataSheet";
import type { ColumnDef } from "@/lib/supabase/types";

const columns: ColumnDef[] = [
  { key: "display_id", label: "ID", type: "text", editable: false, width: "100px" },
  { key: "first_name", label: "First Name", type: "text", width: "130px" },
  { key: "last_name", label: "Last Name", type: "text", width: "130px" },
  { key: "contact_source", label: "Source", type: "text" },
  { key: "contact_date", label: "Contact Date", type: "date", width: "120px" },
  { key: "interested_in", label: "Interested In", type: "text" },
  { key: "program_type", label: "Program Type", type: "text" },
  { key: "travel_date", label: "Travel Date", type: "date", width: "120px" },
  { key: "age", label: "Age", type: "number", width: "70px" },
  { key: "education_level", label: "Education", type: "text" },
  { key: "english_level", label: "English Level", type: "text" },
  { key: "budget", label: "Budget", type: "currency", width: "110px" },
  { key: "country", label: "Country", type: "text" },
  { key: "contact_method", label: "Contact Method", type: "text" },
  { key: "pipeline_stage", label: "Pipeline Stage", type: "text" },
  { key: "status", label: "Status", type: "text", width: "100px" },
  { key: "last_contact_date", label: "Last Contact", type: "date", width: "120px" },
  { key: "reminder", label: "Reminder", type: "text", visible: false },
  { key: "reminder_date", label: "Reminder Date", type: "date", visible: false },
  { key: "email", label: "Email", type: "text", visible: false },
  { key: "phone", label: "Phone", type: "text", visible: false },
  { key: "notes", label: "Notes", type: "text", width: "200px", visible: false },
];

export default function LeadsPage() {
  return <DataSheet tableName="potential_students" columns={columns} title="Potential Students" />;
}
