"use client";

import { PhotoUploader } from "@/components/photo-uploader";
import { photographerFinalizeUpload, photographerStartUpload } from "./actions";

export function PhotographerUpload({ token }: { token: string }) {
  return (
    <PhotoUploader
      start={(meta) => photographerStartUpload(token, meta)}
      finalize={(id) => photographerFinalizeUpload(token, id)}
    />
  );
}
