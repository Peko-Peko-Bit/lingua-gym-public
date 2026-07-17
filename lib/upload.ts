import { supabase } from "./supabase";
import { Session } from "@/types";

const BUCKET = "session-files";

export interface UploadResult {
  url: string;
  provider: Session["storageProvider"];
  path: string;
}

/**
 * Upload an image or PDF to Supabase Storage.
 * Returns the public/signed URL, storage provider, and storage path.
 *
 * For files > 1 GB or long-term archival, route to GCS instead.
 * See the TODO comment below for the GCS extension point.
 */
export async function uploadSessionFile(
  sessionId: string,
  file: File
): Promise<UploadResult> {
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${sessionId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true });

  if (error) {
    throw new Error(`[upload] Supabase Storage upload failed: ${error.message}`);
  }

  // Generate a long-lived signed URL (7 days). Switch to getPublicUrl()
  // if the bucket is set to public in the Supabase dashboard.
  const { data: signedData, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7);

  if (signedError || !signedData?.signedUrl) {
    throw new Error(`[upload] Failed to create signed URL: ${signedError?.message}`);
  }

  return {
    url: signedData.signedUrl,
    provider: "supabase",
    path,
  };
}

/**
 * Delete a previously uploaded file from Supabase Storage.
 * Call this when a session is deleted and had a sourceFileUrl.
 */
export async function deleteSessionFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    console.error("[upload] deleteSessionFile:", error.message);
  }
}

// ---------------------------------------------------------------------------
// TODO: GCS extension point
// ---------------------------------------------------------------------------
// When files exceed 1 GB or need long-term archival, route here instead.
//
// export async function uploadSessionFileToGCS(
//   sessionId: string,
//   file: File
// ): Promise<UploadResult> {
//   // 1. Call a server-side API route (/api/gcs-upload) that uses the
//   //    Google Cloud Storage SDK with GOOGLE_CLOUD_STORAGE_KEY.
//   // 2. Return { url, provider: "gcs", path }.
// }
