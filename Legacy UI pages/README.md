# PixoBooks — Legacy UI page snapshots

Standalone HTML captures of every routed page in the legacy PixoBooks PWA
(desktop layout, 1600 × 1000 viewport). Login and Register are intentionally
excluded.

| File | App route |
| --- | --- |
| `Dashboard.html` | `/` (POS / Sales Counter) |
| `HeldTickets.html` | `/held` |
| `Quotes.html` | `/quotes` |
| `Inventory.html` | `/inventory` |
| `StockTaking.html` | `/stock-taking` |
| `PurchaseOrders.html` | `/purchase-orders` |
| `Suppliers.html` | `/suppliers` |
| `Customers.html` | `/customers` |
| `ClientBilling.html` | `/client-billing` |
| `SalesReport.html` | `/sales-report` |
| `Expenses.html` | `/expenses` |
| `FinancialStatements.html` | `/financial-statements` |
| `Statistics.html` | `/statistics` |
| `Employees.html` | `/employees` |
| `PayrollHistory.html` | `/payroll-history` |
| `AuditLog.html` | `/audit-log` |
| `PasswordResets.html` | `/password-resets` |
| `AccountApprovals.html` | `/account-approvals` |
| `Settings.html` | `/settings` |
| `ChangePassword.html` | `/change-password` |
| `PendingApproval.html` | `/pending-approval` |
| `NotFound.html` | unmatched route (404) |

## Notes

- Every page is self-contained: the current app CSS is inlined, and the
  Google fonts are bundled locally in `fonts/` + `fonts.css`.
- Navigation is preserved. Sidebar links, tab strips, card actions and
  "Resume in POS" / "Cash sale" buttons open the matching HTML file.
- Page content is populated with realistic sample data so the layouts can be
  evaluated and redesigned. No live backend is required.
- Static snapshots show the default tab/state of each page; modal dialogs and
  non-default tabs are not separately exported.
