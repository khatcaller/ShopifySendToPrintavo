import { db } from "../db.server";

// ============================================================================
// Type Definitions for Printavo v2 GraphQL API
// ============================================================================

interface PrintavoContact {
  id: string;
  firstName?: string;
  lastName?: string;
  emails?: Array<{ email: string }>;
  customer?: {
    id: string;
    companyName?: string;
  };
}

interface PrintavoCustomer {
  id: string;
  companyName?: string;
  primaryContact?: {
    id: string;
    emails?: Array<{ email: string }>;
  };
}

interface PrintavoQuote {
  id: string;
  nickname?: string;
  contact?: { id: string };
  lineItemGroups?: Array<{
    id: string;
    position: number;
    lineItems?: Array<{
      id: string;
      description?: string;
      itemNumber?: string;
    }>;
  }>;
}

// Printavo's LineItemSize enum - comprehensive list
type LineItemSize =
  | "OSFA" // One Size Fits All
  | "XXXXS"
  | "XXXS"
  | "XXS"
  | "XS"
  | "S"
  | "M"
  | "L"
  | "XL"
  | "XXL"
  | "XXXL"
  | "XXXXL"
  | "XXXXXL"
  | "_2T"
  | "_3T"
  | "_4T"
  | "_5T"
  | "_6"
  | "_8"
  | "_10"
  | "_12"
  | "_14"
  | "_16"
  | "_18"
  | "YOUTH_S"
  | "YOUTH_M"
  | "YOUTH_L"
  | "YOUTH_XL";

interface LineItemSizeCount {
  size: LineItemSize;
  count: number;
}

interface AddressInput {
  address1?: string;
  address2?: string;
  city?: string;
  country?: string;
  name?: string;
  phone?: string;
  state?: string;
  zip?: string;
}

interface ContactInput {
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

interface LineItemCreateInput {
  position: number;
  description?: string;
  itemNumber?: string;
  color?: string;
  price?: number;
  taxed?: boolean;
  sizes?: LineItemSizeCount[];
}

interface LineItemGroupCreateInput {
  position: number;
  lineItems?: LineItemCreateInput[];
}

interface QuoteCreateInput {
  contact: { id: string };
  customerDueAt: string; // ISO8601Date (YYYY-MM-DD)
  dueAt: string; // ISO8601DateTime
  nickname?: string;
  visualPoNumber?: string;
  customerNote?: string;
  productionNote?: string;
  tags?: string[];
  billingAddress?: AddressInput;
  shippingAddress?: AddressInput;
  lineItemGroups?: LineItemGroupCreateInput[];
}

interface CustomerCreateInput {
  primaryContact: ContactInput;
  companyName?: string;
  billingAddress?: AddressInput;
  shippingAddress?: AddressInput;
  internalNote?: string;
}

// ============================================================================
// GraphQL Operations
// ============================================================================

const FIND_CONTACT_BY_EMAIL = `
  query FindPrimaryContactByEmail($q: String!) {
    contacts(query: $q, primaryOnly: true, first: 5) {
      nodes {
        id
        firstName
        lastName
        customer {
          id
          companyName
        }
        emails {
          email
        }
      }
    }
  }
`;

const CREATE_CUSTOMER = `
  mutation CreateCustomer($input: CustomerCreateInput!) {
    customerCreate(input: $input) {
      customer {
        id
        companyName
        primaryContact {
          id
          emails {
            email
          }
        }
      }
    }
  }
`;

const CREATE_QUOTE = `
  mutation CreateQuote($input: QuoteCreateInput!) {
    quoteCreate(input: $input) {
      quote {
        id
        nickname
        contact {
          id
        }
        lineItemGroups {
          id
          position
          lineItems {
            id
            description
            itemNumber
          }
        }
      }
    }
  }
`;

// ============================================================================
// GraphQL Client
// ============================================================================

async function printavoGraphQL<T = any>(
  apiKey: string,
  query: string,
  variables: Record<string, any> = {}
): Promise<{ data?: T; errors?: any[] }> {
  const response = await fetch("https://www.printavo.com/api/v2/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Printavo API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// ============================================================================
// Size Mapping Logic
// ============================================================================

/**
 * Maps Shopify variant option values to Printavo LineItemSize enum.
 * Handles common size patterns including:
 * - Standard sizes: S, M, L, XL, etc.
 * - Youth sizes: Youth S, Youth M, etc.
 * - Children's sizes: 2T, 3T, 4T, 6, 8, 10, etc.
 * - One size: OSFA, One Size, OS, etc.
 */
function mapSizeToPrintavo(sizeString: string): LineItemSize {
  const normalized = sizeString.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

  // Direct enum matches
  const directMatches: Record<string, LineItemSize> = {
    OSFA: "OSFA",
    ONESIZE: "OSFA",
    OS: "OSFA",
    XXXXS: "XXXXS",
    XXXS: "XXXS",
    XXS: "XXS",
    XS: "XS",
    S: "S",
    SMALL: "S",
    M: "M",
    MEDIUM: "M",
    L: "L",
    LARGE: "L",
    XL: "XL",
    XXL: "XXL",
    "2XL": "XXL",
    XXXL: "XXXL",
    "3XL": "XXXL",
    XXXXL: "XXXXL",
    "4XL": "XXXXL",
    XXXXXL: "XXXXXL",
    "5XL": "XXXXXL",
  };

  if (directMatches[normalized]) {
    return directMatches[normalized];
  }

  // Youth sizes
  if (normalized.includes("YOUTH")) {
    if (normalized.includes("S")) return "YOUTH_S";
    if (normalized.includes("M")) return "YOUTH_M";
    if (normalized.includes("L") && !normalized.includes("XL")) return "YOUTH_L";
    if (normalized.includes("XL")) return "YOUTH_XL";
  }

  // Toddler sizes
  const toddlerMatches: Record<string, LineItemSize> = {
    "2T": "_2T",
    "3T": "_3T",
    "4T": "_4T",
    "5T": "_5T",
  };
  if (toddlerMatches[normalized]) {
    return toddlerMatches[normalized];
  }

  // Numeric sizes
  const numericMatches: Record<string, LineItemSize> = {
    "6": "_6",
    "8": "_8",
    "10": "_10",
    "12": "_12",
    "14": "_14",
    "16": "_16",
    "18": "_18",
  };
  if (numericMatches[normalized]) {
    return numericMatches[normalized];
  }

  // Default fallback
  return "M";
}

/**
 * Parses Shopify line item variant options to extract size information.
 * Handles multiple formats:
 * - variant_title: "Size / Color" or "Color / Size"
 * - Direct options array inspection
 */
function extractSizeFromVariant(lineItem: any): string {
  // Try variant_title first
  if (lineItem.variant_title) {
    const parts = lineItem.variant_title.split("/").map((p: string) => p.trim());
    
    // Common patterns: "Size / Color" or "Color / Size"
    // Heuristic: check if any part contains size keywords or matches size patterns
    for (const part of parts) {
      const normalized = part.toUpperCase();
      if (
        normalized.match(/^(XXX?X?S|XX?X?X?L|[SMLX]+|SMALL|MEDIUM|LARGE)$/i) ||
        normalized.match(/^\d+T?$/) ||
        normalized.includes("YOUTH") ||
        normalized.includes("ONE SIZE") ||
        normalized === "OS" ||
        normalized === "OSFA"
      ) {
        return part;
      }
    }
    
    // If no clear size match, assume first part is size
    if (parts.length > 0) {
      return parts[0];
    }
  }

  // Try options array (if available in webhook data)
  if (lineItem.properties) {
    for (const prop of lineItem.properties) {
      if (prop.name.toLowerCase().includes("size")) {
        return prop.value;
      }
    }
  }

  // Default fallback
  return "M";
}

// ============================================================================
// Main API Functions
// ============================================================================

/**
 * Find existing contact by email, or create a new customer with contact.
 * Returns the contact ID to use for quote creation.
 */
async function findOrCreateContact(
  apiKey: string,
  order: any
): Promise<{ contactId: string; customerId?: string; isNew: boolean }> {
  // Extract email from all possible locations
  let email = order.email || order.customer?.email || order.billing_address?.email;
  
  if (!email) {
    throw new Error("Order must have a customer email");
  }

  // Normalize email (lowercase, trim whitespace)
  email = email.toLowerCase().trim();

  const firstName = order.billing_address?.first_name || order.customer?.first_name || "Guest";
  const lastName = order.billing_address?.last_name || order.customer?.last_name || "";
  const phone = order.billing_address?.phone || order.phone || order.customer?.phone;
  const companyName = order.billing_address?.company || order.customer?.company;

  // Step 1: Look up contact by email
  const lookupResult = await printavoGraphQL<{
    contacts: { nodes: PrintavoContact[] };
  }>(apiKey, FIND_CONTACT_BY_EMAIL, { q: email });

  if (lookupResult.errors) {
    throw new Error(`Contact lookup failed: ${JSON.stringify(lookupResult.errors)}`);
  }

  const existingContacts = lookupResult.data?.contacts?.nodes || [];
  
  // Check if we found a matching contact
  const matchingContact = existingContacts.find((c) =>
    c.emails?.some((e) => e.email.toLowerCase() === email.toLowerCase())
  );

  if (matchingContact) {
    return {
      contactId: matchingContact.id,
      customerId: matchingContact.customer?.id,
      isNew: false,
    };
  }

  // Step 2: No existing contact, create new customer with contact
  const billingAddress: AddressInput | undefined = order.billing_address
    ? {
        name: `${order.billing_address.first_name || ""} ${order.billing_address.last_name || ""}`.trim(),
        address1: order.billing_address.address1,
        address2: order.billing_address.address2,
        city: order.billing_address.city,
        state: order.billing_address.province || order.billing_address.province_code,
        zip: order.billing_address.zip,
        country: order.billing_address.country_code,
        phone: order.billing_address.phone,
      }
    : undefined;

  const shippingAddress: AddressInput | undefined = order.shipping_address
    ? {
        name: `${order.shipping_address.first_name || ""} ${order.shipping_address.last_name || ""}`.trim(),
        address1: order.shipping_address.address1,
        address2: order.shipping_address.address2,
        city: order.shipping_address.city,
        state: order.shipping_address.province || order.shipping_address.province_code,
        zip: order.shipping_address.zip,
        country: order.shipping_address.country_code,
        phone: order.shipping_address.phone,
      }
    : undefined;

  const customerInput: CustomerCreateInput = {
    primaryContact: {
      firstName,
      lastName,
      email,
      phone,
    },
    companyName: companyName || `${firstName} ${lastName}`.trim() || email,
    billingAddress,
    shippingAddress,
    internalNote: `Created from Shopify order ${order.name || order.order_number}`,
  };

  const createResult = await printavoGraphQL<{
    customerCreate: { customer: PrintavoCustomer };
  }>(apiKey, CREATE_CUSTOMER, { input: customerInput });

  if (createResult.errors || !createResult.data?.customerCreate?.customer) {
    throw new Error(`Customer creation failed: ${JSON.stringify(createResult.errors)}`);
  }

  const newCustomer = createResult.data.customerCreate.customer;
  const newContactId = newCustomer.primaryContact?.id;

  if (!newContactId) {
    throw new Error("Customer created but no contact ID returned");
  }

  return {
    contactId: newContactId,
    customerId: newCustomer.id,
    isNew: true,
  };
}

/**
 * Create a Printavo quote with line items from a Shopify order.
 */
async function createQuoteWithItems(
  apiKey: string,
  order: any,
  contactId: string,
  merchant: any
): Promise<PrintavoQuote> {
  // Calculate due dates (example: 7 business days from now)
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);
  const customerDueAt = dueDate.toISOString().split("T")[0]; // YYYY-MM-DD
  const dueAt = dueDate.toISOString(); // Full ISO8601

  // Filter line items based on merchant settings
  const filteredItems = order.line_items.filter((item: any) => {
    // Check product type filters
    if (merchant.skip_gift_cards && item.product_type === "Gift Card") return false;
    if (item.product_type === "Digital") return false;
    if (item.product_type === "Service") return false;
    if (merchant.skip_non_physical && !item.requires_shipping) return false;

    // Check line item exclusion property
    if (merchant.respect_line_item_skip && item.properties) {
      const skipProperty = merchant.line_item_skip_property || "printavo_skip";
      const hasSkipProperty = item.properties.some(
        (prop: any) => prop.name.toLowerCase() === skipProperty.toLowerCase()
      );
      if (hasSkipProperty) return false;
    }

    return true;
  });

  if (filteredItems.length === 0) {
    throw new Error("No valid line items to sync after filtering");
  }

  // Build line items with size mapping
  const lineItems: LineItemCreateInput[] = filteredItems.map((item: any, index: number) => {
    const sizeString = extractSizeFromVariant(item);
    const printavoSize = mapSizeToPrintavo(sizeString);

    return {
      position: index + 1,
      description: `${item.name}${item.variant_title ? ` - ${item.variant_title}` : ""}`,
      itemNumber: item.sku || undefined,
      color: undefined, // Could be extracted from variant_title if needed
      // IMPORTANT: price is per-unit, NOT extended. Quantity is in sizes[].count
      price: parseFloat(item.price), // Per-unit price from Shopify
      taxed: item.taxable || false,
      sizes: [
        {
          size: printavoSize,
          count: item.quantity, // Quantity per size
        },
      ],
    };
  });

  // Build addresses
  const billingAddress: AddressInput | undefined = order.billing_address
    ? {
        name: `${order.billing_address.first_name || ""} ${order.billing_address.last_name || ""}`.trim(),
        address1: order.billing_address.address1,
        address2: order.billing_address.address2,
        city: order.billing_address.city,
        state: order.billing_address.province || order.billing_address.province_code,
        zip: order.billing_address.zip,
        country: order.billing_address.country_code,
        phone: order.billing_address.phone,
      }
    : undefined;

  const shippingAddress: AddressInput | undefined = order.shipping_address
    ? {
        name: `${order.shipping_address.first_name || ""} ${order.shipping_address.last_name || ""}`.trim(),
        address1: order.shipping_address.address1,
        address2: order.shipping_address.address2,
        city: order.shipping_address.city,
        state: order.shipping_address.province || order.shipping_address.province_code,
        zip: order.shipping_address.zip,
        country: order.shipping_address.country_code,
        phone: order.shipping_address.phone,
      }
    : undefined;

  // Build tags
  const tags: string[] = ["shopify"];
  if (order.financial_status === "paid") {
    tags.push("paid");
  }
  if (order.tags) {
    const orderTags = order.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
    tags.push(...orderTags);
  }

  // Build production note
  const productionNote = [
    `Shopify Order ID: ${order.id}`,
    `Order Number: ${order.name || order.order_number}`,
    `Created: ${order.created_at}`,
    order.note ? `Customer Note: ${order.note}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  // Build quote input
  const quoteInput: QuoteCreateInput = {
    contact: { id: contactId },
    customerDueAt,
    dueAt,
    nickname: `Shopify ${order.name || order.order_number}`,
    visualPoNumber: `Shopify-${order.order_number || order.name}`,
    customerNote: order.note || undefined,
    productionNote,
    tags,
    billingAddress,
    shippingAddress,
    lineItemGroups: [
      {
        position: 1,
        lineItems,
      },
    ],
  };

  // Create quote
  const result = await printavoGraphQL<{
    quoteCreate: { quote: PrintavoQuote };
  }>(apiKey, CREATE_QUOTE, { input: quoteInput });

  if (result.errors || !result.data?.quoteCreate?.quote) {
    throw new Error(`Quote creation failed: ${JSON.stringify(result.errors)}`);
  }

  return result.data.quoteCreate.quote;
}

// ============================================================================
// Main Sync Function (with Idempotency)
// ============================================================================

export async function syncOrderToPrintavo(
  shop: string,
  order: any
): Promise<{ success: boolean; message: string; quoteId?: string }> {
  const merchant = db
    .prepare(
      `SELECT printavo_api_key, sync_enabled, sync_mode, skip_gift_cards, skip_non_physical, included_tags,
       exclude_tag, require_include_tag, include_tag, line_item_skip_property, respect_line_item_skip
       FROM merchants WHERE shop = ?`
    )
    .get(shop) as any;

  if (!merchant) {
    return { success: false, message: "Merchant not found" };
  }

  if (!merchant.sync_enabled) {
    return { success: false, message: "Sync is disabled" };
  }

  const apiKey = merchant.printavo_api_key || process.env.PRINTAVO_API_KEY;
  if (!apiKey) {
    return { success: false, message: "Printavo API key not configured" };
  }

  // Parse order tags
  const orderTags = (order.tags || "")
    .split(",")
    .map((t: string) => t.trim().toLowerCase())
    .filter((t: string) => t.length > 0);

  // Check exclude tag
  const excludeTag = (merchant.exclude_tag || "no-printavo").toLowerCase();
  if (excludeTag && orderTags.includes(excludeTag)) {
    return { success: false, message: `Order skipped: excluded by tag "${excludeTag}"` };
  }

  // Check if include tag is required
  if (merchant.require_include_tag) {
    const includeTag = (merchant.include_tag || "printavo").toLowerCase();
    if (!orderTags.includes(includeTag)) {
      return { success: false, message: `Order skipped: missing required tag "${includeTag}"` };
    }
  }

  // Check sync mode (legacy support for "tagged" mode)
  const syncMode = merchant.sync_mode || "all";
  if (syncMode === "tagged") {
    const includedTags = (merchant.included_tags || "")
      .split(",")
      .map((t: string) => t.trim().toLowerCase())
      .filter((t: string) => t.length > 0);

    if (includedTags.length === 0) {
      return { success: false, message: "No included tags configured for tagged sync mode" };
    }

    const hasMatchingTag = orderTags.some((tag: string) => includedTags.includes(tag));

    if (!hasMatchingTag) {
      return { success: false, message: "Order does not have required tags" };
    }
  }

  // IDEMPOTENCY CHECK: Has this order already been synced?
  const existingMapping = db
    .prepare("SELECT printavo_quote_id FROM order_mappings WHERE shop = ? AND shopify_order_id = ?")
    .get(shop, order.id.toString()) as any;

  if (existingMapping) {
    return {
      success: true,
      message: `Order already synced to Printavo quote ${existingMapping.printavo_quote_id}`,
      quoteId: existingMapping.printavo_quote_id,
    };
  }

  try {
    // Step 1: Find or create contact
    const { contactId, customerId, isNew } = await findOrCreateContact(apiKey, order);

    // Step 2: Create quote with items
    const quote = await createQuoteWithItems(apiKey, order, contactId, merchant);

    // Step 3: Store mapping for idempotency (with race condition handling)
    try {
      db.prepare(
        `INSERT INTO order_mappings (shop, shopify_order_id, shopify_order_name, printavo_quote_id, printavo_contact_id, printavo_customer_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(shop, order.id.toString(), order.name, quote.id, contactId, customerId || null);
    } catch (dbError: any) {
      // If insert fails due to UNIQUE constraint (race condition: duplicate webhook),
      // treat as success since quote was already created
      if (dbError.message?.includes("UNIQUE constraint failed")) {
        return {
          success: true,
          message: `Order synced successfully (concurrent webhook detected). Quote ID: ${quote.id}`,
          quoteId: quote.id,
        };
      }
      throw dbError; // Re-throw if it's a different database error
    }

    return {
      success: true,
      message: `Order synced successfully. ${isNew ? "New customer created." : "Existing customer found."} Quote ID: ${quote.id}`,
      quoteId: quote.id,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to sync: ${error.message}`,
    };
  }
}

// ============================================================================
// Connection Test Function
// ============================================================================

export async function testPrintavoConnection(apiKey: string): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    // Simple introspection query to test connection
    const testQuery = `
      query TestConnection {
        __typename
      }
    `;

    const result = await printavoGraphQL(apiKey, testQuery);

    if (result.errors) {
      return {
        success: false,
        message: `API Error: ${JSON.stringify(result.errors)}`,
      };
    }

    return { success: true, message: "Connection successful" };
  } catch (error: any) {
    if (error.message.includes("401") || error.message.includes("403")) {
      return { success: false, message: "Invalid API key" };
    }
    return {
      success: false,
      message: `Connection error: ${error.message}`,
    };
  }
}
