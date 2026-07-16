"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Ostylowany wybór pliku: ukryty natywny <input> (zachowuje name/accept/id,
 * więc FormData, <Label htmlFor> i walidacja onSubmit działają jak dotąd) +
 * widoczny Button i nazwa wybranego pliku. Reset po zapisie: nadaj `key`,
 * którego zmiana remontuje komponent (czyści input i nazwę).
 */
export function FileInput({
  id,
  name,
  accept,
  disabled,
  onFileChange,
  buttonLabel = "Wybierz plik",
  className,
}: {
  id?: string;
  name: string;
  accept?: string;
  disabled?: boolean;
  onFileChange?: (file: File | null) => void;
  buttonLabel?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <input
        ref={inputRef}
        id={id}
        type="file"
        name={name}
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          setFileName(file?.name ?? null);
          onFileChange?.(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-4" />
        {buttonLabel}
      </Button>
      <span className="max-w-[200px] truncate text-sm text-muted-foreground">
        {fileName ?? "Nie wybrano pliku"}
      </span>
    </div>
  );
}
