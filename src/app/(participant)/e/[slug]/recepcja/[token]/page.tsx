import { notFound } from "next/navigation";
import { getEventByReceptionToken, getReceptionList } from "@/lib/reception";
import { ReceptionPanel } from "@/components/reception-panel";
import { staffCheckInByQr, staffCheckInById, staffUndoCheckIn } from "./actions";

export default async function StaffReceptionPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { token } = await params;

  const event = await getEventByReceptionToken(token);
  if (!event) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-center">
          <p className="text-sm font-semibold">Link nieaktywny</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ten link recepcji wygasł lub został odwołany przez organizatora.
          </p>
        </div>
      </main>
    );
  }

  const attendees = await getReceptionList(event.id);

  const checkInByQr = staffCheckInByQr.bind(null, token);
  const checkInById = staffCheckInById.bind(null, token);
  const undoCheckIn = staffUndoCheckIn.bind(null, token);

  return (
    <main>
      {/* Nagłówek eventu — widoczny tylko przed scrollem */}
      <div className="px-4 pt-4 pb-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Recepcja
        </p>
        <h1 className="text-lg font-semibold leading-tight">{event.name}</h1>
      </div>

      <ReceptionPanel
        attendees={attendees}
        checkInByQrAction={checkInByQr}
        checkInByIdAction={checkInById}
        undoCheckInAction={undoCheckIn}
        stickyTopClass="top-0"
      />
    </main>
  );
}
