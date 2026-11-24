import { Card, CardHeader, CardTitle } from "@/components/ui/card";

// notFound() ze strony wydarzenia (nieistniejący slug): HTTP 404 z polskim komunikatem.
export default function EventNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Wydarzenie nie zostało znalezione</CardTitle>
        </CardHeader>
      </Card>
    </main>
  );
}
