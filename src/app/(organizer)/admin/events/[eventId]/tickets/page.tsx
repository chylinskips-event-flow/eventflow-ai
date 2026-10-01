import { notFound } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import { getTicketTypes, getDiscountCodes, formatPrice, availableQuantity, isTicketTypeSoldOut } from "@/lib/tickets";
import { Badge } from "@/components/ui/badge";
import { CreateTicketTypeButton, EditTicketTypeButton } from "./ticket-type-form";
import { CreateDiscountCodeButton } from "./discount-code-form";
import { TicketTypeToggle, DeleteTicketTypeButton, DeleteDiscountCodeButton } from "./ticket-row-actions";
import { featureGate } from "@/lib/entitlements";
import { UpgradeNotice } from "@/components/upgrade-notice";

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return "Bez okna";
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `od ${fmt(start)}`;
  return `do ${fmt(end!)}`;
}

export default async function TicketsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const event = await getOwnEvent(eventId);
  if (!event) notFound();

  const paidTicketsGate = await featureGate(event.organization_id, "tickets_paid");

  const [ticketTypes, discountCodes] = await Promise.all([
    getTicketTypes(eventId),
    getDiscountCodes(eventId),
  ]);

  return (
    <div className="space-y-10">
      {!paidTicketsGate.ok && <UpgradeNotice message={paidTicketsGate.message} />}

      {/* ---- Ticket types ---- */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div>
            <h2 className="text-xl font-semibold">Typy biletów</h2>
            <p className="text-sm text-muted-foreground">
              Zarządzaj cenami, pulami i oknami sprzedaży.
            </p>
          </div>
          <CreateTicketTypeButton eventId={eventId} />
        </div>

        {ticketTypes.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            Brak typów biletów. Dodaj pierwszy typ, aby włączyć sprzedaż.
          </div>
        ) : (
          <>
            {/* Mobile card layout (<sm) */}
            <div className="flex flex-col gap-3 sm:hidden">
              {ticketTypes.map((tt) => {
                const avail = availableQuantity(tt);
                const soldOut = isTicketTypeSoldOut(tt);
                const paidQty = tt.paid_quantity ?? tt.quantity_sold;
                const pendingQty = tt.active_pending_quantity ?? 0;
                return (
                  <div key={tt.id} className="rounded-lg border bg-card p-4 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium">{tt.name}</div>
                        {tt.description && (
                          <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {tt.description}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <EditTicketTypeButton eventId={eventId} ticket={tt} />
                        <DeleteTicketTypeButton
                          eventId={eventId}
                          ticketTypeId={tt.id}
                          name={tt.name}
                        />
                      </div>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cena</span>
                        <span className="tabular-nums font-medium">{formatPrice(tt.price)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Opłacone / Pula</span>
                        <span className="tabular-nums">
                          {tt.quantity_total === null ? (
                            <span>
                              {paidQty}
                              {pendingQty > 0 && (
                                <span className="text-muted-foreground"> (+{pendingQty})</span>
                              )}{" "}
                              / <span className="text-muted-foreground">∞</span>
                            </span>
                          ) : (
                            <span>
                              {paidQty}
                              {pendingQty > 0 && (
                                <span className="text-muted-foreground"> (+{pendingQty})</span>
                              )}{" "}
                              / {tt.quantity_total}
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Okno sprzedaży</span>
                        <span className="text-right text-xs text-muted-foreground">
                          {formatDateRange(tt.sales_start, tt.sales_end)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t pt-3">
                      <span className="text-muted-foreground">Aktywny</span>
                      <TicketTypeToggle
                        eventId={eventId}
                        ticketTypeId={tt.id}
                        enabled={tt.enabled}
                      />
                    </div>
                    {(soldOut || (!soldOut && avail !== null && avail <= 10)) && (
                      <div className="mt-2">
                        {soldOut ? (
                          <Badge variant="destructive" className="text-xs">Wyprzedany</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Ostatnie {avail}</Badge>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop table (sm+) */}
            <div className="hidden overflow-hidden rounded-lg border sm:block">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Nazwa</th>
                    <th className="px-4 py-3 text-right font-medium">Cena</th>
                    <th className="px-4 py-3 text-right font-medium">Opłacone / Pula</th>
                    <th className="px-4 py-3 text-left font-medium">Okno sprzedaży</th>
                    <th className="px-4 py-3 text-center font-medium">Aktywny</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ticketTypes.map((tt) => {
                    const avail = availableQuantity(tt);
                    const soldOut = isTicketTypeSoldOut(tt);
                    const paidQty = tt.paid_quantity ?? tt.quantity_sold;
                    const pendingQty = tt.active_pending_quantity ?? 0;
                    return (
                      <tr key={tt.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <div className="font-medium">{tt.name}</div>
                          {tt.description && (
                            <div className="text-xs text-muted-foreground line-clamp-1">
                              {tt.description}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatPrice(tt.price)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {tt.quantity_total === null ? (
                            <span>
                              {paidQty}
                              {pendingQty > 0 && (
                                <span className="text-muted-foreground"> (+{pendingQty})</span>
                              )}{" "}
                              / <span className="text-muted-foreground">∞</span>
                            </span>
                          ) : (
                            <span>
                              {paidQty}
                              {pendingQty > 0 && (
                                <span className="text-muted-foreground"> (+{pendingQty})</span>
                              )}{" "}
                              / {tt.quantity_total}
                              {soldOut && (
                                <Badge variant="destructive" className="ml-2 text-xs">
                                  Wyprzedany
                                </Badge>
                              )}
                              {!soldOut && avail !== null && avail <= 10 && (
                                <Badge variant="secondary" className="ml-2 text-xs">
                                  Ostatnie {avail}
                                </Badge>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {formatDateRange(tt.sales_start, tt.sales_end)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <TicketTypeToggle
                            eventId={eventId}
                            ticketTypeId={tt.id}
                            enabled={tt.enabled}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <EditTicketTypeButton eventId={eventId} ticket={tt} />
                            <DeleteTicketTypeButton
                              eventId={eventId}
                              ticketTypeId={tt.id}
                              name={tt.name}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* ---- Discount codes ---- */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div>
            <h2 className="text-xl font-semibold">Kody rabatowe</h2>
            <p className="text-sm text-muted-foreground">
              Procentowe lub kwotowe zniżki; opcjonalnie z limitem i datą ważności.
            </p>
          </div>
          <CreateDiscountCodeButton eventId={eventId} />
        </div>

        {discountCodes.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            Brak kodów rabatowych.
          </div>
        ) : (
          <div className="overflow-x-auto overflow-hidden rounded-lg border">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Kod</th>
                  <th className="px-4 py-3 text-left font-medium">Rabat</th>
                  <th className="px-4 py-3 text-right font-medium">Użycia</th>
                  <th className="px-4 py-3 text-left font-medium">Ważność</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {discountCodes.map((dc) => {
                  const exhausted =
                    dc.max_uses !== null && dc.uses_count >= dc.max_uses;
                  return (
                    <tr key={dc.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono font-semibold tracking-wider">
                        {dc.code}
                        {!dc.enabled && (
                          <Badge variant="secondary" className="ml-2">
                            Wyłączony
                          </Badge>
                        )}
                        {exhausted && (
                          <Badge variant="destructive" className="ml-2">
                            Wyczerpany
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {dc.kind === "percent"
                          ? `${dc.value}%`
                          : formatPrice(dc.value)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {dc.uses_count}
                        {dc.max_uses !== null && ` / ${dc.max_uses}`}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDateRange(dc.valid_from, dc.valid_until)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DeleteDiscountCodeButton
                          eventId={eventId}
                          codeId={dc.id}
                          code={dc.code}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
