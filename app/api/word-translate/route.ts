import { NextRequest, NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase-auth-server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "edge";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

/**
 * POST /api/word-translate
 * Translates a single word or short phrase for the vocabulary popup.
 *
 * Request: { term: string, sourceLang: string, targetLang: string }
 * Response: { translation: string }
 */
export async function POST(req: NextRequest) {
  const authClient = await createAuthServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(user.id, "word-translate");
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const { term, sourceLang, targetLang } = await req.json() as {
    term: string;
    sourceLang: string;
    targetLang: string;
  };

  if (!term?.trim() || typeof term !== "string" || term.length > 200) {
    return NextResponse.json({ error: "term is required (max 200 chars)" }, { status: 400 });
  }
  if (typeof sourceLang !== "string" || sourceLang.length > 10 ||
      typeof targetLang !== "string" || targetLang.length > 10) {
    return NextResponse.json({ error: "invalid sourceLang/targetLang" }, { status: 400 });
  }

  if (!OPENROUTER_API_KEY) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/Peko-Peko-Bit/lingua-gym-public",
      "X-Title": "LinguaGym",
    },
    body: JSON.stringify({
      model: "google/gemma-3-12b-it",
      messages: [
        {
          role: "system",
          content: `You are a bilingual dictionary. The user gives you a word or short phrase in ${sourceLang}.
Respond with ONLY its most natural ${targetLang} translation — no explanations, no punctuation, no extra words.
If it is a verb, give the dictionary form. Keep it concise.`,
        },
        { role: "user", content: term.trim() },
      ],
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: "Translation service unavailable" }, { status: 502 });
  }

  const data = await response.json() as { choices: { message: { content: string } }[] };
  const translation = data.choices?.[0]?.message?.content?.trim() ?? "";

  return NextResponse.json({ translation });
}

