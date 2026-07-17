import { NextRequest, NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase-auth-server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "edge";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

export async function POST(req: NextRequest) {
  try {
    const authClient = await createAuthServerClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await checkRateLimit(user.id, "generate-title");
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

    const { text, titleLang } = (await req.json()) as {
      text: string;
      titleLang: string;
    };

    if (!text || typeof text !== "string" || !titleLang ||
        typeof titleLang !== "string" || titleLang.length > 10) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Truncate to keep token usage minimal
    const excerpt = text.trim().slice(0, 400);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a session title generator. Given a text excerpt, output a concise title in the language "${titleLang}" that captures the main topic. The title must be 20 characters or fewer. Output ONLY the title text — no quotes, no explanation.`,
          },
          {
            role: "user",
            content: excerpt,
          },
        ],
        max_tokens: 40,
      }),
    });

    if (!response.ok) throw new Error("OpenRouter request failed");

    const data = await response.json();
    const title = data.choices?.[0]?.message?.content?.trim() ?? "";

    return NextResponse.json({ title });
  } catch (error: unknown) {
    console.error("[generate-title]", error);
    return NextResponse.json({ error: "Failed to generate title" }, { status: 500 });
  }
}
