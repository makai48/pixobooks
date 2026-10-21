import type {
  Item,
  Customer,
  Sale,
  HeldTicket,
  Expense,
  Quote,
  PurchaseOrder,
  Employee,
  Settings,
  LoyaltyTransaction,
  ItemType,
  UnitConversion,
  SupplierRecord,
  AttendanceRecord,
  EmployeeSalary,
  SalePayment,
  PaymentStatus,
  DocumentType,
  BankDeposit,
  StandingOrder,
  StandingOrderKind,
  StandingOrderFrequency,
  StockAdjustment,
  DailyBalancing,
  CreditSettings,
  CreditTransaction,
  DebtInvoice,
  DebtPayment,
  PaymentAllocation,
  CreditDebitNote,
  BillingPeriod,
  CreditModel,
  AccountStatus,
  CreditTransactionStatus,
  DebtInvoiceType,
  DebtInvoiceStatus,
  PartyType,
  ClientAccount,
  ClientService,
  ClientWorkEntry,
  ClientBillingPeriod,
  ClientInvoice,
  ClientInvoicePayment,
  ClientInvoiceLine,
  ClientInvoiceBreakdownRow,
  ClientContactPerson,
  ClientStaff,
  ClientPaymentDetails,
  ClientInvoiceType,
  ClientInvoiceStatus,
  ClientWorkStatus,
  ClientBillingPeriodStatus,
  ClientInvoiceMode,
} from "@/types";

const n = (v: unknown, d = 0) => (v == null ? d : Number(v));

const usbId = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const id = Number(v);
  return Number.isFinite(id) && id >= 0 && id <= 0xffff ? Math.trunc(id) : null;
};

// Supabase rows are untyped JSON (snake_case). Centralize the escape hatch
// here instead of `any` in every signature — migrate to generated DB types later.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbRow = Record<string, any>;

export function mapItem(r: DbRow): Item {
  const isMaterial = !!r.is_material;
  const itemType: ItemType =
    (r.item_type as ItemType) || (isMaterial ? "material" : "product");
  return {
    id: r.id,
    sku: r.sku,
    barcode: r.barcode,
    name: r.name,
    category: r.category,
    price: n(r.price),
    cost: n(r.cost),
    stock: n(r.stock),
    baseUnit: r.base_unit,
    units: r.units || [],
    bom: r.bom || null,
    isMaterial,
    itemType,
    imageUrl: r.image_url,
    suppliers: r.suppliers || [],
    emoji: r.emoji,
    lowStockThreshold: r.low_stock_threshold != null ? n(r.low_stock_threshold) : null,
    allowDecimalQty: !!r.allow_decimal_qty,
    purchaseUnit: r.purchase_unit || r.base_unit,
    saleUnit: r.sale_unit || r.base_unit,
    preferredSupplierId: r.preferred_supplier_id || null,
    preferredSupplierName: r.preferred_supplier_name || null,
    purchaseUomId: r.purchase_uom_id || null,
    saleUomId: r.sale_uom_id || null,
    baseUomId: r.base_uom_id || null,
    priceUom: r.price_uom || null,
    costUom: r.cost_uom || null,
    productCategory:
      r.product_category === "service" || r.product_category === "kit" ? r.product_category : "goods",
    canPurchase: r.can_purchase ?? null,
    canSell: r.can_sell ?? null,
    posVisible: r.pos_visible ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapStockAdjustment(r: DbRow): StockAdjustment {
  return {
    id: r.id,
    itemId: r.item_id,
    itemName: r.item_name,
    adjustmentType: r.adjustment_type || "manual",
    qtyChange: n(r.qty_change),
    oldStock: n(r.old_stock),
    newStock: n(r.new_stock),
    reason: r.reason,
    adjustmentDate: r.adjustment_date,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
  };
}

export function mapDailyBalancing(r: DbRow): DailyBalancing {
  return {
    balanceDate: r.balance_date,
    openingBalance: n(r.opening_balance),
    cashSales: n(r.cash_sales),
    cashExpenses: n(r.cash_expenses),
    drawings: n(r.drawings),
    netCashFlow: n(r.net_cash_flow),
    depositAmount: n(r.deposit_amount),
    closingBalance: n(r.closing_balance),
    physicalCashCount: r.physical_cash_count != null ? n(r.physical_cash_count) : null,
    variance: r.variance != null ? n(r.variance) : null,
    bankDepositId: r.bank_deposit_id,
    notes: r.notes,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapCustomer(r: DbRow): Customer {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    notes: r.notes,
    avatarUrl: r.avatar_url,
    totalSpent: n(r.total_spent),
    loyaltyPoints: n(r.loyalty_points),
    createdAt: r.created_at,
  };
}

export function mapSale(r: DbRow): Sale {
  return {
    id: r.id,
    number: r.number,
    createdAt: r.created_at,
    cashierId: r.cashier_id,
    cashierName: r.cashier_name,
    customerId: r.customer_id,
    customerName: r.customer_name,
    lines: r.lines || [],
    subtotal: n(r.subtotal),
    lineDiscountTotal: n(r.line_discount_total),
    orderDiscountPct: n(r.order_discount_pct),
    orderDiscountValue: n(r.order_discount_value),
    tax: n(r.tax),
    total: n(r.total),
    cost: n(r.cost),
    profit: n(r.profit),
    paymentMethod: r.payment_method,
    paymentStatus: (r.payment_status as PaymentStatus) || "paid",
    documentType: (r.document_type as DocumentType) || "receipt",
    amountPaid: n(r.amount_paid, n(r.total)),
    amountDue: n(r.amount_due, 0),
    dueDate: r.due_date || null,
    loyaltyEarned: n(r.loyalty_earned),
    loyaltyRedeemed: n(r.loyalty_redeemed),
    branchId: r.branch_id || null,
  };
}

export function mapSalePayment(r: DbRow): SalePayment {
  return {
    id: r.id,
    saleId: r.sale_id,
    amount: n(r.amount),
    paymentMethod: r.payment_method,
    receivedBy: r.received_by,
    receivedByName: r.received_by_name,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

export function mapHeldTicket(r: DbRow): HeldTicket {
  return {
    id: r.id,
    label: r.label,
    cashierId: r.cashier_id,
    cashierName: r.cashier_name,
    customerId: r.customer_id,
    customerName: r.customer_name,
    lines: r.lines || [],
    orderDiscountPct: n(r.order_discount_pct),
    createdAt: r.created_at,
    branchId: r.branch_id || null,
  };
}

export function mapExpense(r: DbRow): Expense {
  return {
    id: r.id,
    category: r.category,
    description: r.description,
    amount: n(r.amount),
    expenseDate: r.expense_date,
    paymentMethod: r.payment_method,
    vendor: r.vendor,
    notes: r.notes,
    createdBy: r.created_by,
    createdByName: r.created_by_name || "—",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    branchId: r.branch_id || null,
  };
}

export function mapQuote(r: DbRow): Quote {
  return {
    id: r.id,
    number: r.number,
    customerId: r.customer_id,
    customerName: r.customer_name,
    lines: r.lines || [],
    subtotal: n(r.subtotal),
    tax: n(r.tax),
    total: n(r.total),
    status: r.status,
    validUntil: r.valid_until,
    notes: r.notes,
    createdBy: r.created_by,
    createdByName: r.created_by_name || "—",
    convertedSaleId: r.converted_sale_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapPO(r: DbRow): PurchaseOrder {
  return {
    id: r.id,
    number: r.number,
    vendor: r.vendor,
    lines: r.lines || [],
    subtotal: n(r.subtotal),
    tax: n(r.tax),
    total: n(r.total),
    status: r.status,
    expectedDate: r.expected_date,
    notes: r.notes,
    createdBy: r.created_by,
    createdByName: r.created_by_name || "—",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    receivedAt: r.received_at,
    branchId: r.branch_id || null,
  };
}

const defaultSalary: EmployeeSalary = {
  base: 0,
  currency: "USD",
  payCycle: "monthly",
  allowances: [],
};

export function mapEmployee(r: DbRow): Employee {
  const salary = r.salary
    ? {
        base: n(r.salary.base),
        currency: r.salary.currency || "USD",
        payCycle: r.salary.payCycle || "monthly",
        allowances: Array.isArray(r.salary.allowances) ? r.salary.allowances : [],
      }
    : defaultSalary;
  return {
    id: r.id,
    name: r.username || r.email || "Unnamed",
    email: r.email,
    pin: r.pin || "",
    role: r.role || "Staff",
    permissions: r.permissions || [],
    active: r.active !== false,
    branchId: r.branch_id || null,
    avatarUrl: r.avatar_url,
    phone: r.phone || null,
    address: r.address || null,
    hireDate: r.hire_date || null,
    emergencyContact: r.emergency_contact || null,
    emergencyContactPhone: r.emergency_contact_phone || null,
    notes: r.notes || null,
    salary,
    createdAt: r.created_at || new Date().toISOString(),
    failedLoginCount: n(r.failed_login_count, 0),
    lockedUntil: r.locked_until || null,
    approvalStatus: (r.approval_status as Employee["approvalStatus"]) || "approved",
    approvalRequestedAt: r.approval_requested_at || null,
    approvedAt: r.approved_at || null,
    approvedBy: r.approved_by || null,
    approvedByName: r.approved_by_name || null,
    mustChangePassword: !!r.must_change_password,
    tempPasswordExpiresAt: r.temp_password_expires_at || null,
    invitedBy: r.invited_by || null,
    invitedByName: r.invited_by_name || null,
    invitedAt: r.invited_at || null,
  };
}

export function mapAccountApprovalRequest(r: DbRow) {
  return {
    id: r.id,
    userId: r.user_id,
    employeeName: r.employee_name,
    email: r.email,
    role: r.role,
    status: r.status,
    requestedAt: r.requested_at,
    approvedAt: r.approved_at,
    approvedBy: r.approved_by,
    approvedByName: r.approved_by_name,
    notes: r.notes,
  };
}

export function mapSettings(r: DbRow): Settings {
  const receipt = r.receipt || {};
  const invoice = r.invoice || {};
  const printer = r.printer || {};
  const loyalty = r.loyalty || {};
  const discount = r.discount || {};
  const theme = r.theme || {};
  return {
    shopName: r.shop_name || "My Shop",
    currency: r.currency || "USD",
    taxRate: n(r.tax_rate),
    logoUrl: r.logo_url,
    address: r.address || "",
    phone: r.phone || "",
    email: r.email || "",
    categories: Array.isArray(r.categories) ? r.categories : [],
    expenseCategories: Array.isArray(r.expense_categories) ? r.expense_categories : [],
    country: r.country || "",
    timezone: r.timezone || "UTC",
    businessType: r.business_type || "",
    digitGrouping: r.digit_grouping === "indian" ? "indian" : "western",
    decimalPlaces: Number.isFinite(Number(r.decimal_places))
      ? Math.min(4, Math.max(0, Number(r.decimal_places)))
      : 2,
    thousandSeparator: typeof r.thousand_separator === "string" && r.thousand_separator ? r.thousand_separator : ",",
    decimalSeparator: typeof r.decimal_separator === "string" && r.decimal_separator ? r.decimal_separator : ".",
    mobile: r.mobile || "",
    officePhone: r.office_phone || "",
    whatsapp: r.whatsapp || "",
    termsVersion: r.terms_version || "",
    privacyVersion: r.privacy_version || "",
    receipt: {
      header: receipt.header || "Thanks for printing with us!",
      footer: receipt.footer || "",
      showLogo: receipt.showLogo !== false,
      paperWidthMm: ([58, 80, 99].includes(Number(receipt.paperWidthMm)) ? Number(receipt.paperWidthMm) : 80) as 58 | 80 | 99,
    },
    invoice: {
      prefix: invoice.prefix || "PB-",
      nextNumber: invoice.nextNumber || 1000,
      terms: invoice.terms || "Payment due on receipt.",
    },
    printer: {
      deviceName: printer.deviceName || "Default Printer",
      printerType: printer.printerType || "network",
      paperSize: (["58mm", "80mm", "99x210mm", "A4", "A5", "Letter"].includes(printer.paperSize) ? printer.paperSize : "80mm"),
      ipAddress: printer.ipAddress || "",
      bluetoothMac: printer.bluetoothMac || "",
      bridgeUrl: printer.bridgeUrl || "",
      bridgeToken: printer.bridgeToken || "",
      bluetoothService: printer.bluetoothService || "",
      usbVendorId: usbId(printer.usbVendorId),
      usbProductId: usbId(printer.usbProductId),
      serialBaudRate: Number.isFinite(Number(printer.serialBaudRate)) && Number(printer.serialBaudRate) > 0
        ? Math.trunc(Number(printer.serialBaudRate))
        : 9600,
      codepage: (["cp437", "cp850", "cp858", "cp1252"].includes(printer.codepage) ? printer.codepage : "cp1252"),
      autoPrint: !!printer.autoPrint,
      openDrawer: !!printer.openDrawer,
    },
    loyalty: {
      enabled: loyalty.enabled !== false,
      pointsPerDollar: n(loyalty.pointsPerDollar, 1),
      dollarPerPoint: n(loyalty.dollarPerPoint, 0.02),
    },
    discount: {
      type: discount.type || "percentage",
      allowLine: discount.allowLine !== false,
      allowOrder: discount.allowOrder !== false,
      maxPct: n(discount.maxPct, 50),
      maxAmount: n(discount.maxAmount, 100),
    },
    theme: {
      mode: theme.mode || "light",
      preset: theme.preset || "default",
      primary: theme.primary || "#e0399a",
      accent: theme.accent || "#1b2a4e",
      background: theme.background || undefined,
    },
    billing: {
      plan: r.plan === "growth" || r.plan === "pro" ? r.plan : r.billing?.plan === "growth" || r.billing?.plan === "pro" ? r.billing.plan : "starter",
      status: r.subscription_status || r.billing?.status || "trialing",
      trialEndsAt: r.trial_ends_at ?? r.billing?.trialEndsAt ?? null,
      currentPeriodEnd: r.current_period_end ?? r.billing?.currentPeriodEnd ?? null,
      stripeCustomerId: r.stripe_customer_id ?? r.billing?.stripeCustomerId ?? null,
      stripeSubscriptionId: r.stripe_subscription_id ?? r.billing?.stripeSubscriptionId ?? null,
    },
  };
}

export function mapLoyaltyTx(r: DbRow): LoyaltyTransaction {
  return {
    id: r.id,
    customerId: r.customer_id,
    saleId: r.sale_id,
    points: n(r.points),
    type: r.type,
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

export function mapUnitConversion(r: DbRow): UnitConversion {
  return {
    id: r.id,
    fromUnit: r.from_unit,
    toUnit: r.to_unit,
    factor: n(r.factor, 1),
    category: r.category || "general",
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    fromUomId: r.from_uom_id || null,
    toUomId: r.to_uom_id || null,
  };
}

export function mapUom(r: DbRow): import("@/types").Uom {
  const ratio = Number(r.ratio);
  const rounding = Number(r.rounding);
  return {
    id: r.id,
    code: String(r.code || "").toLowerCase(),
    name: r.name || r.code || "",
    symbol: r.symbol || null,
    discrete: r.discrete !== false,
    isActive: r.is_active !== false,
    categoryId: r.category_id || null,
    ratio: Number.isFinite(ratio) ? ratio : null,
    rounding: Number.isFinite(rounding) && rounding > 0 ? rounding : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapUomCategory(r: DbRow): import("@/types").UomCategory {
  return {
    id: r.id,
    name: r.name || "",
    referenceUomId: r.reference_uom_id || null,
    description: r.description || null,
    isActive: r.is_active !== false,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapSupplier(r: DbRow): SupplierRecord {
  return {
    id: r.id,
    name: r.name,
    contactPerson: r.contact_person,
    email: r.email,
    phone: r.phone,
    address: r.address,
    location: r.location,
    avatarUrl: r.avatar_url,
    notes: r.notes,
    items: Array.isArray(r.items) ? r.items : [],
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapAttendance(r: DbRow): AttendanceRecord {
  return {
    id: r.id,
    employeeId: r.employee_id,
    employeeName: r.employee_name,
    date: r.date,
    status: r.status || "present",
    hours: n(r.hours, 8),
    clockIn: r.clock_in,
    clockOut: r.clock_out,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

export function mapBankDeposit(r: DbRow): BankDeposit {
  return {
    id: r.id,
    amount: n(r.amount),
    fromSource: r.from_source || "cash",
    bankName: r.bank_name,
    reference: r.reference,
    notes: r.notes,
    depositedAt: r.deposited_at,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
  };
}

export function mapCreditSettings(r: DbRow): CreditSettings {
  return {
    customerId: r.customer_id,
    creditEnabled: r.credit_enabled !== false,
    creditModel: (r.credit_model as CreditModel) || "continuous",
    creditLimit: n(r.credit_limit),
    paymentTermsDays: n(r.payment_terms_days, 30),
    accountStatus: (r.account_status as AccountStatus) || "active",
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapCreditTransaction(r: DbRow): CreditTransaction {
  return {
    id: r.id,
    customerId: r.customer_id,
    customerName: r.customer_name,
    saleId: r.sale_id,
    transactionDate: r.transaction_date,
    reference: r.reference,
    officer: r.officer,
    description: r.description,
    lines: Array.isArray(r.lines) ? r.lines : [],
    subtotal: n(r.subtotal),
    discount: n(r.discount),
    tax: n(r.tax),
    total: n(r.total),
    billingPeriod: r.billing_period,
    status: (r.status as CreditTransactionStatus) || "unbilled",
    invoiceId: r.invoice_id,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapDebtInvoice(r: DbRow): DebtInvoice {
  return {
    id: r.id,
    number: r.number,
    customerId: r.customer_id,
    customerName: r.customer_name,
    invoiceType: (r.invoice_type as DebtInvoiceType) || "continuous",
    partyType: (r.party_type as PartyType) || "debtor",
    supplierId: r.supplier_id,
    billingPeriod: r.billing_period,
    issueDate: r.issue_date,
    dueDate: r.due_date,
    subtotal: n(r.subtotal),
    discount: n(r.discount),
    tax: n(r.tax),
    total: n(r.total),
    amountPaid: n(r.amount_paid),
    amountDue: n(r.amount_due),
    status: (r.status as DebtInvoiceStatus) || "draft",
    finalizedAt: r.finalized_at,
    finalizedBy: r.finalized_by,
    finalizedByName: r.finalized_by_name,
    notes: r.notes,
    lines: Array.isArray(r.lines) ? r.lines : [],
    breakdown: Array.isArray(r.breakdown) ? r.breakdown : [],
    transactionIds: Array.isArray(r.transaction_ids) ? r.transaction_ids : [],
    previousBalance: n(r.previous_balance),
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    voidedAt: r.voided_at,
    voidedBy: r.voided_by,
    voidedReason: r.voided_reason,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapDebtPayment(r: DbRow): DebtPayment {
  return {
    id: r.id,
    number: r.number,
    customerId: r.customer_id,
    supplierId: r.supplier_id,
    customerName: r.customer_name,
    partyType: (r.party_type as PartyType) || "debtor",
    paymentDate: r.payment_date,
    amount: n(r.amount),
    paymentMethod: r.payment_method,
    reference: r.reference,
    notes: r.notes,
    unallocatedAmount: n(r.unallocated_amount),
    receivedBy: r.received_by,
    receivedByName: r.received_by_name,
    voided: !!r.voided,
    voidedAt: r.voided_at,
    voidedBy: r.voided_by,
    voidedReason: r.voided_reason,
    createdAt: r.created_at,
  };
}

export function mapPaymentAllocation(r: DbRow): PaymentAllocation {
  return {
    id: r.id,
    paymentId: r.payment_id,
    invoiceId: r.invoice_id,
    amount: n(r.amount),
    createdAt: r.created_at,
  };
}

export function mapCreditDebitNote(r: DbRow): CreditDebitNote {
  return {
    id: r.id,
    number: r.number,
    customerId: r.customer_id,
    supplierId: r.supplier_id,
    partyName: r.party_name,
    partyType: (r.party_type as PartyType) || "debtor",
    invoiceId: r.invoice_id,
    noteDate: r.note_date,
    amount: n(r.amount),
    reason: r.reason,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
  };
}

export function mapBillingPeriod(r: DbRow): BillingPeriod {
  return {
    period: r.period,
    closed: !!r.closed,
    closedAt: r.closed_at,
    closedBy: r.closed_by,
    closedByName: r.closed_by_name,
    notes: r.notes,
    invoiceCount: n(r.invoice_count),
    totalInvoiced: n(r.total_invoiced),
    createdAt: r.created_at,
  };
}

/* ============================================================
 * CLIENT BILLING mappers (new module)
 * ============================================================ */

export function mapClientAccount(r: DbRow): ClientAccount {
  return {
    id: r.id,
    name: r.name,
    address: r.address,
    branch: r.branch,
    poBox: r.po_box,
    phone: r.phone,
    email: r.email,
    tin: r.tin,
    vat: r.vat,
    contactPersons: Array.isArray(r.contact_persons)
      ? (r.contact_persons as ClientContactPerson[])
      : [],
    staff: Array.isArray(r.staff) ? (r.staff as ClientStaff[]) : [],
    paymentDetails: (r.payment_details || {}) as ClientPaymentDetails,
    active: r.active !== false,
    invoiceGenerationMode: (r.invoice_generation_mode as ClientInvoiceMode) || "manual",
    notes: r.notes,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapClientService(r: DbRow): ClientService {
  return {
    id: r.id,
    clientId: r.client_id,
    name: r.name,
    description: r.description,
    unit: r.unit || "pc",
    unitPrice: n(r.unit_price),
    active: r.active !== false,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapClientWorkEntry(r: DbRow): ClientWorkEntry {
  return {
    id: r.id,
    clientId: r.client_id,
    clientName: r.client_name,
    workDate: r.work_date,
    officer: r.officer,
    serviceId: r.service_id,
    serviceName: r.service_name,
    description: r.description,
    quantity: n(r.quantity),
    unit: r.unit,
    unitPrice: n(r.unit_price),
    discount: n(r.discount),
    amount: n(r.amount),
    photoUrl: r.photo_url,
    documentRef: r.document_ref,
    billingPeriod: r.billing_period,
    validated: !!r.validated,
    validatedBy: r.validated_by,
    validatedByName: r.validated_by_name,
    validatedAt: r.validated_at,
    invoiceId: r.invoice_id,
    status: (r.status as ClientWorkStatus) || "unbilled",
    recordedBy: r.recorded_by,
    recordedByName: r.recorded_by_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapClientBillingPeriod(r: DbRow): ClientBillingPeriod {
  return {
    id: r.id,
    clientId: r.client_id,
    clientName: r.client_name,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    periodLabel: r.period_label,
    status: (r.status as ClientBillingPeriodStatus) || "open",
    invoiceId: r.invoice_id,
    invoiceNumber: r.invoice_number,
    workCount: n(r.work_count),
    totalAmount: n(r.total_amount),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapClientInvoice(r: DbRow): ClientInvoice {
  return {
    id: r.id,
    number: r.number,
    clientId: r.client_id,
    clientName: r.client_snapshot?.name || r.client_name || "",
    clientSnapshot: r.client_snapshot || {},
    invoiceType: (r.invoice_type as ClientInvoiceType) || "monthly",
    billingPeriodId: r.billing_period_id,
    billingPeriodLabel: r.billing_period_label,
    parentInvoiceId: r.parent_invoice_id,
    issueDate: r.issue_date,
    dueDate: r.due_date,
    subtotal: n(r.subtotal),
    discount: n(r.discount),
    otherCharges: n(r.other_charges),
    tax: n(r.tax),
    total: n(r.total),
    amountPaid: n(r.amount_paid),
    amountDue: n(r.amount_due),
    status: (r.status as ClientInvoiceStatus) || "unpaid",
    lines: Array.isArray(r.lines) ? (r.lines as ClientInvoiceLine[]) : [],
    breakdown: Array.isArray(r.breakdown)
      ? (r.breakdown as ClientInvoiceBreakdownRow[])
      : [],
    workEntryIds: Array.isArray(r.work_entry_ids)
      ? (r.work_entry_ids as string[])
      : [],
    paymentDetails: (r.payment_details || {}) as ClientPaymentDetails,
    amountInWords: r.amount_in_words,
    notes: r.notes,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    cancelledAt: r.cancelled_at,
    cancelledBy: r.cancelled_by,
    cancelledReason: r.cancelled_reason,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapClientInvoicePayment(r: DbRow): ClientInvoicePayment {
  return {
    id: r.id,
    number: r.number,
    invoiceId: r.invoice_id,
    clientId: r.client_id,
    paymentDate: r.payment_date,
    amount: n(r.amount),
    paymentMethod: r.payment_method || "cash",
    reference: r.reference,
    receivedBy: r.received_by,
    receivedByName: r.received_by_name,
    notes: r.notes,
    cancelled: !!r.cancelled,
    cancelledAt: r.cancelled_at,
    cancelledBy: r.cancelled_by,
    cancelledReason: r.cancelled_reason,
    createdAt: r.created_at,
  };
}

export function mapStandingOrder(r: DbRow): StandingOrder {
  return {
    id: r.id,
    kind: (r.kind as StandingOrderKind) || "standing",
    name: r.name,
    amount: n(r.amount),
    currency: r.currency || "USD",
    frequency: (r.frequency as StandingOrderFrequency) || "monthly",
    nextRunDate: r.next_run_date,
    payee: r.payee,
    account: r.account,
    category: r.category || "General",
    active: r.active !== false,
    loanPrincipal: r.loan_principal != null ? n(r.loan_principal) : null,
    loanBalance: r.loan_balance != null ? n(r.loan_balance) : null,
    loanRate: r.loan_rate != null ? n(r.loan_rate) : null,
    loanTermMonths: r.loan_term_months != null ? n(r.loan_term_months) : null,
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
