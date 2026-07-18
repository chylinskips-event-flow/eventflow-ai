import QRCode from "qrcode";
import { headers } from "next/headers";
import { getOrigin } from "@/lib/request-origin";

/**
 * Kod QR do wymiany kontaktów jako gotowy <img> (data-URL, generowany
 * server-side). Wspólny dla /profile (pełna wizytówka) i ekranu głównego
 * (kompaktowy szybki dostęp) — jeden mechanizm, różny tylko rozmiar/oprawa.
 *
 * origin przez getOrigin: na GET-renderze strony nie ma nagłówka Origin, więc
 * leci gałąź fallback host/x-forwarded-host — spójnie z linkami w mailach.
 */
export async function ContactQr({
  slug,
  contactCode,
  size = 240,
  className,
}: {
  slug: string;
  contactCode: string;
  size?: number;
  className?: string;
}) {
  const origin = getOrigin(await headers());
  const connectUrl = `${origin}/e/${slug}/connect/${contactCode}`;
  const dataUrl = await QRCode.toDataURL(connectUrl, { width: size, margin: 2 });

  return (
    // eslint-disable-next-line @next/next/no-img-element -- data-URL, nie zdalny
    // zasób; next/image tu nie ma czego optymalizować
    <img
      src={dataUrl}
      alt="Kod QR do wymiany kontaktu"
      width={size}
      height={size}
      className={className}
    />
  );
}
