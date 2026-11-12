import { useState } from "react";
import { FolderCog, Plus, X } from "lucide-react";
import { categoryHint } from "@/lib/businessClues";
import { EXPENSE_CATEGORIES } from "@/types";
import ExpenseCategoryManagerModal from "@/components/features/expenses/ExpenseCategoryManagerModal";
import { Section, SField } from "../fields";
import { useSettings } from "../settingsContext";

export default function CategoriesSection() {
  const { form, setForm, notify, canCategories, newCategory, setNewCategory, addCategory, savedExpenseCategories } = useSettings();
  const [expenseManagerOpen, setExpenseManagerOpen] = useState(false);

  // The expense categories live on `shop_settings.expense_categories` and are
  // owned by the category manager (the Settings save never writes them), so
  // the pool shown here is the saved one.
  const expenseCategories =
    savedExpenseCategories.length > 0 ? savedExpenseCategories : EXPENSE_CATEGORIES;

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
                  placeholder={categoryHint(form.businessType)}
                />
                <button type="button" className="btn btn-outline" onClick={addCategory}>
                  <Plus className="icon" />
                  Add Category
                </button>
              </div>

              <div className="expense-categories">
                <div className="expense-categories-head">
                  <div>
                    <div className="expense-categories-title">Expense categories</div>
                    <div className="field-hint" style={{ marginTop: 0 }}>
                      The categories an expense can be filed under. Renaming one
                      updates every existing expense that uses it; deleting one
                      moves those expenses to &quot;General&quot;.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setExpenseManagerOpen(true)}
                  >
                    <FolderCog className="icon" />
                    Manage
                  </button>
                </div>
                <div className="chip-cloud" style={{ marginTop: 0 }}>
                  {expenseCategories.map((c) => (
                    <span key={c} className="item-chip">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </Section>
          )}
          {expenseManagerOpen && (
            <ExpenseCategoryManagerModal
              categories={expenseCategories}
              onClose={() => setExpenseManagerOpen(false)}
            />
          )}
    </>
  );
}
