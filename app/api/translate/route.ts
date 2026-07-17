import { NextRequest, NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase-auth-server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "edge";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

function getSegmentLengthGuide(sourceLang: string): string {
  const cjkLangs = ["ja", "zh", "zh-TW", "zh-CN", "ko"];
  return cjkLangs.includes(sourceLang)
    ? "Each segment must be at most 40–45 characters."
    : "Each segment must be at most 100 characters and 20 words.";
}

function isSegmentTooLong(sourceText: string, sourceLang: string): boolean {
  const cjkLangs = ["ja", "zh", "zh-TW", "zh-CN", "ko"];
  if (cjkLangs.includes(sourceLang)) {
    return sourceText.length > 45;
  } else {
    const wordCount = sourceText.trim().split(/\s+/).length;
    return sourceText.length > 100 || wordCount > 20;
  }
}

async function resplitSegment(
  segment: { sourceText: string; referenceTranslation: string },
  sourceLang: string,
  targetLang: string
): Promise<{ sourceText: string; referenceTranslation: string }[]> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/Peko-Peko-Bit/lingua-gym-public",
      "X-Title": "LinguaGym"
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        {
          role: "system",
          content: `You are a text segmentation assistant.
Split the given ${sourceLang} text into shorter segments and translate each to ${targetLang}.
${getSegmentLengthGuide(sourceLang)}
Return ONLY a valid JSON array. No markdown, no code fences. Start with [ and end with ].
Each object must have exactly two keys: "sourceText" and "referenceTranslation".`
        },
        {
          role: "user",
          content: segment.sourceText
        }
      ],
    })
  });

  if (!response.ok) {
    throw new Error(`OpenRouter error: ${response.status}`);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Empty AI response");
  }
  const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
  return JSON.parse(cleaned);
}

export async function POST(req: NextRequest) {
  try {
    const authClient = await createAuthServerClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await checkRateLimit(user.id, "translate");
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

    const { text, sourceLang = "es", targetLang = "en" } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }
    if (text.length > 10000) {
      return NextResponse.json({ error: "Text too long (max 10000 chars)" }, { status: 400 });
    }
    if (typeof sourceLang !== "string" || sourceLang.length > 10 ||
        typeof targetLang !== "string" || targetLang.length > 10) {
      return NextResponse.json({ error: "Invalid lang" }, { status: 400 });
    }

    if (!OPENROUTER_API_KEY) {
      return NextResponse.json({ error: "API key is not configured" }, { status: 500 });
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Peko-Peko-Bit/lingua-gym-public",
        "X-Title": "LinguaGym"
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `You are a professional translator and text segmenter.
The source language is "${sourceLang}" and the target language is "${targetLang}".

Your task is to:
1. Split the provided source text (written in ${sourceLang}) into meaningful translation segments (sentences or logical phrases).
2. For each segment, provide a high-quality "reference translation" in ${targetLang}.

CRITICAL RULES:
- DO NOT break URLs, special characters, or technical identifiers. Keep them within their respective segments.
- Preserve all line breaks and original spacing within or between segments where appropriate to maintain document structure.
- Split aggressively at clause boundaries (, ; : — and conjunctions) to keep segments short. ${getSegmentLengthGuide(sourceLang)}
- Return ONLY a valid JSON array of objects.
- Each object must have exactly two keys: "sourceText" and "referenceTranslation".

JSON Format Example:
[
  { "sourceText": "Original sentence in ${sourceLang}.", "referenceTranslation": "Translated sentence in ${targetLang}." }
]`
          },
          {
            role: "user",
            content: text
          }
        ],
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[api/translate] OpenRouter error:", err);
      return NextResponse.json({ error: "AI translation failed" }, { status: 502 });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: "Empty AI response" }, { status: 502 });
    }

    try {
      const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
      const segments = JSON.parse(cleaned);

      const processedSegments = await Promise.all(
        segments.map(async (seg: { sourceText: string; referenceTranslation: string }) => {
          if (isSegmentTooLong(seg.sourceText, sourceLang)) {
            try {
              return await resplitSegment(seg, sourceLang, targetLang);
            } catch {
              return [seg];
            }
          }
          return [seg];
        })
      );

      const finalSegments = processedSegments.flat();
      return NextResponse.json(finalSegments);
    } catch {
      console.error("Failed to parse AI response:", content);
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

  } catch (error) {
    console.error("Translation API error:", error);
    const message = error instanceof Error ? error.message : "Translation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

