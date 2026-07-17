import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/source-providers";
import { SourceType } from "@/lib/source-providers/types";
import { LanguageCode } from "@/types";
import { createAuthServerClient } from "@/lib/supabase-auth-server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const authClient = await createAuthServerClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await checkRateLimit(user.id, "generate");
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

    const { type, lang, studyLang, options } = (await req.json()) as {
      type: SourceType;
      lang: LanguageCode;
      studyLang?: LanguageCode;
      options?: Record<string, unknown>;
    };

    if (!type || !lang) {
      return NextResponse.json(
        { error: "Missing required fields: type, lang" },
        { status: 400 }
      );
    }
    // lang codes end up interpolated into the AI prompt when not in
    // SUPPORTED_LANGUAGES, so reject anything that isn't a short code
    if (typeof lang !== "string" || lang.length > 10 ||
        (studyLang != null && (typeof studyLang !== "string" || studyLang.length > 10))) {
      return NextResponse.json({ error: "Invalid lang" }, { status: 400 });
    }

    const provider = getProvider(type);
    const result = await provider.generate({ type, lang, studyLang, options });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Generate API error:", error);
    const message = error instanceof Error ? error.message : "Failed to generate text";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
