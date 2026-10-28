import ImportDataModal, {
  type ImportBackupActor,
} from "@/components/features/settings/ImportDataModal";
import { Section } from "../fields";
import { useSettings } from "../settingsContext";

export default function ExportSection() {
  const { profile, canExport } = useSettings();

  return (
    <>
          {canExport && (
            <Section
              id="export"
              title="10. Import &amp; Backup"
              desc="Bring data in from a JSON export, or send any dataset out as structured JSON"
            >
              <ImportDataModal
                variant="inline"
                actor={
                  profile ? ({ id: profile.id, name: profile.name, role: profile.role } as ImportBackupActor) : undefined
                }
              />
            </Section>
          )}
    </>
  );
}
