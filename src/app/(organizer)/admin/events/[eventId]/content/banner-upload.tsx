"use client";

import { useActionState } from "react";
import { uploadEventBanner, type ContentFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const initialState: ContentFormState = { status: "idle" };

export function BannerUpload({
  eventId,
  bannerUrl,
}: {
  eventId: string;
  bannerUrl: string | null;
}) {
  const [state, formAction, isPending] = useActionState(
    uploadEventBanner.bind(null, eventId),
    initialState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Baner eventu</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          action={formAction}
          encType="multipart/form-data"
          className="flex flex-col gap-4"
        >
          {bannerUrl && (
            <img
              src={bannerUrl}
              alt="Baner eventu"
              className="h-32 w-full rounded border object-cover"
            />
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="banner">Plik banera</Label>
            <Input
              id="banner"
              name="banner"
              type="file"
              accept="image/jpeg,image/png,image/webp"
            />
          </div>
          {state.status === "error" && (
            <p className="text-sm text-destructive">{state.message}</p>
          )}
          {state.status === "success" && (
            <p className="text-sm text-muted-foreground">{state.message}</p>
          )}
          <Button type="submit" disabled={isPending} variant="outline">
            {isPending ? "Wgrywanie..." : "Wgraj baner"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
