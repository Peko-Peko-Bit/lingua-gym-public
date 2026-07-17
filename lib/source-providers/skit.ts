import { SUPPORTED_LANGUAGES } from "@/types";
import {
  SourceProvider,
  GenerateRequest,
  GenerateResult,
  DifficultyLevel,
  SkitCategory,
  SKIT_CATEGORIES,
} from "./types";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const CATEGORY_SCENES: Record<SkitCategory, string[]> = {
  daily: [
    "two friends catching up over coffee after not seeing each other for months",
    "roommates negotiating how to split household chores",
    "a parent and teenager discussing curfew and weekend plans",
    "two neighbors chatting about a new family on the street",
    "friends deciding what to cook for a dinner party",
    "two colleagues venting about a stressful week over lunch",
    "a couple debating whether to adopt a pet",
  ],
  business: [
    "an employee requesting a deadline extension from their manager",
    "a client and consultant clarifying project requirements in a meeting",
    "two colleagues preparing a presentation and dividing responsibilities",
    "a staff member politely declining extra work due to current workload",
    "a manager giving constructive feedback during a performance review",
    "a customer service rep handling a complaint from a frustrated client",
    "a team lead briefing a new employee on company procedures",
  ],
  intellectual: [
    "two people debating whether social media does more harm than good",
    "friends discussing whether artificial intelligence will replace creative jobs",
    "a student and professor comparing two conflicting philosophical theories",
    "two people arguing about the ethics of eating meat",
    "friends debating whether remote work improves or harms productivity",
    "two people discussing the pros and cons of globalization",
    "a conversation about whether progress always leads to happiness",
  ],
  narrative: [
    "two old friends reminiscing about a memorable trip they took together",
    "a grandparent recounting a defining moment from their childhood",
    "two people describing their experience surviving an unexpected storm",
    "friends sharing what they saw at a stunning natural landmark",
    "a person describing their first day in a new city to someone back home",
    "two characters recalling the night they first met, each with different memories",
    "a traveler describing an unusual encounter in a foreign market",
  ],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const DIFFICULTY_INSTRUCTIONS: Record<DifficultyLevel, string> = {
  "Beginner":
    "DIFFICULTY — Beginner: Use only the most common everyday vocabulary (A1–A2 level). " +
    "Keep each line very short and simple. Avoid contractions, idioms, and complex grammar.",

  "Pre-Intermediate":
    "DIFFICULTY — Pre-Intermediate: Use common vocabulary with a few less-frequent words (A2–B1 level). " +
    "Sentences can be slightly longer. Include some questions and short answers.",

  "Intermediate":
    "DIFFICULTY — Intermediate: Use varied, natural vocabulary (B1–B2 level). " +
    "Include idiomatic expressions, modal verbs, and a range of tenses. " +
    "The dialogue should feel like a real conversation.",

  "Advanced":
    "DIFFICULTY — Advanced: Use sophisticated vocabulary with idioms, phrasal verbs, and cultural references (C1–C2 level). " +
    "Include interruptions, hedging language, and nuanced opinions. " +
    "The dialogue should read like a script from a quality TV drama.",
};

export class SkitProvider implements SourceProvider {
  type = "skit" as const;

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    if (!OPENROUTER_API_KEY) {
      throw new Error("API key is not configured");
    }

    const langName = SUPPORTED_LANGUAGES[req.lang] ?? req.lang;
    const studyLang = req.studyLang ?? req.lang;
    const studyLangName = SUPPORTED_LANGUAGES[studyLang] ?? studyLang;
    const categoryId: SkitCategory = (req.options?.skitCategory as SkitCategory) ?? "daily";
    const categoryDef = SKIT_CATEGORIES.find(c => c.id === categoryId) ?? SKIT_CATEGORIES[0];
    const scene = pickRandom(CATEGORY_SCENES[categoryId]);
    const seed = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
    const difficulty: DifficultyLevel = (req.options?.difficulty as DifficultyLevel) ?? "Intermediate";
    const difficultyInstruction = DIFFICULTY_INSTRUCTIONS[difficulty];
    const culturalContext = studyLang !== req.lang
      ? `CULTURAL CONTEXT: This skit is a learning exercise for ${studyLangName} language learners. Use character names, settings, and cultural references typical of ${studyLangName}-speaking cultures — as if the characters are ${studyLangName} speakers having this conversation.`
      : "";

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Peko-Peko-Bit/lingua-gym-public",
        "X-Title": "LinguaGym",
        "X-Or-No-Cache": "1",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `You are a dialogue writer for language-learning exercises.
Your job is to produce a natural, realistic short skit in ${langName} (language code: "${req.lang}").
${culturalContext ? `\n${culturalContext}\n` : ""}
${difficultyInstruction}

CATEGORY — ${categoryDef.label} (${categoryDef.description}):
This skit should focus on ${categoryDef.targetExpressions}.
Keep the tone, vocabulary, and sentence structure consistent with this category throughout.

SCENE: ${scene}.

RULES:
- Write a dialogue between exactly 2 or 3 named characters.
- The skit must be 10 to 14 lines total (one line per speaking turn).
- Format each line as "[[Name]]: dialogue" (e.g., "[[Alice]]: Good morning!").
- Make the conversation flow naturally with a clear beginning, development, and ending.
- Do NOT include stage directions, narration, titles, or any text outside the dialogue lines.
- Return ONLY the dialogue lines, nothing else.

Randomization seed (ignore its meaning, it is only to ensure variety): ${seed}`,
          },
          {
            role: "user",
            content: `Please write a ${difficulty} level ${categoryDef.label} skit in ${langName}.`,
          },
        ],
        temperature: 1.0,
        top_p: 0.95,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} — ${err}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim();

    if (!text) {
      throw new Error("Empty response from AI model");
    }

    return {
      text,
      metadata: { topic: `${categoryDef.label} — ${scene}` },
    };
  }
}

