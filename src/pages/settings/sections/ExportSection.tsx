import ImportDataModal, {
  type ImportBackupActor,
} from "@/components/features/settings/ImportDataModal";
import WipeDataPanel from "@/components/features/settings/WipeDataPanel";
import { Section } from "../fields";
import { useSettings } from "../settingsContext";

export default function ExportSection() {
  const { profile, canExport, canWipe } = useSettings();
  const actor = profile
    ? ({ id: profile.id, name: profile.name, role: profile.role } as ImportBackupActor)
    : undefined;

  return (
    <>
      {(canExport || canWipe) && (
        <Section
          id="export"
          title="10. Import &amp; Backup"
          desc="Bring data in from a JSON export, send any dataset out, or erase app data permanently"
        >
          {canExport && <ImportDataModal variant="inline" actor={actor} />}
          {canWipe && <WipeDataPanel actor={actor} />}
        </Section>
      )}
    </>
  );
}
