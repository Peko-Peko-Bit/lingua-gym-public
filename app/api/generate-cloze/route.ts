import { NextRequest, NextResponse } from "next/server";
import { ClozeMetadata, SUPPORTED_LANGUAGES, LanguageCode } from "@/types";
import { createAuthServerClient } from "@/lib/supabase-auth-server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "edge";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

export async function POST(req: NextRequest) {
  try {
    const authClient = await createAuthServerClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await checkRateLimit(user.id, "generate-cloze");
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

    const { segments, source_lang, target_lang = "en" } = await req.json() as {
      segments: { id: string; source_text: string }[];
      source_lang: string;
      target_lang?: string;
    };

    if (!segments?.length || !source_lang) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (segments.length > 100) {
      return NextResponse.json({ error: "Too many segments (max 100)" }, { status: 400 });
    }
    if (typeof source_lang !== "string" || source_lang.length > 10 ||
        typeof target_lang !== "string" || target_lang.length > 10) {
      return NextResponse.json({ error: "Invalid lang" }, { status: 400 });
    }
    for (const s of segments) {
      if (typeof s?.source_text !== "string" || s.source_text.length > 1000) {
        return NextResponse.json({ error: "Segment too long (max 1000 chars)" }, { status: 400 });
      }
    }

    if (!OPENROUTER_API_KEY) {
      return NextResponse.json({ error: "API key is not configured" }, { status: 500 });
    }

    const targetLangName = SUPPORTED_LANGUAGES[target_lang as LanguageCode] ?? target_lang;
    const segmentsJson = JSON.stringify(
      segments.map(s => ({ id: s.id, source_text: s.source_text }))
    );

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Peko-Peko-Bit/lingua-gym-public",
        "X-Title": "LinguaGym",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a language learning exercise designer. The source language is "${source_lang}".

Your task: given an array of text segments, create a cloze (fill-in-the-blank) exercise for each segment.

RULES:
- For each segment, select 2–3 target words or expressions to blank out.
- Prioritize content words (verbs, nouns, adjectives, adverbs, idioms, key grammar points like tense markers or prepositions that change meaning).
- Avoid function words (a, the, is, are, of, to, etc.) unless they are a grammar focus (e.g. a tricky preposition).
- Replace each selected word with a {N} placeholder (0-indexed) in the display_template, preserving the surrounding text exactly.
- For each target, provide the exact original word as "answer" and a brief ${targetLangName} hint (1–3 words) as "hint".

OUTPUT FORMAT — return ONLY valid JSON, no markdown code blocks:
{
  "results": [
    {
      "id": "<segment id>",
      "cloze_metadata": {
        "display_template": "<text with {0}, {1}, ... placeholders>",
        "targets": [
          { "index": 0, "answer": "<word>", "hint": "<brief ${targetLangName} hint>" },
          { "index": 1, "answer": "<word>", "hint": "<brief ${targetLangName} hint>" }
        ]
      }
    }
  ]
}`,
          },
          {
            role: "user",
            content: segmentsJson,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `OpenRouter error: ${err}` }, { status: 502 });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    const parsed = JSON.parse(content) as {
      results: { id: string; cloze_metadata: ClozeMetadata }[];
    };

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("[api/generate-cloze]", error);
    const message = error instanceof Error ? error.message : "Cloze generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

