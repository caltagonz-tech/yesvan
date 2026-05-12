import DataSheet from "@/components/desktop/DataSheet";
import type { ColumnDef } from "@/lib/supabase/types";

const columns: ColumnDef[] = [
  { key: "display_id", label: "ID", type: "text", editable: false, width: "90px" },
  { key: "first_name", label: "First Name", type: "text", width: "130px" },
  { key: "last_name", label: "Last Name", type: "text", width: "130px" },
  { key: "country_of_origin", label: "Country", type: "text" },
  { key: "program", label: "Program", type: "text" },
  { key: "intake", label: "Intake", type: "text", width: "100px" },
  { key: "stage", label: "Stage", type: "text" },
  { key: "next_step", label: "Next Step", type: "text", width: "180px" },
  { key: "next_step_date", label: "Next Step Date", type: "date", width: "130px" },
  { key: "completion_date", label: "Completion", type: "date", width: "120px" },
  { key: "referred_by", label: "Referred By", type: "text", visible: false },
  { key: "admin_fee", label: "Admin Fee", type: "currency", width: "110px" },
  { key: "tuition_gross", label: "Tuition Gross", type: "currency", width: "120px" },
  { key: "paid_by_student", label: "Paid by Student", type: "currency", width: "130px" },
  { key: "tuition_net", label: "Tuition Net", type: "currency", width: "110px", visible: false },
  { key: "commission", label: "Commission", type: "currency", width: "110px" },
  { key: "commission_received", label: "Comm. Received", type: "currency", width: "130px", visible: false },
  { key: "commission_pending", label: "Comm. Pending", type: "currency", width: "130px", visible: false },
  { key: "date_commission_received", label: "Comm. Date", type: "date", width: "120px", visible: false },
  { key: "projected_quarter", label: "Quarter", type: "text", width: "100px" },
  { key: "financial_statement", label: "Financial Statement", type: "text", visible: false },
  { key: "english_level", label: "English Level", type: "text", visible: false },
  { key: "education_level", label: "Education", type: "text", visible: false },
  { key: "area_of_study", label: "Area of Study", type: "text", visible: false },
  { key: "preferred_city", label: "Preferred City", type: "text", visible: false },
  { key: "is_minor", label: "Minor", type: "boolean", width: "80px" },
  { key: "notes", label: "Notes", type: "text", width: "200px", visible: false },
];

export default function StudentsPage() {
  return <DataSheet tableName="students" columns={columns} title="Students" />;
}
