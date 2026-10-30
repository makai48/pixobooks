import { Plus, X } from "lucide-react";
import { Section, SField } from "../fields";
import { useSettings } from "../settingsContext";

export default function CategoriesSection() {
  const { form, setForm, notify, canCategories, newCategory, setNewCategory, addCategory } = useSettings();

  return (
    <>
          {canCategories && (
            <Section
              id="categories"
              title="3. POS Catalog Categories"
              desc="Dynamic category tags used in Point of Sale and quick inventory filtering"
            >
              <SField label="Active Categories">
                <div className="chip-cloud" style={{ marginTop: 0 }}>
                  {form.categories.map((c) => (
                    <span key={c} className="item-chip">
                      {c}
                      <button
                        type="button"
                        className="chip-remove-btn"
                        onClick={() => {
                          setForm({ ...form, categories: form.categories.filter((x) => x !== c) });
                          notify("Category removed");
                        }}
                        aria-label={`Remove ${c}`}
                      >
                        <X className="icon" />
                      </button>
                    </span>
                  ))}
                  {form.categories.length === 0 && (
                    <span className="field-hint" style={{ marginTop: 0 }}>
                      No categories yet — add the first below.
                    </span>
                  )}
                </div>
              </SField>
              <div className="add-row">
                <input
                  className="input"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCategory();
                    }
                  }}
                  placeholder="Enter new category name..."
                />
                <button type="button" className="btn btn-outline" onClick={addCategory}>
                  <Plus className="icon" />
                  Add Category
                </button>
              </div>
            </Section>
          )}
    </>
  );
}
