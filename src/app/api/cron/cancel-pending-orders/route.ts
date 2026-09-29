import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Zamówienia pending starsze niż TTL_MINUTES → cancelled + zwolnienie puli.
// Pokrywa: porzucone checkouty (zamknięcie karty, timeout) gdzie P24 nie woła
// webhooka. Cron co 5 minut; TTL 20 minut = zawsze max 25 min blokady.
const TTL_MINUTES = 20;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorized =
    Boolean(secret) &&
    request.headers.get("authorization") === `Bearer ${secret}`;

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - TTL_MINUTES * 60 * 1000).toISOString();

  // Find expired pending orders (p24_session_id starts with "p24_" = paid flow)
  const { data: orders } = await supabase
    .from("orders")
    .select("id")
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .like("p24_session_id", "p24_%");

  if (!orders || orders.length === 0) {
    return NextResponse.json({ cancelled: 0 });
  }

  let cancelled = 0;
  const released: string[] = [];

  for (const order of orders) {
    // Atomic guard: only cancel if still pending (concurrent webhook may have paid it)
    const { data: updated } = await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", order.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (!updated) continue; // already fulfilled or cancelled elsewhere
    cancelled++;

    // Release reserved quantity for each item
    const { data: items } = await supabase
      .from("order_items")
      .select("ticket_type_id, quantity")
      .eq("order_id", order.id);

    for (const item of items ?? []) {
      await supabase.rpc("unreserve_ticket_quantity", {
        p_ticket_type_id: item.ticket_type_id,
        p_quantity: item.quantity,
      });
      released.push(item.ticket_type_id);
    }
  }

  console.log(`cancel-pending-orders: cancelled=${cancelled}, released=${released.length} items`);
  return NextResponse.json({ cancelled, releasedItems: released.length });
}
