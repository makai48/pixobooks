import BillingSection from "@/components/billing/BillingSection";
import { Section } from "../fields";
import { useSettings } from "../settingsContext";

export default function BillingPlanSection() {
  const { canShop } = useSettings();

  return (
    <>
          {canShop && (
            <Section
              id="billing"
              title="9. Billing & Plan"
              desc="Plan limits, subscription status, and cloud backup"
            >
              <BillingSection />
            </Section>
          )}
    </>
  );
}
