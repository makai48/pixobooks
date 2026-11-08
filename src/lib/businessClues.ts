/**
 * Business-type text-box clues.
 *
 * The admin declares a business type during setup. Every setup/operational
 * input that gives an example (business name, address, support email, item
 * name, category, receipt copy) should read like that business — never like a
 * print shop by default.
 */

export type BusinessClues = {
  /** Example business name, without the leading "e.g.". */
  businessName: string;
  /** Example street address; `{country}` is replaced at call time. */
  address: string;
  /** Example category name. */
  category: string;
  /** Example item / service name. */
  item: string;
  /** Default receipt greeting used when the shop has not set one. */
  receiptHeader: string;
  /** Example receipt footer message. */
  receiptFooter: string;
};

const OTHER: BusinessClues = {
  businessName: "Your Business",
  address: "12 Market Street, {country}",
  category: "General",
  item: "Product or service name",
  receiptHeader: "Thank you for your business!",
  receiptFooter: "Please keep this receipt for your records.",
};

const CLUES: Record<string, BusinessClues> = {
  Retail: {
    businessName: "Sunrise Retail",
    address: "12 Market Street, {country}",
    category: "Beverages",
    item: "Mineral Water 500ml",
    receiptHeader: "Thank you for shopping with us!",
    receiptFooter: "Goods sold are not returnable after 7 days.",
  },
  "Retail Shop": {
    businessName: "Corner Shop",
    address: "12 Market Street, {country}",
    category: "Groceries",
    item: "Bread 400g",
    receiptHeader: "Thank you for shopping with us!",
    receiptFooter: "Goods sold are not returnable after 7 days.",
  },
  Wholesale: {
    businessName: "Metro Wholesale",
    address: "Warehouse 4, Industrial Area, {country}",
    category: "Bulk Staples",
    item: "Carton of 24 Soaps",
    receiptHeader: "Thank you for your order!",
    receiptFooter: "Goods sold are not returnable after 7 days.",
  },
  "Grocery / Supermarket": {
    businessName: "FreshMart Grocery",
    address: "12 Market Street, {country}",
    category: "Grains & Cereals",
    item: "Rice 5kg",
    receiptHeader: "Thank you for shopping with us!",
    receiptFooter: "Goods sold are not returnable after 7 days.",
  },
  "Restaurant / Cafe": {
    businessName: "Corner Cafe",
    address: "12 High Street, {country}",
    category: "Beverages",
    item: "Chicken Sandwich",
    receiptHeader: "Thank you for dining with us!",
    receiptFooter: "Please come again.",
  },
  "Salon / Barbershop": {
    businessName: "Glow Salon",
    address: "12 High Street, {country}",
    category: "Hair Services",
    item: "Haircut & Wash",
    receiptHeader: "Thank you for visiting us!",
    receiptFooter: "Please book your next visit with us.",
  },
  Pharmacy: {
    businessName: "City Care Pharmacy",
    address: "12 Health Lane, {country}",
    category: "Pain Relief",
    item: "Paracetamol 500mg",
    receiptHeader: "Thank you for choosing us!",
    receiptFooter: "Keep this receipt for your records.",
  },
  Hardware: {
    businessName: "BuildRight Hardware",
    address: "12 Industrial Road, {country}",
    category: "Building Materials",
    item: "Cement Bag 50kg",
    receiptHeader: "Thank you for your business!",
    receiptFooter: "Keep this receipt for warranty and returns.",
  },
  Electronics: {
    businessName: "TechPoint Electronics",
    address: "12 Tech Plaza, {country}",
    category: "Accessories",
    item: "USB-C Cable 1m",
    receiptHeader: "Thank you for your business!",
    receiptFooter: "Keep this receipt for warranty and returns.",
  },
  "Fashion / Boutique": {
    businessName: "Style Boutique",
    address: "12 Market Street, {country}",
    category: "Men's Wear",
    item: "Cotton T-Shirt",
    receiptHeader: "Thank you for shopping with us!",
    receiptFooter: "Exchanges accepted within 7 days with this receipt.",
  },
  "Stationery / Bookshop": {
    businessName: "PageTurner Bookshop",
    address: "12 School Road, {country}",
    category: "School Supplies",
    item: "A4 Notebook 200 pages",
    receiptHeader: "Thank you for your business!",
    receiptFooter: "Exchanges accepted within 7 days with this receipt.",
  },
  "Agrovet / Farm Supply": {
    businessName: "GreenField Agrovet",
    address: "12 Farm Road, {country}",
    category: "Seeds",
    item: "Maize Seed 10kg",
    receiptHeader: "Thank you for your business!",
    receiptFooter: "Keep this receipt for your records.",
  },
  "Motor Spares / Garage": {
    businessName: "AutoFix Garage",
    address: "12 Garage Lane, {country}",
    category: "Engine Parts",
    item: "Brake Pads",
    receiptHeader: "Thank you for your business!",
    receiptFooter: "Keep this receipt for warranty and returns.",
  },
  Services: {
    businessName: "Bright Services",
    address: "12 Business Park, {country}",
    category: "Consulting",
    item: "Consultation",
    receiptHeader: "Thank you for your business!",
    receiptFooter: "Please keep this receipt for your records.",
  },
  Manufacturing: {
    businessName: "Prime Manufacturing",
    address: "Plot 8 Industrial Area, {country}",
    category: "Raw Materials",
    item: "Finished Pallet",
    receiptHeader: "Thank you for your business!",
    receiptFooter: "Please keep this receipt for your records.",
  },
  Other: OTHER,
};

function normalize(type?: string | null): string {
  return (type || "").trim();
}

/** Clues for the declared type; unknown/empty falls back to a generic business. */
export function businessClues(type?: string | null): BusinessClues {
  return CLUES[normalize(type)] ?? OTHER;
}

/** Example business name with the "e.g." prefix the inputs use. */
export function businessNameHint(type?: string | null): string {
  return `e.g. ${businessClues(type).businessName}`;
}

/** Address example, localised with the country captured during setup. */
export function addressHint(type?: string | null, country?: string | null): string {
  const template = businessClues(type).address;
  const place = (country || "").trim() || "your country";
  return `e.g. ${template.replace("{country}", place)}`;
}

/** Item / service example for inventory inputs. */
export function itemHint(type?: string | null): string {
  return `e.g. ${businessClues(type).item}`;
}

/** Category example for the category builder. */
export function categoryHint(type?: string | null): string {
  return `e.g. ${businessClues(type).category}`;
}

/** Support-email clue derived from the business name the admin provided. */
export function emailHint(businessName?: string | null): string {
  const slug = (businessName || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
  return `support@${slug || "yourbusiness"}.com`;
}

/** Receipt greeting default for the declared type. */
export function receiptHeaderHint(type?: string | null): string {
  return businessClues(type).receiptHeader;
}

/** Receipt footer example for the declared type. */
export function receiptFooterHint(type?: string | null): string {
  return businessClues(type).receiptFooter;
}

/** Hold-ticket label example for the declared type. */
export function holdHint(type?: string | null): string {
  switch (normalize(type)) {
    case "Restaurant / Cafe":
      return "e.g. Table 4 or customer name";
    case "Salon / Barbershop":
      return "e.g. Client name";
    case "Motor Spares / Garage":
      return "e.g. Job card 104";
    case "Services":
      return "e.g. Service ticket 12";
    case "Wholesale":
      return "e.g. Order reference";
    case "Manufacturing":
      return "e.g. Batch reference";
    case "Pharmacy":
      return "e.g. Customer name";
    default:
      return "e.g. Customer pickup or name";
  }
}
