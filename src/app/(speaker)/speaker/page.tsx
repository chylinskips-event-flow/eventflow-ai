import type { Metadata } from "next";

export const metadata: Metadata = { title: "Panel prelegenta", robots: { index: false, follow: false } };

export default function SpeakerPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-2xl font-semibold">Panel prelegenta – w budowie</h1>
    </main>
  );
}
