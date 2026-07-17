import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/ocr
 *
 * Accepts a file URL (already uploaded to Supabase Storage or GCS) and
 * runs Google Cloud Vision API OCR on it.
 *
 * Request body:
 *   { fileUrl: string, sessionId: string }
 *
 * Response:
 *   { text: string, segments: { text: string, boundingBox: BoundingBox }[] }
 */
export const runtime = "edge";

// ---------------------------------------------------------------------------
// TODO: Full implementation
// ---------------------------------------------------------------------------
// 1. Download the file from fileUrl (or pass a GCS URI directly to Vision API).
// 2. Call Google Cloud Vision API — DOCUMENT_TEXT_DETECTION for high-accuracy
//    multi-language OCR (handles Japanese, Korean, etc.).
//    SDK: @google-cloud/vision  OR  REST API with GOOGLE_CLOUD_VISION_KEY.
// 3. Map the response's `pages[].blocks[].paragraphs[].words[]` structure into
//    logical sentence segments, preserving bounding box coordinates.
// 4. Return the raw full text + structured segments with bounding boxes so the
//    frontend can highlight matched regions on the original image.
//
// Vision API response shape (relevant excerpt):
// {
//   fullTextAnnotation: {
//     text: string,          ← use as raw_ocr_output in the sessions table
//     pages: [{
//       blocks: [{
//         paragraphs: [{
//           words: [{
//             symbols: [{ text, boundingBox: { vertices: [{x,y}] } }]
//           }]
//         }]
//       }]
//     }]
//   }
// }
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const { fileUrl, sessionId } = await req.json() as {
    fileUrl: string;
    sessionId: string;
  };

  if (!fileUrl || !sessionId) {
    return NextResponse.json(
      { error: "fileUrl and sessionId are required" },
      { status: 400 }
    );
  }

  if (!process.env.GOOGLE_CLOUD_VISION_KEY) {
    return NextResponse.json(
      { error: "GOOGLE_CLOUD_VISION_KEY is not configured" },
      { status: 503 }
    );
  }

  // TODO: replace stub with real Vision API call
  return NextResponse.json(
    {
      error: "OCR not yet implemented",
      hint: "See TODO comments in app/api/ocr/route.ts",
    },
    { status: 501 }
  );
}
