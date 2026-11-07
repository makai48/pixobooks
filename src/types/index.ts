export type Unit = {
  code: string;
  label: string;
  ratio: number;
};

export type BOMLine = {
  materialId: string;
  qty: number;
  unit?: string;
  vendorId?: string | null;
  vendorName?: string | null;
};

export type Supplier = {
  id: string;
  name: string;
  contact?: string;
  email?: string;
  phone?: string;
  unitCost?: number;
  leadDays?: number;
  preferred?: boolean;
};

export type ItemType = "material" | "product" | "ready" | "intermediate";

/**
 * Odoo-style product category (independent of the stock-behavior itemType).
 * - goods: stocked, costed, purchasable and sellable per channel flags.
 * - service: never stocked, never costed (cost forced to 0).
 * - kit: sellable bundle; components decrement via its BOM like a product.
 */
export type ProductCategory = "goods" | "service" | "kit";

export const ITEM_TYPE_META: Record<
  ItemType,
  { label: string; short: string; color: string; sellable: boolean; usable: boolean }
> = {
  material: {
    label: "Raw Material",
    short: "Material",
    color: "text-yellow-reg bg-yellow-reg/10 border border-yellow-reg/30",
    sellable: false,
    usable: true,
  },
  product: {
    label: "Product (Made from BOM)",
    short: "Product",
    color: "text-magenta-reg bg-magenta-reg/10 border border-magenta-reg/30",
    sellable: true,
    usable: false,
  },
  ready: {
    label: "Ready Item (Resold)",
    short: "Ready",
    color: "text-cyan-reg bg-cyan-reg/10 border border-cyan-reg/30",
    sellable: true,
    usable: false,
  },
  intermediate: {
    label: "Intermediate (Both raw & ready)",
    short: "Intermediate",
    color: "text-ink bg-ink/10 border border-ink/20",
    sellable: true,
    usable: true,
  },
};

export type Item = {
  id: string;
  sku: string;
  barcode?: string | null;
  name: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  baseUnit: string;
  units: Unit[];
  bom?: BOMLine[] | null;
  isMaterial: boolean;
  itemType: ItemType;
  imageUrl?: string | null;
  suppliers?: Supplier[];
  emoji?: string | null;
  lowStockThreshold?: number | null;
  /** Whether the POS Qty input accepts decimal values for this item.
   *  false → integer-only stepper; true → decimal input allowed. */
  allowDecimalQty?: boolean;
  /** The unit this item is purchased in (from suppliers / POs). */
  purchaseUnit?: string | null;
  /** The unit this item is sold in at the POS. Must be either equal
   *  to purchaseUnit or reachable via unit_conversions from it. */
  saleUnit?: string | null;
  /** Preferred supplier (mandatory when creating items). */
  preferredSupplierId?: string | null;
  preferredSupplierName?: string | null;
  /** Authoritative UOM references (migration 20251006000003). Text unit
   *  fields remain the display/legacy mirror until backfilled. */
  purchaseUomId?: string | null;
  saleUomId?: string | null;
  baseUomId?: string | null;
  /** Presentation units for money (migration 20251006000006): the UOM
   *  that price / cost are quoted in. Canonical math converts price into
   *  per-saleUOM and cost into per-base on save, so these never change
   *  the meaning of stored money — they document the entry unit. */
  priceUom?: string | null;
  costUom?: string | null;
  /** Odoo-style classification + channel visibility. Undefined on legacy
   *  rows means goods / all channels visible (permissive default). */
  productCategory?: ProductCategory | null;
  canPurchase?: boolean | null;
  canSell?: boolean | null;
  posVisible?: boolean | null;
  createdAt: string;
  updatedAt: string;
};

/** A stock movement record used by the Stock Taking module. */
export type StockAdjustment = {
  id: string;
  itemId: string;
  itemName: string;
  adjustmentType: "manual" | "stocktake" | "correction" | "receipt" | "issue";
  qtyChange: number;
  oldStock: number;
  newStock: number;
  reason?: string | null;
  adjustmentDate: string;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: string;
};

/** Persistent daily-balancing snapshot providing the b/f → c/d audit trail.
 *
 *  Every field below except `physicalCashCount` and `variance` is derived
 *  from the transaction ledger at save time. `openingBalance` is the
 *  live-computed b/f at start-of-day (anchor for the next day's chain).
 *  `closingBalance` is the Calculated c/d (leftover till cash). Physical
 *  Cash Count and Variance are kept SEPARATE from the calculated figures
 *  for audit purposes — a non-zero variance flags a till discrepancy
 *  without corrupting the accounting chain. */
export type DailyBalancing = {
  balanceDate: string;
  openingBalance: number;
  cashSales: number;
  cashExpenses: number;
  drawings: number;
  netCashFlow: number;
  depositAmount: number;
  closingBalance: number;
  physicalCashCount?: number | null;
  variance?: number | null;
  bankDepositId?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  avatarUrl?: string | null;
  totalSpent: number;
  loyaltyPoints: number;
  createdAt: string;
};

export type Permission =
  // Sales
  | "pos.sell"
  | "pos.discount"
  | "pos.hold"
  | "pos.refund"
  | "pos.credit"
  // Inventory
  | "inventory.view"
  | "inventory.edit"
  | "inventory.delete"
  | "inventory.adjust"
  | "inventory.import"
  // Purchase Orders
  | "po.view"
  | "po.manage"
  | "po.receive"
  | "po.delete"
  // Suppliers
  | "suppliers.view"
  | "suppliers.manage"
  | "suppliers.delete"
  // Customers
  | "customers.view"
  | "customers.manage"
  | "customers.delete"
  | "loyalty.manage"
  // Quotes
  | "quotes.view"
  | "quotes.manage"
  | "quotes.delete"
  // Expenses
  | "expenses.view"
  | "expenses.manage"
  | "expenses.delete"
  // Reports
  | "stats.view"
  | "sales.view"
  | "sales.void"
  | "reports.viewCosts"
  | "reports.export"
  | "finance.view"
  | "finance.manage"
  | "finance.cashbook.view"
  | "finance.bank.view"
  | "finance.bank.manage"
  | "finance.bank.delete"
  | "finance.pnl.view"
  | "finance.orders.view"
  | "finance.orders.manage"
  | "finance.orders.delete"
  // Admin
  | "employees.manage"
  | "employees.delete"
  | "employees.payroll"
  | "employees.attendance"
  | "users.invite"
  | "users.permissions"
  | "users.delete"
  | "payroll.view"
  | "payroll.run"
  | "attendance.view"
  | "settings.manage"
  | "settings.shop"
  | "settings.receipt"
  | "settings.invoice"
  | "settings.printer"
  | "settings.loyalty"
  | "settings.units"
  | "settings.taxes"
  | "settings.theme"
  | "settings.discount"
  | "settings.categories"
  | "settings.export"
  | "settings.wipe"
  | "audit.view"
  | "password.approve";

export const ALL_PERMISSIONS: { key: Permission; label: string; group: string }[] = [
  // Sales
  { key: "pos.sell", label: "Ring up sales", group: "Sales" },
  { key: "pos.discount", label: "Apply discounts", group: "Sales" },
  { key: "pos.hold", label: "Hold & resume tickets", group: "Sales" },
  { key: "pos.refund", label: "Process refunds", group: "Sales" },
  { key: "pos.credit", label: "Accept credit / partial payments", group: "Sales" },
  // Inventory
  { key: "inventory.view", label: "View inventory", group: "Inventory" },
  { key: "inventory.edit", label: "Add & edit items", group: "Inventory" },
  { key: "inventory.delete", label: "Delete items", group: "Inventory" },
  { key: "inventory.adjust", label: "Adjust stock levels", group: "Inventory" },
  { key: "inventory.import", label: "Import catalog data", group: "Inventory" },
  // Purchase Orders
  { key: "po.view", label: "View purchase orders", group: "Purchase Orders" },
  { key: "po.manage", label: "Create & edit POs", group: "Purchase Orders" },
  { key: "po.receive", label: "Receive stock", group: "Purchase Orders" },
  { key: "po.delete", label: "Delete POs", group: "Purchase Orders" },
  // Suppliers
  { key: "suppliers.view", label: "View suppliers", group: "Suppliers" },
  { key: "suppliers.manage", label: "Add & edit suppliers", group: "Suppliers" },
  { key: "suppliers.delete", label: "Delete suppliers", group: "Suppliers" },
  // Customers
  { key: "customers.view", label: "View customer register", group: "Customers" },
  { key: "customers.manage", label: "Manage customers", group: "Customers" },
  { key: "customers.delete", label: "Delete customers", group: "Customers" },
  { key: "loyalty.manage", label: "Manage loyalty points", group: "Customers" },
  // Quotes
  { key: "quotes.view", label: "View quotes", group: "Documents" },
  { key: "quotes.manage", label: "Create & convert quotes", group: "Documents" },
  { key: "quotes.delete", label: "Delete quotes", group: "Documents" },
  // Expenses
  { key: "expenses.view", label: "View expenses", group: "Finance" },
  { key: "expenses.manage", label: "Record & edit expenses", group: "Finance" },
  { key: "expenses.delete", label: "Delete expenses", group: "Finance" },
  { key: "finance.view", label: "View cashbook & bank statement", group: "Finance" },
  { key: "finance.manage", label: "Daily banking, standing orders, loans", group: "Finance" },
  // Granular finance permissions. Each tab of Financial Statements has its
  // own read key, and the editable tabs split create/update from delete so a
  // bookkeeper can post entries without being able to erase them. The legacy
  // `finance.view` / `finance.manage` keys above still act as umbrellas so
  // existing employees keep exactly the access they had.
  { key: "finance.cashbook.view", label: "View cashbook", group: "Finance" },
  { key: "finance.bank.view", label: "View bank statement", group: "Finance" },
  { key: "finance.bank.manage", label: "Record & edit bank entries", group: "Finance" },
  { key: "finance.bank.delete", label: "Delete bank entries", group: "Finance" },
  { key: "finance.pnl.view", label: "View profit & loss", group: "Finance" },
  { key: "finance.orders.view", label: "View standing orders & loans", group: "Finance" },
  { key: "finance.orders.manage", label: "Create & edit standing orders & loans", group: "Finance" },
  { key: "finance.orders.delete", label: "Delete standing orders & loans", group: "Finance" },
  // Reports
  { key: "sales.view", label: "View sales reports", group: "Reports" },
  { key: "sales.void", label: "Void sales", group: "Reports" },
  { key: "stats.view", label: "View financial statistics", group: "Reports" },
  { key: "reports.viewCosts", label: "View COGS / cost & profit columns", group: "Reports" },
  { key: "reports.export", label: "Export reports & data", group: "Reports" },
  // Admin
  { key: "employees.manage", label: "Manage employees", group: "Admin" },
  { key: "employees.delete", label: "Delete employee accounts", group: "Admin" },
  { key: "employees.payroll", label: "Manage salaries & allowances", group: "Admin" },
  { key: "employees.attendance", label: "Record attendance", group: "Admin" },
  { key: "users.invite", label: "Invite employees", group: "Admin" },
  { key: "users.permissions", label: "Change user permissions", group: "Admin" },
  { key: "users.delete", label: "Permanently delete users", group: "Admin" },
  { key: "payroll.view", label: "View payroll & salaries", group: "Admin" },
  { key: "payroll.run", label: "Edit salaries & run payroll", group: "Admin" },
  { key: "attendance.view", label: "View attendance", group: "Admin" },
  { key: "settings.manage", label: "Access all settings", group: "Admin" },
  { key: "audit.view", label: "View audit log", group: "Admin" },
  { key: "password.approve", label: "Approve password resets", group: "Admin" },
  // Detailed settings
  { key: "settings.shop", label: "Edit shop identity", group: "Settings" },
  { key: "settings.receipt", label: "Edit receipt template", group: "Settings" },
  { key: "settings.invoice", label: "Edit invoice template", group: "Settings" },
  { key: "settings.printer", label: "Configure printer", group: "Settings" },
  { key: "settings.loyalty", label: "Edit loyalty rules", group: "Settings" },
  { key: "settings.units", label: "Edit unit conversions", group: "Settings" },
  { key: "settings.taxes", label: "Edit tax rates", group: "Settings" },
  { key: "settings.theme", label: "Change theme & branding", group: "Settings" },
  { key: "settings.discount", label: "Configure discount rules", group: "Settings" },
  { key: "settings.categories", label: "Manage POS categories", group: "Settings" },
  { key: "settings.export", label: "Export shop data", group: "Settings" },
  { key: "settings.wipe", label: "Wipe app data", group: "Settings" },
];

export const ALL_PERMISSION_KEYS: Permission[] = ALL_PERMISSIONS.map((p) => p.key);

export const DEFAULT_STAFF_PERMISSIONS: Permission[] = [
  "pos.sell",
  "pos.hold",
  "inventory.view",
  "customers.manage",
  "quotes.view",
  "suppliers.view",
];

export type AllowancePayCycle = "daily" | "weekly" | "biweekly" | "monthly" | "annually";

export type Allowance = {
  name: string;
  amount: number;
  type: "fixed" | "percentage";
  payCycle?: AllowancePayCycle;
};

export type EmployeeSalary = {
  base: number;
  currency: string;
  payCycle: "monthly" | "weekly" | "biweekly";
  allowances: Allowance[];
};

export type ApprovalStatus =
  | "pending_first_login"
  | "pending_approval"
  | "approved"
  | "rejected";

export type Employee = {
  id: string;
  name: string;
  email?: string;
  pin: string;
  role: string;
  permissions: Permission[];
  active: boolean;
  branchId?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
  address?: string | null;
  hireDate?: string | null;
  emergencyContact?: string | null;
  /** Separate emergency contact phone number (new schema column). */
  emergencyContactPhone?: string | null;
  notes?: string | null;
  salary?: EmployeeSalary;
  createdAt: string;
  failedLoginCount?: number;
  lockedUntil?: string | null;
  approvalStatus?: ApprovalStatus;
  approvalRequestedAt?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
  mustChangePassword?: boolean;
  tempPasswordExpiresAt?: string | null;
  invitedBy?: string | null;
  invitedByName?: string | null;
  invitedAt?: string | null;
};

export type AccountApprovalRequest = {
  id: string;
  userId: string;
  employeeName: string;
  email: string;
  role?: string | null;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  approvedAt?: string | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
  notes?: string | null;
};

/** Default temp-password validity when the admin invites a new user. */
export const DEFAULT_TEMP_PASSWORD_HOURS = 72;
export const TEMP_PASSWORD_HOUR_PRESETS = [24, 48, 72, 168, 336, 720];

export type AttendanceStatus =
  | "present"
  | "absent"
  | "halfday"
  | "leave"
  | "holiday";

export const ATTENDANCE_META: Record<
  AttendanceStatus,
  { label: string; color: string; symbol: string; hours: number }
> = {
  present: { label: "Present", color: "bg-success/20 text-success border-success/40", symbol: "P", hours: 8 },
  halfday: { label: "Half-day", color: "bg-yellow-reg/20 text-yellow-reg border-yellow-reg/40", symbol: "H", hours: 4 },
  leave: { label: "Leave", color: "bg-cyan-reg/20 text-cyan-reg border-cyan-reg/40", symbol: "L", hours: 0 },
  holiday: { label: "Holiday", color: "bg-magenta-reg/10 text-magenta-reg border-magenta-reg/30", symbol: "★", hours: 0 },
  absent: { label: "Absent", color: "bg-danger/20 text-danger border-danger/40", symbol: "A", hours: 0 },
};

export type AttendanceRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  status: AttendanceStatus;
  hours: number;
  clockIn?: string | null;
  clockOut?: string | null;
  notes?: string | null;
  createdAt: string;
};

export type SaleLine = {
  itemId: string;
  name: string;
  qty: number;
  unit?: string;
  unitPrice: number;
  discountPct: number;
  /** UOM snapshot (§21): saleUOM→base factor at transaction time, so the
   *  row keeps its meaning even if conversions are edited later. */
  unitFactor?: number | null;
};

export type PaymentMethod = "cash" | "card" | "transfer" | "credit" | "partial";

export const PAYMENT_METHOD_META: Record<
  PaymentMethod,
  { label: string; short: string; doc: "receipt" | "invoice" | "both"; needsCustomer: boolean }
> = {
  cash: { label: "Cash", short: "Cash", doc: "receipt", needsCustomer: false },
  card: { label: "Card", short: "Card", doc: "receipt", needsCustomer: false },
  transfer: { label: "Bank transfer", short: "Wire", doc: "receipt", needsCustomer: false },
  credit: { label: "Credit (invoice)", short: "Credit", doc: "invoice", needsCustomer: true },
  partial: { label: "Partial (cash + credit)", short: "Partial", doc: "both", needsCustomer: true },
};

export type PaymentStatus = "paid" | "partial" | "credit";

export type DocumentType = "receipt" | "invoice";

export type SalePayment = {
  id: string;
  saleId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  receivedBy?: string | null;
  receivedByName?: string | null;
  notes?: string | null;
  createdAt: string;
};

export type Sale = {
  id: string;
  number: string;
  createdAt: string;
  cashierId: string | null;
  cashierName: string;
  customerId?: string | null;
  customerName?: string | null;
  lines: SaleLine[];
  subtotal: number;
  lineDiscountTotal: number;
  orderDiscountPct: number;
  orderDiscountValue: number;
  tax: number;
  total: number;
  cost: number;
  profit: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  documentType: DocumentType;
  amountPaid: number;
  amountDue: number;
  dueDate?: string | null;
  loyaltyEarned: number;
  loyaltyRedeemed: number;
  /** Branch context this sale was rung under (null = all-branches / legacy). */
  branchId?: string | null;
  /** Set when the document was voided. The row is retained as the reversal
   *  counter-document: stock has been returned, revenue excluded, and the
   *  original number stays resolvable for audit. */
  voidedAt?: string | null;
  voidedBy?: string | null;
  voidedByName?: string | null;
  voidReason?: string | null;
};

/** A voided document is retained but must never count as revenue. */
export function isSaleVoided(sale: Pick<Sale, "voidedAt"> | null | undefined): boolean {
  return !!(sale && sale.voidedAt);
}

/** Append-only inventory movement (the stock ledger). */
export type StockMovementSourceType =
  | "sale"
  | "sale_void"
  | "po_receipt"
  | "po_return"
  | "adjustment"
  | "stocktake"
  | "opening";

export type StockMovement = {
  id: string;
  /** Null when the item was deleted; the movement keeps its history. */
  itemId: string | null;
  qtyBase: number;
  unitCost?: number | null;
  sourceType: StockMovementSourceType;
  sourceId?: string | null;
  sourceLine: number;
  occurredAt: string;
  actorId?: string | null;
  actorName?: string | null;
  reason?: string | null;
  reversalOf?: string | null;
  createdAt: string;
};

export type HeldTicket = {
  id: string;
  label: string;
  cashierId: string | null;
  cashierName: string;
  customerId?: string | null;
  customerName?: string | null;
  lines: SaleLine[];
  orderDiscountPct: number;
  createdAt: string;
  /** Branch context this ticket was held under (null = all-branches / legacy). */
  branchId?: string | null;
};

export type Expense = {
  id: string;
  category: string;
  description: string;
  amount: number;
  expenseDate: string;
  paymentMethod: PaymentMethod;
  vendor?: string | null;
  notes?: string | null;
  createdBy: string | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  /** Branch context this expense was recorded under (null = all-branches / legacy). */
  branchId?: string | null;
};

export type QuoteStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "rejected"
  | "proforma"
  | "ordered"
  | "converted";

export type Quote = {
  id: string;
  number: string;
  customerId?: string | null;
  customerName?: string | null;
  lines: SaleLine[];
  subtotal: number;
  tax: number;
  total: number;
  status: QuoteStatus;
  validUntil?: string | null;
  notes?: string | null;
  createdBy: string | null;
  createdByName: string;
  convertedSaleId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type POLine = {
  materialId: string;
  name: string;
  qty: number;
  unitCost: number;
  unit?: string;
  /** Actual quantity received (may differ from ordered qty). Filled in
   *  by the recipient before the PO is marked as received. When present,
   *  this value overrides `qty` when incrementing on-hand stock. */
  receivedQty?: number;
  /** Receiving unit the entered qty was typed in (central UOM system).
   *  Stock math converts it to the item's base unit; both the entered
   *  figure and the converted base figure persist for audit. */
  receivedUnit?: string;
  receivedEnteredQty?: number;
  /** Cumulative base-unit quantity received to date (across receipts). */
  receivedBaseQty?: number;
  /** Ordered quantity converted to base units, used to decide whether the
   *  PO is fully received. */
  orderedBaseQty?: number;
  /** Derived base-unit cost for this receipt (total ÷ converted qty, §10).
   *  The movement-level unit cost (§13); history keeps it verbatim. */
  derivedUnitCost?: number | null;
};

export type POStatus = "draft" | "ordered" | "received" | "cancelled";

export type PurchaseOrder = {
  id: string;
  number: string;
  vendor: string;
  lines: POLine[];
  subtotal: number;
  tax: number;
  total: number;
  status: POStatus;
  expectedDate?: string | null;
  notes?: string | null;
  createdBy: string | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  receivedAt?: string | null;
  /** Branch context this PO was raised for (null = all-branches / legacy). */
  branchId?: string | null;
};

export type LoyaltyTransaction = {
  id: string;
  customerId: string;
  saleId?: string | null;
  points: number;
  type: "earn" | "redeem" | "adjust";
  notes?: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type PrinterType = "bluetooth" | "network" | "usb" | "system";
/** Quick (thermal) sizes first, corporate sheet sizes after. */
export type PaperSize = "58mm" | "80mm" | "99x210mm" | "A4" | "A5" | "Letter";

export type ReceiptWidthMm = 58 | 80 | 99;

export type DocKind = "quick" | "corporate";

export type DiscountType = "percentage" | "amount";

export type DiscountConfig = {
  type: DiscountType;
  allowLine: boolean;
  allowOrder: boolean;
  maxPct: number;
  maxAmount: number;
};

export type ThemeMode = "light" | "dark";
export type ThemePreset = "default" | "logo" | "ocean" | "sunset" | "forest" | "custom";

export type ThemeConfig = {
  mode: ThemeMode;
  preset: ThemePreset;
  primary: string; // hex
  accent: string; // hex
  background?: string;
};

export type SupplierRecord = {
  id: string;
  name: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  location?: string | null;
  avatarUrl?: string | null;
  notes?: string | null;
  items: SupplierItem[];
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupplierItem = {
  itemId?: string | null;
  itemName: string;
  qty: number;
  unit: string;
  unitPrice: number;
  currency?: string;
  sku?: string;
  notes?: string;
};

export type Settings = {
  shopName: string;
  currency: string;
  taxRate: number;
  logoUrl?: string | null;
  address: string;
  phone: string;
  email: string;
  categories: string[];
  /** Custom expense-category list. When empty the fallback constant
   *  `EXPENSE_CATEGORIES` is used app-wide. Renaming/deleting an entry
   *  reassigns affected expenses to "General" so no orphan rows exist. */
  expenseCategories?: string[];
  /** Transaction-count allowance policy (Item 7) + pending approval queue.
   *  Stored as jsonb columns; absent on older deployments until the
   *  migration runs — the mapper falls back to defaults. */
  transactionAllowancePolicy?: TransactionAllowancePolicy;
  pendingTxnAllowances?: PendingTxnAllowance[];
  country: string;
  timezone: string;
  businessType: string;
  digitGrouping: "western" | "indian";
  decimalPlaces: number;
  thousandSeparator: string;
  decimalSeparator: string;
  mobile: string;
  officePhone: string;
  whatsapp: string;
  termsVersion: string;
  privacyVersion: string;
  receipt: {
    header: string;
    footer: string;
    showLogo: boolean;
    paperWidthMm: ReceiptWidthMm;
  };
  invoice: {
    prefix: string;
    nextNumber: number;
    terms: string;
  };
  printer: {
    deviceName: string;
    printerType: PrinterType;
    paperSize: PaperSize;
    ipAddress?: string;
    bluetoothMac?: string;
    autoPrint: boolean;
    openDrawer: boolean;
    bridgeUrl?: string;
    bridgeToken?: string;
    bluetoothService?: string;
    usbVendorId?: number | null;
    usbProductId?: number | null;
    serialBaudRate?: number;
    codepage?: "cp437" | "cp850" | "cp858" | "cp1252";
  };
  loyalty: {
    enabled: boolean;
    pointsPerDollar: number;
    dollarPerPoint: number;
  };
  discount: DiscountConfig;
  theme: ThemeConfig;
  /** SaaS billing (optional until migration backfills). Trial starts on first shop creation. */
  billing?: BillingInfo;
};

export type SubscriptionPlan = "starter" | "growth" | "pro";
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";

export type PlanLimits = {
  branches: number;
  users: number;
  items: number;
  clientBilling: boolean;
  payroll: boolean;
  api: boolean;
};

export type BillingInfo = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
};

export const EXPENSE_CATEGORIES: string[] = [
  "Materials",
  "Salary",
  "Staff Allowance",
  "Wages",
  "Drawings",
  "Rent",
  "Utilities",
  "Electricity",
  "Internet",
  "Water",
  "Equipment",
  "Maintenance",
  "Marketing",
  "Software",
  "Transport",
  "Fuel",
  "Insurance",
  "Bank Fees",
  "Standing Order",
  "Loan Payment",
  "Taxes",
  "Office Supplies",
  "General",
];

/** Categories that represent an owner-drawing (cash withdrawn from the
 *  till for personal use). Fed directly into the Daily Balancing form. */
export const DRAWINGS_CATEGORY = "Drawings";

/** Marker used in the `notes` column of auto-created staff-allowance
 *  expenses. Prevents duplicate creation when attendance is re-marked. */
export const AUTO_ALLOWANCE_MARKER = "AUTO_ALLOWANCE";

/** Marker prefix for transaction-count-based allowance awards. The full
 *  marker is `AUTO_ALLOWANCE_TXN:<employeeId>:<periodKey>:<allowanceName>`. */
export const TXN_ALLOWANCE_MARKER = "AUTO_ALLOWANCE_TXN";

export type TxnAllowancePeriod = "daily" | "weekly" | "monthly";

export type TransactionAllowancePolicy = {
  /** Master switch — when off nothing is evaluated or awarded. */
  enabled: boolean;
  /** Transactions within one period that auto-consider the allowance. */
  threshold: number;
  period: TxnAllowancePeriod;
  allowanceName: string;
  amount: number;
  amountType: "fixed" | "percentage";
  /** When true the award waits in a pending queue for approval instead of
   *  posting straight to the ledger. */
  requireApproval: boolean;
  /** Who may approve a pending award. */
  approverRole: "manager" | "accountant";
  /** `<employeeId>:<periodKey>` entries the admin has dismissed. */
  dismissed: string[];
};

export type PendingTxnAllowance = {
  /** `<employeeId>:<periodKey>` — doubles as the idempotency key. */
  key: string;
  employeeId: string;
  employeeName: string;
  period: TxnAllowancePeriod;
  periodKey: string;
  periodLabel: string;
  count: number;
  amount: number;
  allowanceName: string;
  createdAt: string;
};

export const DEFAULT_TXN_ALLOWANCE_POLICY: TransactionAllowancePolicy = {
  enabled: false,
  threshold: 20,
  period: "daily",
  allowanceName: "Transaction bonus",
  amount: 0,
  amountType: "fixed",
  requireApproval: true,
  approverRole: "manager",
  dismissed: [],
};

/** Expense categories that cannot be deleted because they have
 *  hard-coded business logic (drawings feed, salary auto-fill,
 *  attendance-based allowance creation, and reassignment target for
 *  deleted categories). Renaming is also blocked to keep the app's
 *  internal references intact. */
export const PROTECTED_EXPENSE_CATEGORIES: string[] = [
  "General",
  "Drawings",
  "Salary",
  "Staff Allowance",
];

export type UnitConversion = {
  id: string;
  fromUnit: string;
  toUnit: string;
  factor: number;
  category: string;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  /** FK references into the UOM master (populated after migration 20251006000003). */
  fromUomId?: string | null;
  toUomId?: string | null;
};

/**
 * UOM master record — the single source of truth for every unit.
 * `discrete: true` (Sheet, Piece, Box, Ream, Bottle, Item) means only
 * whole-number quantities may be transacted; `false` (Kg, g, L, ml,
 * Metres) permits fractions. Mathematical conversion may still produce
 * fractions for analysis — that never authorizes a fractional transaction.
 */
export type Uom = {
  id: string;
  /** Canonical lowercase code, e.g. "ream", "sheet", "kg". */
  code: string;
  name: string;
  symbol?: string | null;
  discrete: boolean;
  /** Inactive UOMs stay valid for history but are blocked for new transactions. */
  isActive: boolean;
  /** Family this unit belongs to (migration 20251006000004). Conversions
   *  are only valid within one family — kg → litre is never allowed. */
  categoryId?: string | null;
  /** Reference units per 1 unit (Sheet=1, Ream=500, Page=0.5). NULL when
   *  unreachable from the family reference — engine falls back to pairs. */
  ratio?: number | null;
  /** Smallest transactable increment (Sheet → 1, Kg → 0.001, Metre → 0.01).
   *  Discrete units always require whole numbers regardless. */
  rounding?: number | null;
  createdAt: string;
  updatedAt: string;
};

/** UOM family/category — units convert only within their family. */
export type UomCategory = {
  id: string;
  name: string;
  /** Mathematical anchor of the family (e.g. Sheet for Printing). */
  referenceUomId?: string | null;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export const UNIT_CATEGORIES = [
  "paper",
  "weight",
  "volume",
  "length",
  "area",
  "ink",
  "general",
];

export type CurrencyOption = { code: string; name: string; symbol: string };

export const CURRENCIES: CurrencyOption[] = [
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "UGX", name: "Ugandan Shilling", symbol: "USh" },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh" },
  { code: "TZS", name: "Tanzanian Shilling", symbol: "TSh" },
  { code: "RWF", name: "Rwandan Franc", symbol: "FRw" },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦" },
  { code: "GHS", name: "Ghanaian Cedi", symbol: "₵" },
  { code: "ZAR", name: "South African Rand", symbol: "R" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ" },
];

export const NO_DECIMAL_CURRENCIES = ["UGX", "TZS", "RWF", "JPY", "KRW", "IDR", "VND"];

export type POSViewMode = "tiles" | "list" | "thumbnails";

export const THEME_PRESETS: Record<
  Exclude<ThemePreset, "custom" | "logo">,
  { primary: string; accent: string; mode: ThemeMode; label: string }
> = {
  default: { primary: "#e0399a", accent: "#1b2a4e", mode: "light", label: "Cream & Ink" },
  ocean: { primary: "#0891b2", accent: "#0b3b52", mode: "light", label: "Ocean" },
  sunset: { primary: "#f97316", accent: "#7c2d12", mode: "light", label: "Sunset" },
  forest: { primary: "#059669", accent: "#064e3b", mode: "dark", label: "Forest Night" },
};

/**
 * Legacy supreme-admin email (kept for back-compat: still honored by the
 * backend trigger + RLS helpers). Access itself is now ROLE-based: the
 * FIRST-EVER registered user (any email) becomes the shop Admin, and branches
 * / team members join via admin invite or admin approval.
 */
export const ADMIN_EMAIL = "me.makai48@gmail.com";
/** @deprecated Use ADMIN_EMAIL. */
export const OWNER_EMAIL = ADMIN_EMAIL;

/** Max failed login attempts before an account is locked (admins exempt). */
export const MAX_FAILED_LOGINS = 3;

export function isAdminEmail(email?: string | null): boolean {
  return (email || "").trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

/** @deprecated Use isAdminEmail. */
export function isOwnerEmail(email?: string | null): boolean {
  return isAdminEmail(email);
}

/**
 * Role-based admin check: true for any Admin, regardless of email.
 * Also accepts the legacy "Owner" role string so pre-rename profiles
 * keep their access without a data migration.
 */
export function isAdminRole(role?: string | null): boolean {
  const r = (role || "").trim().toLowerCase();
  return r === "admin" || r === "admin";
}

/** @deprecated Use isAdminRole. */
export function isOwnerRole(role?: string | null): boolean {
  return isAdminRole(role);
}

/** Full admin check: legacy supreme email OR Admin role. */
export function isShopAdmin(email?: string | null, role?: string | null): boolean {
  return isAdminEmail(email) || isAdminRole(role);
}

/** @deprecated Use isShopAdmin. */
export function isShopOwner(email?: string | null, role?: string | null): boolean {
  return isShopAdmin(email, role);
}

/** Compute the total monthly-equivalent salary from an EmployeeSalary payload. */
export function computeEmployeeSalary(salary?: {
  base?: number;
  allowances?: { amount?: number; type?: "fixed" | "percentage" }[];
}): number {
  if (!salary) return 0;
  const base = Number(salary.base || 0);
  const allowances = salary.allowances || [];
  const total = allowances.reduce((sum, a) => {
    const amt = Number(a.amount || 0);
    if (a.type === "percentage") return sum + base * (amt / 100);
    return sum + amt;
  }, 0);
  return base + total;
}

export type AuditLogRow = {
  id: string;
  actor_id: string | null;
  actor_name: string;
  actor_role: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

export type PasswordResetRequest = {
  id: string;
  email: string;
  employeeId: string | null;
  employeeName?: string | null;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  approvedAt?: string | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
  tempPassword?: string | null;
  tempPasswordExpiresAt?: string | null;
  notes?: string | null;
};

/* ============================================================
 * Debtors & Creditors accounting module types
 * ============================================================ */

export type CreditModel = "continuous" | "monthly";
export type AccountStatus = "active" | "on_hold" | "blocked" | "closed";

export type CreditSettings = {
  customerId: string;
  creditEnabled: boolean;
  creditModel: CreditModel;
  creditLimit: number;
  paymentTermsDays: number;
  accountStatus: AccountStatus;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreditTxnLine = {
  itemId?: string | null;
  name: string;
  officer?: string | null;
  qty: number;
  unit?: string | null;
  unitPrice: number;
  discountPct?: number;
  taxPct?: number;
};

export type CreditTransactionStatus = "unbilled" | "invoiced" | "voided";

export type CreditTransaction = {
  id: string;
  customerId: string;
  customerName: string;
  saleId?: string | null;
  transactionDate: string;
  reference?: string | null;
  officer?: string | null;
  description?: string | null;
  lines: CreditTxnLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  billingPeriod?: string | null;
  status: CreditTransactionStatus;
  invoiceId?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DebtInvoiceType = "continuous" | "monthly" | "manual" | "creditor";
export type PartyType = "debtor" | "creditor";
export type DebtInvoiceStatus =
  | "draft"
  | "finalized"
  | "partial"
  | "paid"
  | "overdue"
  | "voided";

/** A single row within a consolidated invoice breakdown
 *  (grouped by officer × product × unit-price). */
export type InvoiceBreakdownRow = {
  officer?: string | null;
  itemName: string;
  unit?: string | null;
  unitPrice: number;
  qty: number;
  amount: number;
  transactionIds: string[];
};

export type DebtInvoice = {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  invoiceType: DebtInvoiceType;
  partyType: PartyType;
  supplierId?: string | null;
  billingPeriod?: string | null;
  issueDate: string;
  dueDate?: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  status: DebtInvoiceStatus;
  finalizedAt?: string | null;
  finalizedBy?: string | null;
  finalizedByName?: string | null;
  notes?: string | null;
  lines: CreditTxnLine[];
  breakdown: InvoiceBreakdownRow[];
  transactionIds: string[];
  previousBalance: number;
  createdBy?: string | null;
  createdByName?: string | null;
  voidedAt?: string | null;
  voidedBy?: string | null;
  voidedReason?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DebtPayment = {
  id: string;
  number: string;
  customerId?: string | null;
  supplierId?: string | null;
  customerName: string;
  partyType: PartyType;
  paymentDate: string;
  amount: number;
  paymentMethod: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
  unallocatedAmount: number;
  receivedBy?: string | null;
  receivedByName?: string | null;
  voided: boolean;
  voidedAt?: string | null;
  voidedBy?: string | null;
  voidedReason?: string | null;
  createdAt: string;
};

export type PaymentAllocation = {
  id: string;
  paymentId: string;
  invoiceId: string;
  amount: number;
  createdAt: string;
};

export type CreditDebitNote = {
  id: string;
  number: string;
  customerId?: string | null;
  supplierId?: string | null;
  partyName: string;
  partyType: PartyType;
  invoiceId?: string | null;
  noteDate: string;
  amount: number;
  reason?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: string;
};

export type BillingPeriod = {
  period: string;
  closed: boolean;
  closedAt?: string | null;
  closedBy?: string | null;
  closedByName?: string | null;
  notes?: string | null;
  invoiceCount: number;
  totalInvoiced: number;
  createdAt: string;
};

export type StatsPeriod = "day" | "week" | "month" | "year";

export const STATS_PERIOD_META: Record<StatsPeriod, { label: string; days: number }> = {
  day: { label: "Today", days: 1 },
  week: { label: "This week", days: 7 },
  month: { label: "This month", days: 30 },
  year: { label: "This year", days: 365 },
};

/** Default statistics reporting period. "day" = Today. */
export const DEFAULT_STATS_PERIOD: StatsPeriod = "day";

export type BankDeposit = {
  id: string;
  amount: number;
  fromSource: string;
  bankName?: string | null;
  reference?: string | null;
  notes?: string | null;
  depositedAt: string;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: string;
};

export type StandingOrderKind = "standing" | "loan";
export type StandingOrderFrequency = "monthly" | "weekly" | "biweekly" | "quarterly" | "yearly";

export type StandingOrder = {
  id: string;
  kind: StandingOrderKind;
  name: string;
  amount: number;
  currency: string;
  frequency: StandingOrderFrequency;
  nextRunDate?: string | null;
  payee?: string | null;
  account?: string | null;
  category: string;
  active: boolean;
  loanPrincipal?: number | null;
  loanBalance?: number | null;
  loanRate?: number | null;
  loanTermMonths?: number | null;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
};

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/* ============================================================
 * CLIENT BILLING MODULE — the NEW workflow. Fully separate from
 * the legacy POS credit/partial-payment logic which continues to
 * live in `sales` / `sale_payments`.
 * ============================================================ */

export type ClientContactPerson = {
  name: string;
  title?: string;
  phone?: string;
  email?: string;
};

export type ClientStaff = {
  name: string;
  title?: string;
  active?: boolean;
};

export type ClientPaymentDetails = {
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  branch?: string;
  momo?: string;
  instructions?: string;
};

export type ClientInvoiceMode = "manual" | "automatic";

export type ClientAccount = {
  id: string;
  name: string;
  address?: string | null;
  branch?: string | null;
  poBox?: string | null;
  phone?: string | null;
  email?: string | null;
  tin?: string | null;
  vat?: string | null;
  contactPersons: ClientContactPerson[];
  staff: ClientStaff[];
  paymentDetails: ClientPaymentDetails;
  active: boolean;
  invoiceGenerationMode: ClientInvoiceMode;
  notes?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClientService = {
  id: string;
  clientId?: string | null;
  name: string;
  description?: string | null;
  unit: string;
  unitPrice: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ClientWorkStatus = "unbilled" | "billed" | "voided";

export type ClientWorkEntry = {
  id: string;
  clientId: string;
  clientName: string;
  workDate: string;
  officer?: string | null;
  serviceId?: string | null;
  serviceName: string;
  description?: string | null;
  quantity: number;
  unit?: string | null;
  unitPrice: number;
  discount: number;
  amount: number;
  photoUrl?: string | null;
  documentRef?: string | null;
  billingPeriod?: string | null;
  validated: boolean;
  validatedBy?: string | null;
  validatedByName?: string | null;
  validatedAt?: string | null;
  invoiceId?: string | null;
  status: ClientWorkStatus;
  recordedBy?: string | null;
  recordedByName?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClientBillingPeriodStatus = "open" | "ready" | "invoiced" | "closed";

export type ClientBillingPeriod = {
  id: string;
  clientId: string;
  clientName: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  status: ClientBillingPeriodStatus;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  workCount: number;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
};

export type ClientInvoiceType = "monthly" | "outstanding" | "adjustment";
export type ClientInvoiceStatus =
  | "draft"
  | "unpaid"
  | "partial"
  | "paid"
  | "overdue"
  | "cancelled";

export type ClientInvoiceLine = {
  officer?: string | null;
  serviceName: string;
  description?: string | null;
  qty: number;
  unit?: string | null;
  unitPrice: number;
  discount: number;
  amount: number;
  workEntryIds?: string[];
};

export type ClientInvoiceBreakdownRow = {
  officer: string;
  serviceName: string;
  unit?: string | null;
  unitPrice: number;
  qty: number;
  amount: number;
  workEntryIds: string[];
};

export type ClientInvoice = {
  id: string;
  number: string;
  clientId: string;
  clientName?: string;
  clientSnapshot: Partial<ClientAccount> & Record<string, unknown>;
  invoiceType: ClientInvoiceType;
  billingPeriodId?: string | null;
  billingPeriodLabel?: string | null;
  parentInvoiceId?: string | null;
  issueDate: string;
  dueDate?: string | null;
  subtotal: number;
  discount: number;
  otherCharges: number;
  tax: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  status: ClientInvoiceStatus;
  lines: ClientInvoiceLine[];
  breakdown: ClientInvoiceBreakdownRow[];
  workEntryIds: string[];
  paymentDetails: ClientPaymentDetails;
  amountInWords?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  cancelledReason?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClientInvoicePayment = {
  id: string;
  number: string;
  invoiceId: string;
  clientId: string;
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  reference?: string | null;
  receivedBy?: string | null;
  receivedByName?: string | null;
  notes?: string | null;
  cancelled: boolean;
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  cancelledReason?: string | null;
  createdAt: string;
};

export const CLIENT_INVOICE_STATUS_META: Record<
  ClientInvoiceStatus,
  { label: string; color: string }
> = {
  draft: { label: "Draft", color: "bg-ink/5 text-ink-mute border border-line" },
  unpaid: {
    label: "Unpaid",
    color: "bg-cyan-reg/10 text-cyan-reg border border-cyan-reg/30",
  },
  partial: {
    label: "Partially Paid",
    color: "bg-yellow-reg/10 text-yellow-reg border border-yellow-reg/30",
  },
  paid: {
    label: "Paid",
    color: "bg-success/10 text-success border border-success/30",
  },
  overdue: {
    label: "Overdue",
    color: "bg-danger/10 text-danger border border-danger/30",
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-ink/5 text-ink-mute border border-line line-through",
  },
};

/** Compact number-to-words converter used to render invoice totals
 *  in words (e.g. "Two Hundred Fifty Thousand Uganda Shillings Only"). */
export function numberToWords(n: number): string {
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
    "Sixteen", "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const chunk = (num: number): string => {
    if (num === 0) return "";
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? " " + ones[num % 10] : "");
    return ones[Math.floor(num / 100)] + " Hundred" + (num % 100 ? " " + chunk(num % 100) : "");
  };
  if (n === 0) return "Zero";
  const units = ["", "Thousand", "Million", "Billion", "Trillion"];
  let result = "";
  let unitIdx = 0;
  let rem = Math.floor(Math.abs(n));
  while (rem > 0) {
    const c = rem % 1000;
    if (c > 0) {
      const part = chunk(c) + (units[unitIdx] ? " " + units[unitIdx] : "");
      result = part + (result ? " " + result : "");
    }
    rem = Math.floor(rem / 1000);
    unitIdx++;
  }
  return (n < 0 ? "Negative " : "") + result.trim();
}

export function amountInWords(amount: number, currency = "USD"): string {
  const noDecimal = NO_DECIMAL_CURRENCIES.includes(currency);
  const int = Math.floor(Math.abs(amount));
  const dec = Math.round((Math.abs(amount) - int) * 100);
  const currencyLabel: Record<string, string> = {
    UGX: "Uganda Shillings",
    USD: "US Dollars",
    EUR: "Euros",
    GBP: "Pounds Sterling",
    KES: "Kenyan Shillings",
    TZS: "Tanzanian Shillings",
    RWF: "Rwandan Francs",
  };
  const label = currencyLabel[currency] || currency;
  const words = numberToWords(int);
  if (noDecimal) return `${words} ${label} Only`;
  const cents = dec > 0 ? ` and ${numberToWords(dec)} Cents` : "";
  return `${words} ${label}${cents} Only`;
}
