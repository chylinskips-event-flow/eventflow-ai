import { createAdminClient } from "@/lib/supabase/admin";

// ---- Types ---------------------------------------------------------------

export type TicketType = {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  price: number;           // grosze (PLN*100); 0 = free
  currency: string;
  quantity_total: number | null;  // null = unlimited
  quantity_sold: number;
  sales_start: string | null;
  sales_end: string | null;
  position: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type DiscountKind = "percent" | "amount";

export type DiscountCode = {
  id: string;
  event_id: string;
  code: string;
  kind: DiscountKind;
  value: number;           // percent 0-100 or grosze
  max_uses: number | null;
  uses_count: number;
  valid_from: string | null;
  valid_until: string | null;
  ticket_type_id: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type OrderStatus = "pending" | "paid" | "failed" | "cancelled" | "refunded";

export type Order = {
  id: string;
  event_id: string;
  buyer_name: string;
  buyer_email: string;
  invoice_data: Record<string, unknown> | null;
  status: OrderStatus;
  total_amount: number;
  currency: string;
  p24_session_id: string;
  p24_token: string | null;
  p24_order_id: string | null;
  discount_code_id: string | null;
  created_at: string;
  paid_at: string | null;
};

export type OrderItem = {
  id: string;
  order_id: string;
  ticket_type_id: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type TicketStatus = "valid" | "cancelled" | "refunded";

export type Ticket = {
  id: string;
  order_id: string;
  ticket_type_id: string;
  event_id: string;
  holder_name: string;
  holder_email: string;
  ticket_token: string;
  attendee_id: string | null;
  status: TicketStatus;
  created_at: string;
};

// ---- Helpers -------------------------------------------------------------

export function formatPrice(grosze: number, currency = "PLN"): string {
  if (grosze === 0) return "Bezpłatny";
  return `${(grosze / 100).toFixed(2).replace(".", ",")} ${currency}`;
}

export function isFree(price: number): boolean {
  return price === 0;
}

/** Whether a ticket type is currently available for purchase. */
export function isTicketTypeAvailable(tt: TicketType): boolean {
  if (!tt.enabled) return false;
  const now = new Date();
  if (tt.sales_start && new Date(tt.sales_start) > now) return false;
  if (tt.sales_end && new Date(tt.sales_end) < now) return false;
  return true;
}

export function isTicketTypeSoldOut(tt: TicketType): boolean {
  if (tt.quantity_total === null) return false;
  return tt.quantity_sold >= tt.quantity_total;
}

export function availableQuantity(tt: TicketType): number | null {
  if (tt.quantity_total === null) return null;
  return Math.max(0, tt.quantity_total - tt.quantity_sold);
}

// ---- Data access (service_role only) ------------------------------------

export async function getTicketTypes(eventId: string): Promise<TicketType[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("ticket_types")
    .select("*")
    .eq("event_id", eventId)
    .order("position", { ascending: true });
  return (data ?? []) as TicketType[];
}

/** Returns enabled types within their sale window — for public display. */
export async function getPublicTicketTypes(eventId: string): Promise<TicketType[]> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("ticket_types")
    .select("*")
    .eq("event_id", eventId)
    .eq("enabled", true)
    .or(`sales_start.is.null,sales_start.lte.${now}`)
    .or(`sales_end.is.null,sales_end.gte.${now}`)
    .order("position", { ascending: true });
  return (data ?? []) as TicketType[];
}

export async function getDiscountCodes(eventId: string): Promise<DiscountCode[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("discount_codes")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  return (data ?? []) as DiscountCode[];
}

export async function getOrders(
  eventId: string,
  limit = 100,
): Promise<Order[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("orders")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Order[];
}

export async function getOrderWithItems(
  orderId: string,
): Promise<{ order: Order; items: OrderItem[] } | null> {
  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return null;
  const { data: items } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", orderId);
  return { order: order as Order, items: (items ?? []) as OrderItem[] };
}

export async function getTicketsByOrder(orderId: string): Promise<Ticket[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tickets")
    .select("*")
    .eq("order_id", orderId);
  return (data ?? []) as Ticket[];
}
