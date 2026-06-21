import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CONTENT: Record<string, { title: string; message: string }> = {
  pending: {
    title: "Rejestracja w trakcie weryfikacji",
    message:
      "Twoja rejestracja wciąż oczekuje na zatwierdzenie przez organizatora.",
  },
  rejected: {
    title: "Brak dostępu",
    message: "Rejestracja na to wydarzenie nie została zatwierdzona.",
  },
  invalid: {
    title: "Link jest nieprawidłowy",
    message: "Nie znaleźliśmy takiej rejestracji dla tego wydarzenia.",
  },
};

export default async function AttendeeAccessStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ reason?: string }>;
}) {
  const { slug } = await params;
  const { reason } = await searchParams;

  const content = CONTENT[reason ?? ""] ?? CONTENT.invalid;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{content.title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground">{content.message}</p>
          {reason === "invalid" && (
            <Button asChild>
              <Link href={`/e/${slug}/register`}>Zarejestruj się</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
