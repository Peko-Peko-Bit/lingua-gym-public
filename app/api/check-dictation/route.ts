import { NextRequest, NextResponse } from "next/server";
import { DictationResult, SUPPORTED_LANGUAGES, LanguageCode } from "@/types";
import { createAuthServerClient } from "@/lib/supabase-auth-server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "edge";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

export async function POST(req: NextRequest) {
  try {
    const authClient = await createAuthServerClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await checkRateLimit(user.id, "check-dictation");
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

    const { source_text, targets, source_lang, target_lang = "en" } = await req.json() as {
      source_text: string;
      targets: { index: number; answer: string; user_input: string }[];
      source_lang: string;
      target_lang?: string;
    };

    if (!source_text || !targets?.length || !source_lang) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (typeof source_text !== "string" || source_text.length > 10000 || targets.length > 50) {
      return NextResponse.json({ error: "Input too large" }, { status: 400 });
    }
    if (typeof source_lang !== "string" || source_lang.length > 10 ||
        typeof target_lang !== "string" || target_lang.length > 10) {
      return NextResponse.json({ error: "Invalid lang" }, { status: 400 });
    }
    for (const t of targets) {
      if (typeof t?.answer !== "string" || t.answer.length > 500 ||
          typeof t?.user_input !== "string" || t.user_input.length > 500) {
        return NextResponse.json({ error: "Target entry too large" }, { status: 400 });
      }
    }

    if (!OPENROUTER_API_KEY) {
      return NextResponse.json({ error: "API key is not configured" }, { status: 500 });
    }

    const targetLangName = SUPPORTED_LANGUAGES[target_lang as LanguageCode] ?? target_lang;
    const targetModel = "google/gemini-2.5-flash";

    const targetsJson = targets
      .map(t => `[${t.index}] correct: "${t.answer}" / user: "${t.user_input}"`)
      .join("\n");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Peko-Peko-Bit/lingua-gym-public",
        "X-Title": "LinguaGym",
      },
      body: JSON.stringify({
        model: targetModel,
        messages: [
          {
            role: "system",
            content: `You are a language learning evaluator. The source language is "${source_lang}".

Evaluate each blank in a dictation exercise. For each blank you receive the correct answer and the user's input.

SCORING CRITERIA:
- "green": Exact match, or trivial spelling error (1 character off) with clearly correct intent.
- "yellow": Meaning is close but time/tense differs, a near-synonym used, or multiple spelling errors.
- "red": Completely wrong word, or an answer that breaks the sentence meaning.

OUTPUT FORMAT — return ONLY valid JSON, no markdown:
{
  "results": [
    { "index": <N>, "status": "green"|"yellow"|"red", "reason": "<concise ${targetLangName} explanation>" }
  ],
  "overall_advice": "<1-2 sentence ${targetLangName} comment on the overall performance>"
}`,
          },
          {
            role: "user",
            content: `Source sentence: "${source_text}"\n\nBlanks to evaluate:\n${targetsJson}`,
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
    if (!content) {
      return NextResponse.json({ error: "Empty AI response" }, { status: 502 });
    }

    const parsed = JSON.parse(content) as {
      results: DictationResult[];
      overall_advice: string;
    };

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("[api/check-dictation]", error);
    const message = error instanceof Error ? error.message : "Dictation check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

