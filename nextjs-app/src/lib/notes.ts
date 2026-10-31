export interface Note {
  id: string;
  space_id: string;
  project_id: string | null;
  title: string;
  content: string;
  background: string;
  color: string;
  created_at: string;
  updated_at: string;
}
