"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateImageFile, MB } from "@/lib/upload-validation";
import { uploadAttendeeAvatar, removeAttendeeAvatar } from "./actions";

export function AvatarUpload({
  slug,
  initialAvatarUrl,
  initials,
}: {
  slug: string;
  initialAvatarUrl: string | null;
  initials: string;
}) {
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [file, setFile] = useState<File | null>(null);
  // Zmiana klucza resetuje <input type="file"> (nie da się go wyczyścić
  // sterowanym value).
  const [inputKey, setInputKey] = useState(0);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleUpload() {
    if (!file) {
      setMessage({ type: "error", text: "Wybierz plik ze zdjęciem." });
      return;
    }
    // Walidacja przed wysłaniem: zły typ lub >2MB inaczej wywołałby crash 413
    // (limit body Server Actions) zanim akcja się uruchomi.
    const validationError = validateImageFile(file, 2 * MB);
    if (validationError) {
      setMessage({ type: "error", text: validationError });
      return;
    }
    const formData = new FormData();
    formData.set("avatar", file);
    startTransition(async () => {
      const result = await uploadAttendeeAvatar(slug, formData);
      if (result.status === "success") {
        setAvatarUrl(result.avatarUrl ?? null);
        setFile(null);
        setInputKey((key) => key + 1);
        setMessage({ type: "success", text: result.message ?? "Zapisano ✓" });
        router.refresh();
      } else {
        setMessage({
          type: "error",
          text: result.message ?? "Nie udało się wgrać zdjęcia.",
        });
      }
    });
  }

  function handleRemove() {
    startTransition(async () => {
      const result = await removeAttendeeAvatar(slug);
      if (result.status === "success") {
        setAvatarUrl(null);
        setFile(null);
        setInputKey((key) => key + 1);
        setMessage({ type: "success", text: result.message ?? "Usunięto." });
        router.refresh();
      } else {
        setMessage({
          type: "error",
          text: result.message ?? "Nie udało się usunąć zdjęcia.",
        });
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Avatar className="size-20">
        {avatarUrl && <AvatarImage src={avatarUrl} alt="Twój avatar" />}
        <AvatarFallback className="text-xl">{initials || "?"}</AvatarFallback>
      </Avatar>

      <Input
        key={inputKey}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="max-w-xs"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={handleUpload}
          disabled={isPending}
        >
          {isPending ? "Wgrywanie..." : "Wgraj zdjęcie"}
        </Button>
        {avatarUrl && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleRemove}
            disabled={isPending}
          >
            Usuń zdjęcie
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        JPG, PNG lub WebP, max 2MB. Zdjęcie będzie widoczne dla innych
        uczestników.
      </p>

      {message && (
        <p
          className={
            message.type === "error"
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
