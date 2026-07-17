import { NextRequest, NextResponse } from "next/server";
import { SUPPORTED_LANGUAGES, LanguageCode } from "@/types";
import { createAuthServerClient } from "@/lib/supabase-auth-server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "edge";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

function buildSystemPrompt(mode: string, sourceLang: string, targetLang: string): string {
  const targetLangName = SUPPORTED_LANGUAGES[targetLang as LanguageCode] ?? targetLang;
  if (mode === "comprehension") {
    return `You are a language comprehension evaluator.
The source language is "${sourceLang}" (the language being studied).
The target language is "${targetLang}" (the user's native language).
Your job is to evaluate whether the user correctly understood the MEANING of the source text, based on their translation into their native language.

EVALUATION CRITERIA:
- Focus ONLY on whether the core meaning was understood correctly. Ignore phrasing quality, naturalness, or style in the user's native language.
- "green": The core meaning is correctly and completely understood.
- "yellow": The meaning is mostly understood but a nuance was missed, or part of the meaning is slightly off.
- "red": The meaning is clearly wrong or significantly incomplete — a genuine misunderstanding.

OUTPUT FORMAT:
Return ONLY a JSON object with exactly these three keys:
- "status": the string "green", "yellow", or "red"
- "reason": A concise 1-2 sentence explanation in ${targetLangName} of what the user got right or wrong about the meaning.
- "suggestion": If yellow or red, show what the correct understanding should be in ${targetLang}. Empty string if green.`;
  }

  // phrasing (default)
  return `You are a strict but fair professional translation reviewer.
The source language is "${sourceLang}" and the target language is "${targetLang}".
Your job is to evaluate whether a user's translation (in ${targetLang}) accurately conveys the *meaning* of the source text (in ${sourceLang}).

EVALUATION CRITERIA:
- The absolute priority is the *meaning*. Grammatical perfection is secondary if the core message is conveyed accurately and naturally.
- "green": Meaning is perfectly conveyed or has only trivial differences.
- "yellow": Meaning is mostly conveyed, but there are nuanced differences, unnatural phrasing, or minor omissions.
- "red": Clear mistranslation, significant omissions, or fatal errors that change the core meaning.

INPUT:
You will receive the original text (in ${sourceLang}), a reference translation (in ${targetLang}), and the user's translation (in ${targetLang}).

OUTPUT FORMAT:
You MUST return ONLY a JSON object with exactly these three keys:
- "status": the string "green", "yellow", or "red"
- "reason": A very concise, 1-2 sentence explanation in ${targetLangName} of why this status was given. Focus on the meaning.
- "suggestion": A concise suggested better phrasing in ${targetLang} (optional, leave as empty string if green and perfect).`;
}

function buildUserMessage(mode: string, sourceText: string, referenceTranslation: string, userTranslation: string, sourceLang: string, targetLang: string): string {
  if (mode === "comprehension") {
    return `Source Text (${sourceLang}):\n${sourceText}\n\nUser's Understanding (${targetLang}):\n${userTranslation}`;
  }
  return `Source Text:\n${sourceText}\n\nReference Translation:\n${referenceTranslation}\n\nUser Translation:\n${userTranslation}`;
}

export async function POST(req: NextRequest) {
  try {
    const authClient = await createAuthServerClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await checkRateLimit(user.id, "check");
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

    const {
      sourceText,
      referenceTranslation,
      userTranslation,
      sourceLang = "es",
      targetLang = "en",
      inputMode = "phrasing",
    } = await req.json();

    if (!sourceText || !userTranslation) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    for (const field of [sourceText, referenceTranslation, userTranslation]) {
      if (field != null && (typeof field !== "string" || field.length > 2000)) {
        return NextResponse.json({ error: "Field too long (max 2000 chars)" }, { status: 400 });
      }
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
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(inputMode, sourceLang, targetLang),
          },
          {
            role: "user",
            content: buildUserMessage(inputMode, sourceText, referenceTranslation, userTranslation, sourceLang, targetLang),
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[api/check] OpenRouter error:", err);
      return NextResponse.json({ error: "AI evaluation failed" }, { status: 502 });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: "Empty AI response" }, { status: 502 });
    }

    try {
      const parsed = JSON.parse(content);
      return NextResponse.json({
        status: parsed.status,
        reason: parsed.reason,
        suggestion: parsed.suggestion,
      });
    } catch {
      console.error("Failed to parse evaluation response:", content);
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

  } catch (error) {
    console.error("Evaluation API error:", error);
    const message = error instanceof Error ? error.message : "Evaluation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

