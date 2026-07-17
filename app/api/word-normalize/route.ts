import { NextRequest, NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase-auth-server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "edge";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

/**
 * POST /api/word-normalize
 * Returns the base/dictionary form and part of speech of a single word.
 * Called in the background after vocabulary registration — never blocks the UI.
 *
 * Request:  { term: string, sourceLang: string }
 * Response: { baseTerm: string, partOfSpeech: string }
 */
export async function POST(req: NextRequest) {
  const authClient = await createAuthServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(user.id, "word-normalize");
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const { term, sourceLang } = await req.json() as {
    term: string;
    sourceLang: string;
  };

  if (typeof term === "string" && term.length > 200) {
    return NextResponse.json({ error: "term too long (max 200 chars)" }, { status: 400 });
  }
  if (sourceLang != null && (typeof sourceLang !== "string" || sourceLang.length > 10)) {
    return NextResponse.json({ error: "invalid sourceLang" }, { status: 400 });
  }
  if (!term?.trim() || !OPENROUTER_API_KEY) {
    return NextResponse.json({ baseTerm: term, partOfSpeech: null });
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
      model: "google/gemini-2.0-flash-lite-001",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a linguistic analyzer for ${sourceLang}.
The user gives you a word or short phrase. Return a JSON object with exactly three keys:
- "baseTerm": the base/dictionary form (infinitive for verbs, singular nominative for nouns/adjectives; for phrases, return as-is)
- "type": "word" if it is a single word, "phrase" if it is an idiom, expression, or multi-word phrase
- "partOfSpeech": when type="word", one of: noun, verb, adjective, adverb, pronoun, preposition, conjunction, interjection; when type="phrase", always null

Example input: "practicando"
Example output: {"baseTerm": "practicar", "type": "word", "partOfSpeech": "verb"}`,
        },
        { role: "user", content: term.trim() },
      ],
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ baseTerm: term, partOfSpeech: null });
  }

  const data = await response.json() as { choices: { message: { content: string } }[] };
  const content = data.choices?.[0]?.message?.content?.trim() ?? "{}";

  try {
    const parsed = JSON.parse(content) as { baseTerm?: string; type?: string; partOfSpeech?: string };
    return NextResponse.json({
      baseTerm: parsed.baseTerm?.trim() || term,
      type: parsed.type ?? "word",
      partOfSpeech: parsed.partOfSpeech?.trim() || null,
    });
  } catch {
    return NextResponse.json({ baseTerm: term, type: "word", partOfSpeech: null });
  }
}

