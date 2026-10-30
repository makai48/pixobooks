import BranchManager from "../BranchManager";
import { Section } from "../fields";
import { useSettings } from "../settingsContext";

export default function BranchesSection() {
  const { notify, canShop } = useSettings();

  return (
    <>
          {canShop && (
            <Section
              id="branches"
              title="7. Branches & Store Locations"
              desc="Operating store branches assigned to POS tills, inventory, and staff members"
            >
              <BranchManager onNotice={notify} />
            </Section>
          )}
    </>
  );
}
