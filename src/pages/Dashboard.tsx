import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Trash2,
  Percent,
  Receipt,
  CreditCard,
  Banknote,
  ArrowLeftRight,
  ArrowLeft,
  X,
  PauseCircle,
  Gift,
  RotateCcw,
  LayoutGrid,
  List as ListIcon,
  Image as ImageIcon,
  DollarSign,
  Landmark,
  Wallet,
  FileText,
  Package,
  Settings as SettingsIcon,
  Edit2,
  Plus,
  Minus,
} from "lucide-react";
import { toast } from "sonner";
import { Link, useOutletContext } from "react-router-dom";
import SubNav from "@/components/layout/SubNav";
import { PauseCircle as PauseIcon, FileText as QuotesIcon, LayoutDashboard as POSIcon, Receipt as SalesReportIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useItems, useSeedSampleData } from "@/hooks/useItems";
import { useUoms } from "@/hooks/useUoms";
import { useUnitConversions } from "@/hooks/useUnitConversions";
import { isUomDiscrete } from "@/lib/uom";
import { useCustomers } from "@/hooks/useCustomers";
import { useShopSettings, useUpdateShopSettings } from "@/hooks/useShopSettings";
import { useEmployees } from "@/hooks/useEmployees";
import { evaluateTxnPolicyForCashier } from "@/hooks/useStaffAllowances";
import { useCompleteSale, useSalePayments } from "@/hooks/useSales";
import type { CheckoutInput } from "@/hooks/useSales";
import {
  useHeldTickets,
  useHoldTicket,
  useDeleteHeldTicket,
} from "@/hooks/useHeldTickets";
import { supabase } from "@/lib/supabase";
import { currentBusinessId } from "@/lib/tenant";
import { useQueryClient } from "@tanstack/react-query";
import {
  ITEM_TYPE_META,
  type Item,
  type SaleLine,
  type Sale,
  type POSViewMode,
  type PaymentMethod,
} from "@/types";
import { cn, formatCurrency, formatNumber, formatIntegerWithCommas, formatAmountInput, wrapByWords, toErrorMessage } from "@/lib/utils";
import { currencyByCode } from "@/lib/referenceData";
import { computeTotals, producibleFromBOM } from "@/lib/pos";
import { holdHint } from "@/lib/businessClues";
import BarcodeScanButton from "@/components/common/BarcodeScanButton";
import {
  clearPosDraft,
  loadPosDraft,
  reconcilePosDraftLines,
  savePosDraft,
} from "@/lib/posDraft";
import { describePrintError, printSaleReceipt } from "@/lib/printing";
import DocumentView from "@/components/features/receipts/DocumentView";
import PrintablePortal from "@/components/features/receipts/PrintablePortal";
import ReceiptActions from "@/components/features/receipts/ReceiptActions";
import SaleCompletion from "@/components/features/receipts/SaleCompletion";
import CustomerCombobox from "@/components/features/customers/CustomerCombobox";
import GlassSelect from "@/components/ui/GlassSelect";
import MoneyText from "@/components/ui/MoneyText";
import CustomerModal from "@/components/features/customers/CustomerModal";
import OnboardingChecklist from "@/components/onboarding/OnboardingChecklist";
import type { AppOutletContext } from "@/components/layout/AppLayout";

type CartLine = SaleLine & { imageUrl?: string | null };

const VIEW_MODE_KEY = "pixobooks:pos_view_mode";
const draftStorage = typeof window === "undefined" ? null : window.localStorage;

export default function Dashboard() {
  const { profile, user, can, canViewCosts } = useAuth();
  const ctx = useOutletContext<AppOutletContext | undefined>();
  const sidebarCollapsed = ctx?.collapsed ?? false;
  const { data: items = [], isLoading: itemsLoading } = useItems();
  const { data: uoms = [] } = useUoms();
  const { data: conversions = [] } = useUnitConversions();
  const { data: customers = [], isSuccess: customersLoaded } = useCustomers();
  const { data: settings } = useShopSettings();
  const { data: heldTickets = [] } = useHeldTickets();
  const { data: employees = [] } = useEmployees();
  const updateSettings = useUpdateShopSettings();
  const completeSale = useCompleteSale();
  const holdTicket = useHoldTicket();
  const deleteHeld = useDeleteHeldTicket();
  const seedSample = useSeedSampleData();

  const sellable = useMemo(
    () => items.filter((i) => ITEM_TYPE_META[i.itemType]?.sellable && i.posVisible !== false),
    [items]
  );

  /**
   * For any sellable item, compute the live "remaining stock" figure.
   *  - Materials / intermediates / ready items → their tracked stock.
   *  - Products with a BOM → the producible quantity limited by the
   *    most constraining component in the BOM.
   *  - Products without a BOM → "Made to order".
   */
  const stockLabelFor = (item: Item): string => {
    const meta = ITEM_TYPE_META[item.itemType];
    if (item.itemType === "product") {
      if (item.bom && item.bom.length > 0) {
        const { qty } = producibleFromBOM(item, items);
        return `Can make: ${qty} ${item.baseUnit}`;
      }
      return "Made to order";
    }
    if (meta.sellable) return `Stock: ${item.stock} ${item.baseUnit}`;
    return "";
  };

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [initialDraft] = useState(() => loadPosDraft(draftStorage));
  const [cart, setCart] = useState<CartLine[]>(() => initialDraft.lines.map((line) => ({ ...line })));
  const [orderDiscountPct, setOrderDiscountPct] = useState(initialDraft.orderDiscountPct);
  const [orderDiscountAmount, setOrderDiscountAmount] = useState(initialDraft.orderDiscountAmount);
  // Raw grouped text while the cashier types the order-discount amount, so
  // the comma separators survive re-renders without fighting the number state.
  const [orderDiscountRaw, setOrderDiscountRaw] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string>(initialDraft.customerId);
  const [loyaltyRedeem, setLoyaltyRedeem] = useState(initialDraft.loyaltyRedeem);
  const [holdDialogOpen, setHoldDialogOpen] = useState(false);
  const [holdLabel, setHoldLabel] = useState("");
  const [showHeldPanel, setShowHeldPanel] = useState(false);
  const [showCartMobile, setShowCartMobile] = useState(false);
  // Per-line raw draft strings for Qty and inline Discount inputs.
  // Preserves "user is currently typing / has cleared the field"
  // state so that clearing a field NEVER removes the item from the
  // ticket and does NOT trigger unnecessary re-renders of unrelated
  // rows.
  const [rawQtyMap, setRawQtyMap] = useState<Record<string, string>>({});
  const [rawDiscountMap, setRawDiscountMap] = useState<Record<string, string>>({});
  const [lastReceipt, setLastReceipt] = useState<Sale | null>(null);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [partialOpen, setPartialOpen] = useState(false);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  /**
   * Tracks the held-ticket ID whose contents are currently loaded into
   * the cart. When set, the held ticket is only removed from storage
   * once (a) checkout completes successfully, or (b) the user presses
   * the explicit Clear action. Navigating away, switching tabs,
   * refreshing, or any other unrelated POS action does NOT clear it.
   */
  const [resumedHeldTicketId, setResumedHeldTicketId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<POSViewMode>(() => {
    if (typeof window === "undefined") return "thumbnails";
    return (localStorage.getItem(VIEW_MODE_KEY) as POSViewMode) || "thumbnails";
  });

  const searchRef = useRef<HTMLInputElement>(null);
  // Focus the scanner box only where a physical keyboard exists. On mobile
  // an auto-focused text field forces the on-screen keyboard up on load.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(min-width: 768px)").matches) return;
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  const discountType = settings?.discount.type || "percentage";
  const allowLineDiscount = settings?.discount.allowLine !== false;
  const allowOrderDiscount = settings?.discount.allowOrder !== false;

  const categories = useMemo(() => {
    const derived = sellable.map((i) => i.category);
    const custom = settings?.categories || [];
    return ["All", ...Array.from(new Set([...custom, ...derived]))];
  }, [sellable, settings]);

  const filtered = sellable.filter((i) => {
    const q = query.toLowerCase();
    const matchQ =
      !q ||
      i.name.toLowerCase().includes(q) ||
      i.sku.toLowerCase().includes(q) ||
      (i.barcode || "").toLowerCase().includes(q);
    const matchC = category === "All" || i.category === category;
    return matchQ && matchC;
  });

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const availablePoints = selectedCustomer?.loyaltyPoints || 0;

  /**
   * A POS draft or held ticket saved by an older build can carry a customer id
   * that no longer exists (or was never a uuid, e.g. "cust-mtn"). The combobox
   * then shows "Walk-in Customer" while the stale id is still attached, and
   * checkout dies in Postgres with 22P02. Once the live customer list has
   * loaded, drop any id it does not contain.
   */
  useEffect(() => {
    if (!customersLoaded || !customerId) return;
    if (customers.some((c) => c.id === customerId)) return;
    setCustomerId("");
    setLoyaltyRedeem(0);
    toast.info("The saved customer is not available — switched to Walk-in.");
  }, [customersLoaded, customers, customerId]);

  const add = (item: Item) => {
    setCart((c) => {
      const existing = c.find((x) => x.itemId === item.id);
      if (existing) {
        return c.map((x) => (x.itemId === item.id ? { ...x, qty: x.qty + 1 } : x));
      }
      return [
        ...c,
        {
          itemId: item.id,
          name: item.name,
          qty: 1,
          unit: item.saleUnit || item.baseUnit,
          unitPrice: item.price,
          discountPct: 0,
          imageUrl: item.imageUrl,
        },
      ];
    });
  };

  /** Inverse of `add`: decreases the item's line qty by 1. When the
   *  line's qty drops to 0 the line is removed from the ticket
   *  entirely. No-op when the item isn't in the cart. */
  const dec = (item: Item) => {
    setCart((c) => {
      const existing = c.find((x) => x.itemId === item.id);
      if (!existing) return c;
      if (existing.qty <= 1) return c.filter((x) => x.itemId !== item.id);
      return c.map((x) => (x.itemId === item.id ? { ...x, qty: x.qty - 1 } : x));
    });
  };

  /**
   * Reusable click / keyboard handler for the POS minus overlay. Kept
   * as a plain function so it can be attached to a `<span role="button">`
   * inside the outer `<button>` without producing invalid nested-button
   * HTML. Always calls `stopPropagation` so the add-to-cart handler on
   * the outer button never fires.
   */
  const handleDec = (item: Item) => (e: React.SyntheticEvent) => {
    e.stopPropagation();
    if ("key" in e) {
      const key = (e as React.KeyboardEvent).key;
      if (key !== "Enter" && key !== " ") return;
      (e as React.KeyboardEvent).preventDefault();
    }
    dec(item);
  };

  const handleSearchKeydown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const q = query.trim().toLowerCase();
    if (!q) return;
    const direct =
      sellable.find((i) => (i.barcode || "").toLowerCase() === q) ||
      sellable.find((i) => i.sku.toLowerCase() === q);
    if (direct) { add(direct); setQuery(""); toast.success(`Added ${direct.name}`); return; }
    if (filtered.length === 1) { add(filtered[0]); setQuery(""); toast.success(`Added ${filtered[0].name}`); }
  };

  /** Camera/manual scan: add an exact barcode/SKU match, else show matches. */
  const handleScan = (code: string) => {
    const q = code.trim().toLowerCase();
    if (!q) return;
    const direct =
      sellable.find((i) => (i.barcode || "").toLowerCase() === q) ||
      sellable.find((i) => i.sku.toLowerCase() === q);
    if (direct) {
      add(direct);
      setQuery("");
      toast.success(`Added ${direct.name}`);
      return;
    }
    setQuery(code);
    toast.info("No exact match — showing similar items");
  };

  const setQty = (id: string, value: number) =>
    // Keep the item in the ticket even when qty is 0 or blank. This
    // allows the user to clear the field and re-type without losing
    // discount / customer / line-context state. Checkout guard
    // downstream refuses to complete sales that still have zero-qty rows.
    setCart((c) => c.map((l) => (l.itemId === id ? { ...l, qty: Math.max(0, value) } : l)));

  // Inline discount is applied PER UNIT (not per line total): entering "5"
  // in amount mode means "take $5 off each unit" — so a qty=10 line at
  // $20/unit with a $5 unit-discount produces a $50 line-discount total.
  // Percentage mode is unaffected (it's already unit-relative by nature).
  const setLineDiscount = (id: string, value: number) =>
    setCart((c) =>
      c.map((l) => {
        if (l.itemId !== id) return l;
        let pct = value;
        if (discountType === "amount") pct = l.unitPrice > 0 ? (value / l.unitPrice) * 100 : 0;
        return { ...l, discountPct: Math.max(0, Math.min(100, pct)) };
      })
    );

  const removeLine = (id: string) => setCart((c) => c.filter((l) => l.itemId !== id));
  const clearCart = () => {
    // Explicit Clear is the ONLY path (besides successful checkout) that
    // is allowed to remove a resumed held ticket from persistent storage.
    if (resumedHeldTicketId) {
      deleteHeld.mutate(resumedHeldTicketId);
      setResumedHeldTicketId(null);
    }
    setCart([]);
    setOrderDiscountPct(0);
    setOrderDiscountAmount(0);
    setLoyaltyRedeem(0);
    clearPosDraft(draftStorage);
  };

  const redeemValue = settings?.loyalty.enabled ? loyaltyRedeem * (settings?.loyalty.dollarPerPoint || 0) : 0;

  const preDiscountTotal = cart.reduce((s, l) => s + l.qty * l.unitPrice * (1 - l.discountPct / 100), 0);
  const effectiveOrderPct = discountType === "amount"
    ? preDiscountTotal > 0 ? Math.min(100, (orderDiscountAmount / preDiscountTotal) * 100) : 0
    : orderDiscountPct;

  const totals = settings
    ? computeTotals(cart, effectiveOrderPct, settings, redeemValue)
    : { subtotal: 0, lineDiscountTotal: 0, orderDiscountValue: 0, tax: 0, total: 0 };

  const checkout = async (method: PaymentMethod, amountPaid?: number) => {
    if (!cart.length) return toast.error("Cart is empty");
    if (cart.some((l) => l.qty <= 0))
      return toast.error("One or more items have a blank / zero quantity — fix them before checkout");
    // Central UOM gate (§4-7): discrete sale UOMs reject fractional qtys.
    {
      const { validateTransactionQty } = await import("@/lib/uom");
      for (const l of cart) {
        const it = items.find((i) => i.id === l.itemId);
        const check = validateTransactionQty(
          l.qty,
          it?.saleUnit || it?.baseUnit || "pc",
          uoms,
          { itemAllowDecimalQty: it?.allowDecimalQty, label: it?.name || "Item" }
        );
        if (!check.ok) return toast.error(check.reason);
      }
    }
    if (!settings) return toast.error("Settings still loading");
    if (loyaltyRedeem > availablePoints) return toast.error("Not enough loyalty points");
    if ((method === "credit" || method === "partial") && !customerId)
      return toast.error("Select a customer to accept credit/partial sales");
    const { resolveActor } = await import("@/lib/actor");
    const actor = resolveActor(profile, user);
    if (!actor) return toast.error("Account not ready — reload and try again");
    const checkoutInput = {
      lines: cart.map(({ imageUrl: _i, ...rest }) => rest),
      customerId: customerId || null,
      customerName: selectedCustomer?.name || "Walk-in Customer",
      orderDiscountPct: effectiveOrderPct,
      paymentMethod: method,
      cashierId: actor.id || null,
      cashierName: actor.name,
      cashierEmail: profile?.email || user?.email,
      cashierRole: actor.role,
      items,
      settings,
      loyaltyRedeemPoints: loyaltyRedeem,
      amountPaid,
      uoms,
      conversions,
    };
    // Stamp the document number now so the instant offline receipt and the
    // later server write carry the identical number (the mutation keeps a
    // pre-stamped input as-is).
    const { stampCheckoutInput, buildLocalSale } = await import("@/lib/saleWrite");
    let stampedInput: CheckoutInput = checkoutInput;
    try {
      stampedInput = stampCheckoutInput(checkoutInput);
      const sale = await completeSale.mutateAsync(stampedInput);
      setCompletedSale(sale);
      // Open the existing receipt preview behind the success circle. "No
      // preview" (0) still mounts it invisibly when auto-print needs a portal.
      if (
        (settings.printer.receiptPreviewMs ?? 2000) !== 0 ||
        settings.printer.autoPrint
      ) {
        setLastReceipt(sale);
      }
      // Transaction confirmed: safe to release the resumed held ticket.
      if (resumedHeldTicketId) {
        deleteHeld.mutate(resumedHeldTicketId);
        setResumedHeldTicketId(null);
      }
      setCart([]);
      setOrderDiscountPct(0);
      setOrderDiscountAmount(0);
      setLoyaltyRedeem(0);
      setCustomerId("");
      setShowCartMobile(false);
      setPartialOpen(false);
      clearPosDraft(draftStorage);
      // The premium completion surface replaces the old success toast.
      // Transaction-allowance policy (Item 7): evaluate the cashier's
      // period count in the background — never blocks the receipt.
      if (settings?.transactionAllowancePolicy?.enabled && actor.id) {
        const policy = settings.transactionAllowancePolicy;
        const pending = settings.pendingTxnAllowances || [];
        evaluateTxnPolicyForCashier({
          cashierId: actor.id,
          employees,
          policy,
          pending,
          actor: { id: actor.id, name: actor.name },
          persistPending: (next) =>
            updateSettings.mutateAsync({ pendingTxnAllowances: next }),
          onAward: (outcome) => {
            if (outcome.status === "pending") {
              toast.info(
                `Allowance auto-considered for ${outcome.award.employeeName} — awaiting ${policy.approverRole === "accountant" ? "accounting" : "manager"} approval`
              );
            } else {
              toast.success(
                `Transaction allowance posted: ${formatCurrency(outcome.amount, settings.currency)}`
              );
            }
          },
        }).catch(() => {
          /* policy engine must never break checkout */
        });
      }
    } catch (err) {
      const { isOfflineQueuedError } = await import("@/hooks/useOfflineQueue");
      const queueId = isOfflineQueuedError(err);
      if (queueId) {
        // Offline: open the receipt instantly from the same numbers the
        // server write will produce — the customer doesn't wait for internet.
        const local = buildLocalSale(stampedInput, queueId);
        setCompletedSale(local);
        if (
          (settings.printer.receiptPreviewMs ?? 2000) !== 0 ||
          settings.printer.autoPrint
        ) {
          setLastReceipt(local);
        }
        setCart([]);
        setOrderDiscountPct(0);
        setOrderDiscountAmount(0);
        setLoyaltyRedeem(0);
        setCustomerId("");
        setShowCartMobile(false);
        setPartialOpen(false);
        clearPosDraft(draftStorage);
        return;
      }
      console.error("checkout failed", err);
      toast.error(toErrorMessage(err, "Checkout failed"));
    }
  };

  const hold = async () => {
    if (!cart.length) return toast.error("Nothing to hold");
    if (!holdLabel.trim()) return toast.error("Give this ticket a name");
    const { resolveActor: resolveHoldActor } = await import("@/lib/actor");
    const holdActor = resolveHoldActor(profile, user);
    if (!holdActor) return toast.error("Account not ready — reload and try again");
    try {
      await holdTicket.mutateAsync({
        label: holdLabel.trim(),
        cashierId: holdActor.id || null,
        cashierName: holdActor.name,
        customerId: customerId || null,
        customerName: selectedCustomer?.name || "Walk-in Customer",
        lines: cart.map(({ imageUrl: _i, ...rest }) => rest),
        orderDiscountPct: effectiveOrderPct,
      });
      toast.success(`Ticket "${holdLabel.trim()}" held`);
      clearCart(); setHoldDialogOpen(false); setHoldLabel("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to hold");
    }
  };

  const resume = (ticketId: string) => {
    const t = heldTickets.find((h) => h.id === ticketId);
    if (!t) return;
    const withMeta: CartLine[] = t.lines.map((l) => {
      const it = items.find((i) => i.id === l.itemId);
      return { ...l, imageUrl: it?.imageUrl };
    });
    setCart(withMeta);
    setOrderDiscountPct(t.orderDiscountPct);
    setCustomerId(t.customerId || "");
    setShowHeldPanel(false);
    // Ticket persistence guarantee: the underlying held ticket row is NOT
    // removed on resume. It stays in storage until either the checkout
    // completes or the user explicitly clears the cart.
    setResumedHeldTicketId(ticketId);
    toast.success(`Resumed "${t.label}" — still on hold until you confirm or clear`);
  };

  useEffect(() => { if (loyaltyRedeem > availablePoints) setLoyaltyRedeem(0); }, [availablePoints, loyaltyRedeem]);

  const draftRestored = useRef(false);
  useEffect(() => {
    if (draftRestored.current || itemsLoading) return;
    draftRestored.current = true;
    if (!initialDraft.lines.length) return;
    const { lines, dropped } = reconcilePosDraftLines(initialDraft.lines, items);
    setCart(lines.map((line) => ({ ...line, imageUrl: items.find((i) => i.id === line.itemId)?.imageUrl })));
    if (dropped > 0) {
      toast.info(
        dropped === 1
          ? "1 item from your saved ticket is no longer available and was removed"
          : `${dropped} items from your saved ticket are no longer available and were removed`,
      );
    }
  }, [itemsLoading, items, initialDraft]);

  useEffect(() => {
    savePosDraft(draftStorage, { lines: cart, customerId, orderDiscountPct, orderDiscountAmount, loyaltyRedeem });
  }, [cart, customerId, orderDiscountPct, orderDiscountAmount, loyaltyRedeem]);

  if (itemsLoading) return <div className="p-8 text-ink-mute">Loading catalog...</div>;

  if (sellable.length === 0) {
    return (
      <div className="p-4 md:p-8">
        <div className="paper-card p-8 md:p-10 max-w-2xl mx-auto text-center">
          <div className="w-16 h-16 rounded-full bg-magenta-reg/10 flex items-center justify-center mx-auto">
            <Receipt className="w-7 h-7 text-magenta-reg" />
          </div>
          <h2 className="font-display text-xl md:text-2xl font-bold mt-4">Your catalog is empty</h2>
          <p className="text-ink-mute text-sm mt-2 max-w-md mx-auto">
             Add items in the Inventory page — or seed sample business data so you can explore right away.
          </p>
          <div className="mt-6 flex flex-col md:flex-row items-center justify-center gap-3">
            <button
              disabled={seedSample.isPending}
              onClick={() =>
                seedSample.mutate(undefined, {
                  onSuccess: () => toast.success("Sample data loaded"),
                  onError: (e) => toast.error(e instanceof Error ? e.message : "Seed failed"),
                })
              }
              className="btn btn-primary"
            >
              {seedSample.isPending ? "Loading..." : "Load sample data"}
            </button>
            <Link to="/inventory" className="btn btn-outline">Go to Inventory</Link>
          </div>
        </div>
      </div>
    );
  }

  const cartCount = cart.reduce((s, l) => s + l.qty, 0);
  const canCredit = can("pos.credit") || can("pos.sell");
  const canManageCategories = can("settings.categories") || can("settings.manage");
  // Preset currency symbol from Settings → Base Operating Currency, shown
  // inside each ticket discount box.
  const currencySymbol =
    currencyByCode(settings?.currency || "USD")?.symbol || settings?.currency || "";

  // Ticket panel widens by 15% (330 -> 380) whenever the sidebar is collapsed.
  // Expanding the sidebar automatically snaps it back to 330.
  const ticketWidthClass = sidebarCollapsed ? "md:w-[380px]" : "md:w-[330px]";

  return (
    <div className="h-full flex flex-col md:flex-row relative">
      <section
        className={cn(
          "flex-1 min-w-0 p-2.5 md:p-6 flex flex-col gap-2 md:gap-4 overflow-hidden",
          // Mobile view switch: hide the catalog when the user has
          // toggled into the Ticket view. Desktop always shows both.
          showCartMobile && "hidden md:flex"
        )}
      >
        <OnboardingChecklist />
        <SubNav
          items={[
            { to: "/", label: "POS", icon: POSIcon, end: true },
            { to: "/sales-report", label: "Report", icon: SalesReportIcon },
            { to: "/held", label: `Held (${heldTickets.length})`, icon: PauseIcon },
            { to: "/quotes", label: "Quotes", icon: QuotesIcon },
          ]}
        />

        {/* Mobile-only Products ↔ Ticket switch. State (cart, customer,
            qtys, discounts) is fully preserved across switches because
            it lives entirely in React state above. */}
        <div className="md:hidden paper-card p-0.5 flex items-center gap-0.5">
          <button
            onClick={() => setShowCartMobile(false)}
            className={cn(
              "flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-md text-[10px] font-semibold uppercase tracking-widest transition",
              !showCartMobile ? "bg-ink text-paper" : "text-ink-mute"
            )}
          >
            <Package className="w-3.5 h-3.5" /> Products
          </button>
          <button
            onClick={() => setShowCartMobile(true)}
            className={cn(
              "flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-md text-[10px] font-semibold uppercase tracking-widest transition",
              showCartMobile ? "bg-ink text-paper" : "text-ink-mute"
            )}
          >
            <Receipt className="w-3.5 h-3.5" /> Ticket ({cart.reduce((s, l) => s + l.qty, 0)})
          </button>
        </div>
        <div className="paper-card p-2 md:p-4 space-y-1.5 md:space-y-3">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-mute pointer-events-none" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKeydown}
              placeholder="Scan barcode or search products, SKUs and press Enter..."
              className="pos-search pr-16"
            />
            <BarcodeScanButton
              onScan={handleScan}
              label="Scan barcode into the sales counter"
              className="absolute right-2 top-1/2 -translate-y-1/2"
            />
          </div>

          <div className="flex items-center gap-1.5 md:gap-2 md:hidden">
            <GlassSelect
              value={category}
              onChange={setCategory}
              ariaLabel="Product category"
              options={categories.map((c) => ({
                value: c,
                label: c === "All" ? "All categories" : c,
              }))}
              className="input input-sm select-glass flex-1 min-w-0"
            />
            {canManageCategories && (
              <button onClick={() => setCategoryManagerOpen(true)} className="btn btn-outline btn-sm shrink-0" title="Manage categories">
                <SettingsIcon className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="hidden md:inline text-xs">Manage</span>
              </button>
            )}
            {/* Compact layout cycler on mobile keeps the filter card to one
                line; desktop keeps the full three-button group below. */}
            <button
              onClick={() =>
                setViewMode(
                  viewMode === "thumbnails" ? "tiles" : viewMode === "tiles" ? "list" : "thumbnails"
                )
              }
              className="btn btn-outline btn-sm shrink-0 md:hidden"
              title={`Layout: ${viewMode}`}
              aria-label={`Change layout (currently ${viewMode})`}
            >
              {viewMode === "thumbnails" ? (
                <ImageIcon className="w-3.5 h-3.5" />
              ) : viewMode === "tiles" ? (
                <LayoutGrid className="w-3.5 h-3.5" />
              ) : (
                <ListIcon className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-1 -mx-1 px-1">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    "chip border transition whitespace-nowrap px-3 h-8 shrink-0",
                    category === c ? "bg-ink text-paper border-ink" : "border-line hover:border-ink"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
            {canManageCategories && (
              <button onClick={() => setCategoryManagerOpen(true)} className="btn btn-outline h-8 px-2 shrink-0" title="Manage categories">
                <SettingsIcon className="w-3.5 h-3.5" />
                <span className="hidden md:inline text-xs">Manage</span>
              </button>
            )}
          </div>

          <div className="hidden md:flex items-center justify-end">
            <div className="flex items-center gap-1 border rounded-md p-1">
              <ViewButton active={viewMode === "thumbnails"} onClick={() => setViewMode("thumbnails")} icon={ImageIcon} label="Thumbs" />
              <ViewButton active={viewMode === "tiles"} onClick={() => setViewMode("tiles")} icon={LayoutGrid} label="Tiles" />
              <ViewButton active={viewMode === "list"} onClick={() => setViewMode("list")} icon={ListIcon} label="List" />
            </div>
          </div>
          {/* Mobile context line: result count + ticket cue, no extra card. */}
          <div className="md:hidden flex items-center justify-between text-[9px] leading-none text-ink-mute pt-0.5">
            <span>{filtered.length} of {sellable.length} products</span>
            <span>{cartCount > 0 ? `${cartCount} in ticket` : "Tap a product to add"}</span>
          </div>
        </div>

        <div className="flex-1 overflow-auto pr-1 scroll-lined">
          {filtered.length === 0 ? (
            <div className="paper-card p-8 md:p-12 text-center text-ink-mute">
              No products match "{query}"
            </div>
          ) : viewMode === "tiles" ? (
            <div className="pos-tile-grid">
              {filtered.map((item) => {
                const inCart = cart.find((l) => l.itemId === item.id);
                return (
                  <button key={item.id} onClick={() => add(item)} className={cn("pos-tile", inCart && "pos-selected")}>
                    <div className="pos-tile__media">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                      ) : (
                        <Package className="w-8 h-8 text-ink-mute" />
                      )}
                      {inCart && (
                        <>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={handleDec(item)}
                            onKeyDown={handleDec(item)}
                            className="absolute top-1.5 left-1.5 z-10 w-7 h-7 rounded-full bg-ink text-paper shadow-md flex items-center justify-center hover:bg-danger active:scale-95 transition cursor-pointer"
                            title="Decrease qty (removes at 0)"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </span>
                          <span className="absolute top-1.5 right-1.5 min-w-[24px] h-6 px-1.5 rounded-full bg-magenta-reg text-white text-[11px] font-bold flex items-center justify-center">
                            × {inCart.qty}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="pos-tile__body">
                      <div className="pos-tile__name">{item.name}</div>
                      <div className="pos-tile__price"><MoneyText value={formatCurrency(item.price, settings?.currency)} /></div>
                      <div className="pos-tile__stock">{stockLabelFor(item)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : viewMode === "list" ? (
            <div className="paper-card divide-y">
              {filtered.map((item) => {
                const inCart = cart.find((l) => l.itemId === item.id);
                return (
                  <button key={item.id} onClick={() => add(item)} className="w-full flex items-center gap-3 p-3 hover:bg-paper/50 transition text-left">
                    <span className={cn("chip text-[10px] px-2 py-0 shrink-0", ITEM_TYPE_META[item.itemType]?.color)}>
                      {ITEM_TYPE_META[item.itemType]?.short}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{item.name}</div>
                      <div className="text-[11px] text-ink-mute truncate">{item.category} · {item.sku}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="num font-bold"><MoneyText value={formatCurrency(item.price, settings?.currency)} /></div>
                      <div className="text-[10px] text-ink-mute uppercase tracking-wider">{stockLabelFor(item)}</div>
                    </div>
                    {inCart && (
                      <>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={handleDec(item)}
                          onKeyDown={handleDec(item)}
                          className="w-7 h-7 rounded-full bg-ink text-paper shadow flex items-center justify-center hover:bg-danger active:scale-95 transition cursor-pointer shrink-0"
                          title="Decrease qty (removes at 0)"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </span>
                        <span className="chip bg-magenta-reg/10 text-magenta-reg border border-magenta-reg/30 text-xs num shrink-0">× {inCart.qty}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="pos-thumb-grid">
              {filtered.map((item) => {
                const inCart = cart.find((l) => l.itemId === item.id);
                const stockLabel = stockLabelFor(item);
                return (
                  <button key={item.id} onClick={() => add(item)} className={cn("pos-thumb", inCart && "pos-selected")} title={`${item.name} — ${formatCurrency(item.price, settings?.currency)}`}>
                    <div className="pos-thumb__media">
                      {item.imageUrl ? (<img src={item.imageUrl} alt={item.name} />) : (<Package className="w-6 h-6 text-ink-mute" />)}
                    </div>
                    <div className="pos-thumb__ribbon">
                      <div className="pos-thumb__name">{item.name}</div>
                      <div className="pos-thumb__price"><MoneyText value={formatCurrency(item.price, settings?.currency)} /></div>
                      <div className="pos-thumb__stock">{stockLabel}</div>
                    </div>
                    {inCart && (
                      <>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={handleDec(item)}
                          onKeyDown={handleDec(item)}
                          className="absolute top-1 left-1 z-10 w-6 h-6 rounded-full bg-ink text-paper shadow flex items-center justify-center hover:bg-danger active:scale-95 transition cursor-pointer"
                          title="Decrease qty (removes at 0)"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-3 h-3" />
                        </span>
                        <span className="absolute top-1 right-1 min-w-[20px] h-5 px-1 rounded-full bg-magenta-reg text-white text-[10px] font-bold flex items-center justify-center">
                          {inCart.qty}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {cart.length > 0 && !showCartMobile && (
        <button
          onClick={() => setShowCartMobile(true)}
          className="md:hidden fixed bottom-20 right-4 z-30 rounded-full bg-magenta-reg text-white shadow-lg px-4 py-3 flex items-center gap-2 font-bold animate-fade-in"
        >
          <Receipt className="w-4 h-4" />
          <span className="num"><MoneyText value={formatCurrency(totals.total, settings?.currency)} /></span>
          <span className="chip bg-white/20 text-white text-[10px] px-2 num">{cartCount}</span>
        </button>
      )}

      <aside
        className={cn(
          "bg-card flex flex-col shrink-0 pos-ticket transition-[width] duration-200",
          ticketWidthClass,
          "md:border-l md:relative md:h-full md:translate-x-0",
          "fixed inset-y-0 right-0 w-full max-w-md z-40 border-l shadow-2xl transition-transform md:shadow-none",
          showCartMobile ? "translate-x-0" : "translate-x-full md:translate-x-0"
        )}
      >
        <div className="p-2.5 md:p-4 border-b">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCartMobile(false)}
              aria-label="Back to products"
              title="Back to products — your ticket is kept"
              className="md:hidden inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-full border border-magenta-reg bg-magenta-reg text-white shadow-sm transition active:scale-95 hover:brightness-105"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-[9px] md:text-[10px] uppercase tracking-widest text-ink-mute leading-none">Current ticket</div>
              <div className="font-display text-sm md:text-lg font-bold truncate" title="Receipt/invoice number is assigned automatically at checkout (R/I + timestamp)">
                {settings?.invoice.prefix}Auto
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {can("pos.hold") && (
                <button onClick={() => setShowHeldPanel((s) => !s)} className="btn btn-outline relative h-8 px-2">
                  <PauseCircle className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline text-xs">Held</span>
                  {heldTickets.length > 0 && (
                    <span className="chip bg-magenta-reg text-white h-5 min-w-[20px] px-1.5 text-[10px]">{heldTickets.length}</span>
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="mt-1.5 md:mt-2 flex items-center gap-2">
            <CustomerCombobox
              customers={customers}
              value={customerId}
              onChange={(id) => { setCustomerId(id); setLoyaltyRedeem(0); }}
              onAddNew={() => setCustomerModalOpen(true)}
            />
          </div>
        </div>

        {showHeldPanel && (
          <div className="border-b p-3 bg-paper/50 max-h-56 overflow-auto scroll-lined">
            <div className="text-[10px] uppercase tracking-widest text-ink-mute mb-2">Held tickets · tap to resume</div>
            {heldTickets.length === 0 ? (
              <div className="text-xs text-ink-mute">No tickets on hold.</div>
            ) : (
              <div className="space-y-2">
                {heldTickets.map((t) => {
                  const total = t.lines.reduce((s, l) => s + l.qty * l.unitPrice * (1 - l.discountPct / 100), 0);
                  return (
                    <div key={t.id} className="paper-card p-2 flex items-center justify-between">
                      <button onClick={() => resume(t.id)} className="text-left flex-1 min-w-0">
                        <div className="font-semibold truncate text-xs">{t.label}</div>
                        <div className="text-[10px] text-ink-mute truncate">
                          {t.cashierName} · {t.lines.length} items · {formatCurrency(total, settings?.currency)}
                        </div>
                      </button>
                      <button onClick={() => deleteHeld.mutate(t.id)} className="btn btn-ghost h-7 w-7 p-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-auto scroll-lined pos-ticket__body">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-8">
              <div className="relative w-20 h-20 rounded-full bg-paper border flex items-center justify-center">
                <Receipt className="w-8 h-8 text-ink-mute" />
              </div>
              <p className="mt-3 font-semibold">Ticket is empty</p>
              <p className="text-sm text-ink-mute mt-1">Scan a barcode, or tap a product to add it.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-card">
                <tr className="text-left text-[9px] uppercase tracking-widest text-ink-mute border-b">
                  <th className="pl-3 py-1.5">Item</th>
                  <th className="py-1.5 text-center w-20">Qty</th>
                  <th className="py-1.5 text-right">Price</th>
                  <th className="py-1.5 text-right pr-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {cart.map((l) => {
                  const lineTotal = l.qty * l.unitPrice * (1 - l.discountPct / 100);
                  // Discount displayed inline is the PER-UNIT amount so it
                  // matches what the cashier just keyed in — total discount
                  // for the line = perUnitDiscountAmount * qty.
                  const perUnitDiscountAmount = l.unitPrice * (l.discountPct / 100);
                  // Grouped discount text for this line. Long amounts drop the
                  // currency symbol and take the width it frees, so the figure
                  // is never clipped inside the narrow row chip.
                  const discValue =
                    rawDiscountMap[l.itemId] !== undefined
                      ? rawDiscountMap[l.itemId]
                      : perUnitDiscountAmount === 0
                      ? ""
                      : formatAmountInput(
                          String(Math.round(perUnitDiscountAmount * 100) / 100)
                        );
                  const discLong = discValue.replace(/[^\d]/g, "").length > 4;
                  return (
                    <tr key={l.itemId} className="border-b hover:bg-paper/30">
                      <td className="pl-3 py-1 pr-1">
                        <div className="min-w-0">
                          <div className="font-semibold text-xs leading-tight break-words">
                            {wrapByWords(l.name, 20).map((line, i) => (
                              <div key={i}>{line}</div>
                            ))}
                          </div>
                          <div>
                            {allowLineDiscount && (
                              <div className="flex items-center gap-1 mt-0.5">
                                {discountType === "percentage" ? (
                                  <div className="flex items-center h-5 rounded border bg-transparent px-1">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      placeholder="disc."
                                      value={
                                        rawDiscountMap[l.itemId] !== undefined
                                          ? rawDiscountMap[l.itemId]
                                          : l.discountPct === 0
                                          ? ""
                                          : String(Math.round(l.discountPct * 100) / 100)
                                      }
                                      onChange={(e) => {
                                        let v = e.target.value.replace(/[^\d.]/g, "");
                                        const parts = v.split(".");
                                        if (parts.length > 2)
                                          v = parts[0] + "." + parts.slice(1).join("");
                                        v = v.replace(/^0+(?=\d)/, "");
                                        setRawDiscountMap((m) => ({ ...m, [l.itemId]: v }));
                                        const num = v === "" || v === "." ? 0 : parseFloat(v);
                                        setLineDiscount(l.itemId, isFinite(num) ? num : 0);
                                      }}
                                      onBlur={() =>
                                        setRawDiscountMap((m) => {
                                          const n = { ...m };
                                          delete n[l.itemId];
                                          return n;
                                        })
                                      }
                                      className="w-12 h-full text-[8px] md:text-[10px] bg-transparent outline-none num text-right px-0 placeholder:text-ink-mute/70 placeholder:text-left"
                                    />
                                    <Percent className="w-2.5 h-2.5 ml-0.5 shrink-0 text-ink-mute" />
                                  </div>
                                ) : (
                                  <div className="flex items-center h-5 rounded border bg-transparent pl-1 pr-1">
                                    {!discLong && (
                                      <span className="text-[7.2px] md:text-[9px] leading-none text-ink-mute whitespace-nowrap mr-0.5 shrink-0">
                                        {currencySymbol}
                                      </span>
                                    )}
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      placeholder="disc."
                                      title={`Discount per unit (${settings?.currency})`}
                                      value={discValue}
                                      onChange={(e) => {
                                        const formatted = formatAmountInput(e.target.value);
                                        setRawDiscountMap((m) => ({ ...m, [l.itemId]: formatted }));
                                        const num = parseFloat(formatted.replace(/,/g, ""));
                                        setLineDiscount(l.itemId, isFinite(num) ? num : 0);
                                      }}
                                      onBlur={() =>
                                        setRawDiscountMap((m) => {
                                          const n = { ...m };
                                          delete n[l.itemId];
                                          return n;
                                        })
                                      }
                                      className={cn(
                                        "h-full text-[8px] md:text-[10px] bg-transparent outline-none num text-right px-0 placeholder:text-ink-mute/70 placeholder:text-left",
                                        discLong ? "w-16" : "w-12"
                                      )}
                                    />
                                  </div>
                                )}
                                <button onClick={() => removeLine(l.itemId)} className="text-ink-mute hover:text-danger ml-0.5">
                                  <Trash2 className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-1 text-center">
                        {(() => {
                          const it = items.find((i) => i.id === l.itemId);
                          const allowDec = !isUomDiscrete(
                            it?.saleUnit || it?.baseUnit || "pc",
                            uoms,
                            it?.allowDecimalQty
                          );
                          const raw = rawQtyMap[l.itemId];
                          const display =
                            raw !== undefined
                              ? raw
                              : l.qty === 0
                              ? ""
                              : allowDec
                              ? String(l.qty)
                              : formatIntegerWithCommas(l.qty);
                          return (
                            <input
                              type="text"
                              inputMode={allowDec ? "decimal" : "numeric"}
                              placeholder="0"
                              value={display}
                              onChange={(e) => {
                                let val = e.target.value;
                                if (allowDec) {
                                  val = val.replace(/[^\d.]/g, "");
                                  const parts = val.split(".");
                                  if (parts.length > 2)
                                    val = parts[0] + "." + parts.slice(1).join("");
                                  const num =
                                    val === "" || val === "." ? 0 : parseFloat(val);
                                  setRawQtyMap((m) => ({ ...m, [l.itemId]: val }));
                                  setQty(
                                    l.itemId,
                                    isFinite(num) ? Math.max(0, num) : 0
                                  );
                                } else {
                                  const digits = val
                                    .replace(/[^\d]/g, "")
                                    .replace(/^0+(?=\d)/, "");
                                  const num = digits === "" ? 0 : parseInt(digits, 10);
                                  const capped = Math.min(99999, Math.max(0, num));
                                  setRawQtyMap((m) => ({
                                    ...m,
                                    [l.itemId]:
                                      digits === "" ? "" : formatIntegerWithCommas(capped),
                                  }));
                                  setQty(l.itemId, capped);
                                }
                              }}
                              onBlur={() =>
                                setRawQtyMap((m) => {
                                  const n = { ...m };
                                  delete n[l.itemId];
                                  return n;
                                })
                              }
                              onKeyDown={(e) => {
                                // Integer stepping via arrow keys (up = +1, down = -1)
                                if (e.key === "ArrowUp") {
                                  e.preventDefault();
                                  const next = allowDec
                                    ? Math.floor(l.qty) + 1
                                    : l.qty + 1;
                                  setQty(l.itemId, next);
                                  setRawQtyMap((m) => {
                                    const n = { ...m };
                                    delete n[l.itemId];
                                    return n;
                                  });
                                } else if (e.key === "ArrowDown") {
                                  e.preventDefault();
                                  const next = allowDec
                                    ? Math.max(0, Math.floor(l.qty) - 1)
                                    : Math.max(0, l.qty - 1);
                                  setQty(l.itemId, next);
                                  setRawQtyMap((m) => {
                                    const n = { ...m };
                                    delete n[l.itemId];
                                    return n;
                                  });
                                }
                                // Character filtering (integer inputs)
                                if (!allowDec) {
                                  const allowed = [
                                    "Backspace",
                                    "Delete",
                                    "Tab",
                                    "Enter",
                                    "ArrowLeft",
                                    "ArrowRight",
                                    "Home",
                                    "End",
                                  ];
                                  if (allowed.includes(e.key) || e.metaKey || e.ctrlKey) return;
                                  if (!/^[0-9]$/.test(e.key)) e.preventDefault();
                                }
                              }}
                              className={cn(
                                "w-16 h-7 text-center num font-semibold border rounded outline-none bg-transparent text-xs px-1",
                                l.qty === 0 && "border-warning/60 text-warning"
                              )}
                            />
                          );
                        })()}
                      </td>
                      <td className="py-1 text-right num text-ink-mute text-xs">{formatNumber(l.unitPrice, settings?.currency)}</td>
                      <td className="py-1 text-right pr-3 num font-semibold text-xs">{formatNumber(lineTotal, settings?.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t bg-card p-3 md:p-4 space-y-2 safe-bottom">
          {allowOrderDiscount && cart.length > 0 && (
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="pos-discount-input" className="label text-[10px]">Order discount ({discountType === "amount" ? "amount" : "%"})</label>
              <div className="flex items-center gap-1 border rounded-md pl-2 h-8">
                {discountType === "amount" ? (<DollarSign className="w-3 h-3 text-ink-mute" />) : (<Percent className="w-3 h-3 text-ink-mute" />)}
                <input
                  id="pos-discount-input"
                  type="text"
                  inputMode="decimal"
                  value={
                    discountType === "amount"
                      ? orderDiscountRaw ??
                        (orderDiscountAmount === 0 ? "" : formatAmountInput(String(orderDiscountAmount)))
                      : String(orderDiscountPct)
                  }
                  onChange={(e) => {
                    if (discountType === "amount") {
                      const formatted = formatAmountInput(e.target.value);
                      setOrderDiscountRaw(formatted);
                      const n = parseFloat(formatted.replace(/,/g, ""));
                      setOrderDiscountAmount(Math.min(preDiscountTotal, isFinite(n) ? n : 0));
                    } else {
                      setOrderDiscountPct(Number(e.target.value.replace(/[^\d.]/g, "")) || 0);
                    }
                  }}
                  onBlur={() => setOrderDiscountRaw(null)}
                  className="w-16 h-full text-xs bg-transparent outline-none num text-right pr-1"
                />
              </div>
            </div>
          )}

          {settings?.loyalty.enabled && selectedCustomer && availablePoints > 0 && (
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="pos-loyalty-input" className="label text-[10px] inline-flex items-center gap-1">
                <Gift className="w-3 h-3" />Redeem points ({availablePoints})
              </label>
              <input id="pos-loyalty-input" type="number" min={0} max={availablePoints} value={loyaltyRedeem} onChange={(e) => setLoyaltyRedeem(Math.min(availablePoints, Math.max(0, Number(e.target.value))))} className="input h-8 w-20 num text-right text-xs" />
            </div>
          )}

          <div className="dashed-divider" />

          <div className="pos-totals-tight">
            <Row label="Subtotal" value={formatNumber(totals.subtotal, settings?.currency)} />
            {totals.lineDiscountTotal > 0 && (
              <Row label="Line discounts" value={"− " + formatNumber(totals.lineDiscountTotal, settings?.currency)} subtle />
            )}
            {totals.orderDiscountValue > 0 && (
              <Row label="Order discount" value={"− " + formatNumber(totals.orderDiscountValue, settings?.currency)} subtle />
            )}
            {redeemValue > 0 && (
              <Row label={`Loyalty (${loyaltyRedeem} pts)`} value={"− " + formatNumber(redeemValue, settings?.currency)} subtle />
            )}
            <Row label={`Tax (${settings?.taxRate}%)`} value={formatNumber(totals.tax, settings?.currency)} subtle />
          </div>

          <div className="flex items-baseline justify-between pt-1">
            <div className="font-display text-base font-semibold">Total</div>
            <div className="num text-xl font-bold"><MoneyText value={formatCurrency(totals.total, settings?.currency)} /></div>
          </div>

          {canViewCosts && cart.length > 0 && (
            <div className="text-[9px] text-ink-mute uppercase tracking-widest flex justify-between">
              <span>COGS (admin/manager)</span>
              <span className="num">
                {formatNumber(cart.reduce((s, l) => { const it = items.find((i) => i.id === l.itemId); return s + (it?.cost || 0) * l.qty; }, 0), settings?.currency)}
              </span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-1 pt-1">
            <button disabled={completeSale.isPending} className="pos-pay-btn" onClick={() => checkout("cash")}>
              <Banknote /> Cash
            </button>
            <button disabled={completeSale.isPending} className="pos-pay-btn" onClick={() => checkout("card")}>
              <CreditCard /> Card
            </button>
            <button disabled={completeSale.isPending} className="pos-pay-btn" onClick={() => checkout("transfer")}>
              <ArrowLeftRight /> Wire
            </button>
          </div>

          {canCredit && (
            <div className="grid grid-cols-2 gap-1">
              <button disabled={completeSale.isPending} className="pos-pay-btn is-credit" onClick={() => checkout("credit")}>
                <FileText /> Credit
              </button>
              <button disabled={completeSale.isPending} className="pos-pay-btn" onClick={() => setPartialOpen(true)}>
                <Wallet /> Partial
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-1.5">
            {can("pos.hold") && cart.length > 0 && (
              <button onClick={() => setHoldDialogOpen(true)} className="btn btn-ghost h-9 text-xs text-ink-soft">
                <PauseCircle className="w-3.5 h-3.5" /> Hold
              </button>
            )}
            {cart.length > 0 && (
              <button onClick={clearCart} className="btn btn-ghost h-9 text-xs text-danger">
                <RotateCcw className="w-3.5 h-3.5" /> Clear
              </button>
            )}
          </div>
        </div>
      </aside>

      {showCartMobile && (
        <div className="md:hidden fixed inset-0 bg-ink/40 z-30" onClick={() => setShowCartMobile(false)} />
      )}

      {holdDialogOpen && (
        <div className="fixed inset-0 z-50 bg-ink/40 flex items-end md:items-center justify-center p-2 md:p-4 animate-fade-in">
          <div className="paper-card glass-sheet p-2.5 md:p-5 w-full max-w-sm max-h-[94dvh] overflow-auto animate-fade-in">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[9px] md:text-[11px] uppercase tracking-wide md:tracking-widest text-ink-mute truncate">Hold ticket</div>
                <h3 className="font-display text-base md:text-xl font-bold leading-tight">Give it a label</h3>
              </div>
              <button
                type="button"
                onClick={() => setHoldDialogOpen(false)}
                className="btn btn-ghost btn-sm max-md:w-7 max-md:px-0 shrink-0"
                aria-label="Close hold ticket"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <input autoFocus value={holdLabel} onChange={(e) => setHoldLabel(e.target.value)} placeholder={holdHint(settings?.businessType)} className="input mt-2 md:mt-4" onKeyDown={(e) => e.key === "Enter" && hold()} />
            <div className="mt-2 md:mt-4 flex justify-end gap-1.5 md:gap-2">
              <button onClick={() => setHoldDialogOpen(false)} className="btn btn-outline">Cancel</button>
              <button onClick={hold} disabled={holdTicket.isPending} className="btn btn-primary">Hold ticket</button>
            </div>
          </div>
        </div>
      )}

      {partialOpen && (
        <PartialPaymentModal
          total={totals.total}
          currency={settings?.currency || "USD"}
          onClose={() => setPartialOpen(false)}
          onConfirm={(amt) => checkout("partial", amt)}
          pending={completeSale.isPending}
        />
      )}

      {completedSale && (
        <SaleCompletion
          sale={completedSale}
          currency={settings?.currency}
          delayMs={settings?.printer.successPopupMs ?? 1500}
          onDone={() => setCompletedSale(null)}
        />
      )}

      {lastReceipt && (
        <ReceiptModal
          sale={lastReceipt}
          onClose={() => setLastReceipt(null)}
          preview={(settings?.printer.receiptPreviewMs ?? 2000) !== 0}
          paused={!!completedSale}
        />
      )}

      {customerModalOpen && (
        <CustomerModal
          customer={null}
          onClose={() => setCustomerModalOpen(false)}
          onCreated={(c) => { setCustomerId(c.id); setLoyaltyRedeem(0); toast.success(`${c.name} selected`); }}
        />
      )}

      {categoryManagerOpen && (
        <CategoryManagerModal
          existingItemCategories={Array.from(new Set(sellable.map((i) => i.category)))}
          customCategories={settings?.categories || []}
          onClose={() => setCategoryManagerOpen(false)}
        />
      )}
    </div>
  );
}

function ViewButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string; }) {
  return (
    <button onClick={onClick} className={cn("h-8 px-2.5 rounded inline-flex items-center gap-1.5 text-xs font-semibold transition", active ? "bg-ink text-paper" : "text-ink-mute hover:text-ink")} title={label}>
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
    </button>
  );
}

function Row({ label, value, subtle }: { label: string; value: string; subtle?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between text-xs", subtle && "text-ink-soft")}>
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}

function PartialPaymentModal({ total, currency, onClose, onConfirm, pending }: { total: number; currency: string; onClose: () => void; onConfirm: (amt: number) => void; pending: boolean; }) {
  const [amount, setAmount] = useState(Math.round(total / 2));
  const due = Math.max(0, total - amount);
  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-end md:items-center justify-center p-2 md:p-4 animate-fade-in">
      <div className="paper-card glass-sheet w-full max-w-sm overflow-hidden max-h-[94dvh] md:max-h-[92vh] flex flex-col">
        <div className="px-2.5 md:px-5 py-2 md:py-4 border-b flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <div className="text-[9px] md:text-[11px] uppercase tracking-wide md:tracking-widest text-ink-mute truncate">Cash + Credit</div>
            <h2 className="font-display text-base md:text-xl font-bold leading-tight">Split payment</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm max-md:w-7 max-md:px-0 shrink-0"
            aria-label="Close split payment"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-2.5 md:p-5 space-y-2 md:space-y-4">
          <p className="text-xs text-ink-mute">
            Fill in the exact cash amount received. That amount is added to the receipt now, and the remainder becomes a credit invoice tracked in Sales Report. A final receipt is issued when the balance is cleared.
          </p>
          <div>
            <span className="label text-[9px] md:text-xs">Total due</span>
            <div className="num text-2xl font-bold"><MoneyText value={formatCurrency(total, currency)} /></div>
          </div>
          <div>
            <label htmlFor="partial-cash-input" className="label text-[9px] md:text-xs">Cash paid now</label>
            <input id="partial-cash-input" autoFocus type="number" min={0} max={total} step={1} value={amount} onChange={(e) => setAmount(Math.max(0, Math.min(total, Number(e.target.value))))} className="input mt-1 num text-right" />
          </div>
          <div className="flex items-baseline justify-between border-t pt-3">
            <span className="label text-[9px] md:text-xs">Remaining as credit</span>
            <span className="num text-lg font-bold text-magenta-reg"><MoneyText value={formatCurrency(due, currency)} /></span>
          </div>
          <button onClick={() => onConfirm(amount)} disabled={pending || amount <= 0 || amount >= total} className="btn btn-primary w-full h-11">
            <Landmark className="w-4 h-4" />
            {pending ? "Processing..." : "Confirm split payment"}
          </button>
          <p className="text-[10px] text-ink-mute text-center">
            Cash amount must be greater than 0 and less than the total. Otherwise use the Cash or Credit buttons instead.
          </p>
        </div>
      </div>
    </div>
  );
}

function ReceiptModal({
  sale,
  onClose,
  preview,
  paused,
}: {
  sale: Sale;
  onClose: () => void;
  /** false = auto-print headless (no receipt preview shown). */
  preview: boolean;
  /** true while the sale-complete circle is still on screen. */
  paused: boolean;
}) {
  const { data: settings } = useShopSettings();
  const { data: payments = [] } = useSalePayments(sale.id);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const autoPrinted = useRef(false);
  const [held, setHeld] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  // Automatic printing (unchanged pipeline): once per successful sale,
  // independent of whether the receipt preview is shown or how long it stays.
  useEffect(() => {
    if (!settings || autoPrinted.current || !settings.printer.autoPrint) return;
    autoPrinted.current = true;
    if (settings.printer.printerType === "system") {
      window.setTimeout(() => {
        window.print();
        // Headless mode exists only to print; the receipt portal can go now.
        if (!preview) onCloseRef.current();
      }, 400);
      return;
    }
    void printSaleReceipt(sale, settings, payments)
      .then((outcome) => {
        toast.success(`Auto-printed to ${outcome.label}`);
        if (!preview) onCloseRef.current();
      })
      .catch((err) => {
        const message = describePrintError(err);
        setPrintError(message);
        toast.error(message);
        if (!preview) onCloseRef.current();
      });
  }, [settings, sale, payments, preview]);

  // Receipt preview delay. It starts only after the success circle is gone,
  // and any pointer/key interaction keeps the receipt on screen.
  useEffect(() => {
    if (!settings || !preview || paused || held) return;
    const delay = settings.printer.receiptPreviewMs ?? 2000;
    if (delay <= 0) return; // -1 keep open
    const timer = window.setTimeout(() => onCloseRef.current(), delay);
    return () => window.clearTimeout(timer);
  }, [preview, paused, held, settings]);

  if (!settings) return null;

  // Headless print host: no preview UI, only the printable receipt.
  if (!preview) {
    return (
      <PrintablePortal>
        <DocumentView sale={sale} settings={settings} payments={payments} />
      </PrintablePortal>
    );
  }

  const isInvoice = sale.documentType === "invoice" || sale.amountDue > 0;
  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4 animate-fade-in no-print"
        onPointerDown={() => setHeld(true)}
        onFocusCapture={() => setHeld(true)}
        onWheel={() => setHeld(true)}
      >
        <div className={cn("bg-white rounded-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[95dvh]", isInvoice ? "max-w-3xl" : "max-w-md")}>
          <div className="p-4 border-b flex items-center justify-between shrink-0">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-gray-500">
                {isInvoice ? "Credit invoice" : "Sale complete"}
              </div>
              <div className="font-display text-lg font-bold text-gray-900">{sale.number}</div>
            </div>
            <button onClick={onClose} className="rounded-md h-8 w-8 flex items-center justify-center hover:bg-gray-100 text-gray-700">
              <X className="w-4 h-4" />
            </button>
          </div>
          {sale.id.startsWith("offline-") && (
            <div className="px-4 py-2 bg-amber-50 border-b text-xs text-amber-800 text-center no-print">
              Queued offline — pending sync. Numbers match what will be saved.
            </div>
          )}
          {printError && (
            <div className="px-4 py-2 bg-red-50 border-b text-xs text-red-700 text-center no-print">
              {printError}
            </div>
          )}
          <div className="overflow-auto bg-gray-100">
            <DocumentView sale={sale} settings={settings} payments={payments} />
          </div>
          <ReceiptActions sale={sale} settings={settings} payments={payments} onClose={onClose} />
        </div>
      </div>
      {/* Portal-rendered copy that is the ONLY thing that prints */}
      <PrintablePortal>
        <DocumentView sale={sale} settings={settings} payments={payments} />
      </PrintablePortal>
    </>
  );
}

function CategoryManagerModal({ existingItemCategories, customCategories, onClose }: { existingItemCategories: string[]; customCategories: string[]; onClose: () => void; }) {
  const updateSettings = useUpdateShopSettings();
  const qc = useQueryClient();
  const [pool, setPool] = useState(() => Array.from(new Set([...customCategories, ...existingItemCategories])).filter(Boolean));
  const [draft, setDraft] = useState("");
  const [renameFrom, setRenameFrom] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState("");
  const [saving, setSaving] = useState(false);

  const add = () => {
    const c = draft.trim();
    if (!c) return toast.error("Enter a category name");
    if (pool.some((p) => p.toLowerCase() === c.toLowerCase())) return toast.error("Already exists");
    setPool([...pool, c]); setDraft("");
  };

  const rename = async () => {
    if (!renameFrom || !renameTo.trim()) return;
    const to = renameTo.trim();
    setSaving(true);
    try {
      const businessId = currentBusinessId();
      let q = supabase.from("items").update({ category: to }).eq("category", renameFrom);
      if (businessId) q = q.eq("business_id", businessId);
      const { error } = await q;
      if (error) throw error;
      setPool(pool.map((p) => (p === renameFrom ? to : p)));
      setRenameFrom(null); setRenameTo("");
      qc.invalidateQueries({ queryKey: ["items"] });
      toast.success(`Renamed to ${to}`);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Rename failed"); }
    finally { setSaving(false); }
  };

  const remove = async (name: string) => {
    if (!confirm(`Delete "${name}"? Items currently in this category will move to "General".`)) return;
    setSaving(true);
    try {
      const businessId = currentBusinessId();
      let q = supabase.from("items").update({ category: "General" }).eq("category", name);
      if (businessId) q = q.eq("business_id", businessId);
      const { error } = await q;
      if (error) throw error;
      setPool(pool.filter((p) => p !== name));
      qc.invalidateQueries({ queryKey: ["items"] });
      toast.success(`Deleted "${name}"`);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Delete failed"); }
    finally { setSaving(false); }
  };

  const save = () => {
    updateSettings.mutate({ categories: pool }, {
      onSuccess: () => { toast.success("Categories saved"); onClose(); },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center p-4 animate-fade-in">
      <div className="paper-card glass-sheet w-full max-w-md max-h-[90dvh] flex flex-col overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between shrink-0">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">POS categories</div>
            <h2 className="font-display text-lg font-bold">Manage categories</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost h-9 w-9 p-0"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3 overflow-auto scroll-lined">
          <div className="flex gap-2">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="New category name" className="input flex-1" onKeyDown={(e) => e.key === "Enter" && add()} />
            <button onClick={add} className="btn btn-primary"><Plus className="w-4 h-4" /> Add</button>
          </div>
          <div className="border rounded-md divide-y">
            {pool.length === 0 ? (
              <div className="p-4 text-sm text-ink-mute text-center">No categories yet.</div>
            ) : (
              pool.map((p) => (
                <div key={p} className="p-2.5 flex items-center gap-2">
                  {renameFrom === p ? (
                    <>
                      <input autoFocus value={renameTo} onChange={(e) => setRenameTo(e.target.value)} placeholder="New name" className="input h-8 flex-1" />
                      <button onClick={rename} disabled={saving} className="btn btn-primary h-8 px-3 text-xs">Save</button>
                      <button onClick={() => { setRenameFrom(null); setRenameTo(""); }} className="btn btn-ghost h-8 px-2 text-xs">Cancel</button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-medium">{p}</span>
                      <button onClick={() => { setRenameFrom(p); setRenameTo(p); }} className="btn btn-ghost h-8 w-8 p-0" title="Rename">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => remove(p)} disabled={saving} className="btn btn-ghost h-8 w-8 p-0 text-danger" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
          <p className="text-[11px] text-ink-mute">
            Renaming updates every item in that category. Deleting reassigns them to "General".
          </p>
        </div>
        <div className="p-4 border-t flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="btn btn-outline">Cancel</button>
          <button onClick={save} disabled={updateSettings.isPending} className="btn btn-primary">Save category list</button>
        </div>
      </div>
    </div>
  );
}
