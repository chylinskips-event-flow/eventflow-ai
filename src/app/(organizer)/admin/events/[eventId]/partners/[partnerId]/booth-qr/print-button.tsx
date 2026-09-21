"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

// Drukowanie inicjuje przeglądarka (window.print). Sam przycisk jest ukryty na
// wydruku (print:hidden na kontenerze w page.tsx).
export function PrintButton() {
  return (
    <Button onClick={() => window.print()}>
      <Printer className="size-4" /> Drukuj
    </Button>
  );
}
