import type { Metadata } from "next";
import { Camera } from "lucide-react";
import { resolveUploadLink } from "@/lib/gallery";
import { formatDateTime } from "@/lib/format";
import { MAX_PHOTOS_PER_EVENT } from "@/lib/gallery-core";
import { PhotographerUpload } from "./photographer-upload";

// Strona fotografa — tylko wgrywanie (bez podglądu galerii), bez logowania.
// Dostęp = znajomość tokenu linku, unieważnialnego przez organizatora.

// Przetwarzanie zdjęć (sharp, HEIC) w akcjach tej strony — więcej czasu niż domyślnie.
export const maxDuration = 60;

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const ctx = await resolveUploadLink(token);
  return {
    title: ctx ? `${ctx.event.name} — wgrywanie zdjęć` : "Wgrywanie zdjęć",
    robots: { index: false, follow: false },
  };
}

export default async function PhotographerPage({ params }: Props) {
  const { token } = await params;
  const ctx = await resolveUploadLink(token);

  if (!ctx) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-semibold">Link jest nieaktywny</h1>
        <p className="text-sm text-muted-foreground">
          Link do wgrywania zdjęć wygasł albo został unieważniony. Poproś organizatora o nowy link.
        </p>
      </main>
    );
  }

  const { link, event } = ctx;
  const expires = formatDateTime(link.expires_at, null);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Camera className="size-4" />
          Wgrywanie zdjęć
        </p>
        <h1 className="text-2xl font-semibold">{event.name}</h1>
        <p className="text-sm text-muted-foreground">Fotograf: {link.label}</p>
      </div>
      <p className="text-sm text-muted-foreground">
        Wybierz zdjęcia z telefonu lub komputera — możesz zaznaczyć wiele naraz. Zdjęcia trafiają do organizatora;
        ta strona nie pokazuje galerii.
        {link.max_photos ? ` Limit tego linku: ${link.max_photos} zdjęć.` : ` Limit wydarzenia: ${MAX_PHOTOS_PER_EVENT} zdjęć.`}
        {expires ? ` Link ważny do ${expires}.` : ""}
      </p>
      <PhotographerUpload token={token} />
    </main>
  );
}
