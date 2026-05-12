export type ColumnDef = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "boolean" | "select" | "currency";
  editable?: boolean;
  options?: string[];
  visible?: boolean;
  width?: string;
};

export type CellHistoryEntry = {
  id: number;
  column_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  changed_at: string;
  change_source: string;
  user_name?: string;
};
