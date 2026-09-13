import type { Application } from "../../domain/types";
import { TextArea } from "../../ui/fields";

export function NotesTab({ app, patch }: { app: Application; patch: (p: Partial<Application>) => Promise<boolean> }) {
  return (
    <TextArea label="Notes" rows={18} value={app.notes} onCommit={(v) => patch({ notes: v })}
      placeholder="Anything about this application: people, impressions, questions to ask, offer details." />
  );
}
