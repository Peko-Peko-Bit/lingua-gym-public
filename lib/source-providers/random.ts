import { SUPPORTED_LANGUAGES } from "@/types";
import { SourceProvider, GenerateRequest, GenerateResult, DifficultyLevel } from "./types";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

/**
 * A diverse set of topic categories.
 * The AI picks one at random each call, and the seed word adds extra variance.
 */
const TOPIC_CATEGORIES = [
  "travel and adventure",
  "science and technology",
  "cooking and food culture",
  "history and historical events",
  "sports and fitness",
  "art and music",
  "nature and the environment",
  "daily life and routines",
  "economics and business",
  "health and medicine",
  "literature and storytelling",
  "cinema and entertainment",
  "education and learning",
  "politics and society",
  "space and astronomy",
  "fashion and design",
  "philosophy and ethics",
  "animals and wildlife",
  "urban life and architecture",
  "festivals and traditions",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const DIFFICULTY_INSTRUCTIONS: Record<DifficultyLevel, string> = {
  "Beginner":
    "DIFFICULTY — Beginner: Use only the most common, everyday vocabulary (A1–A2 level). " +
    "Write very short, simple sentences (subject–verb–object). " +
    "Avoid subordinate clauses, complex tenses, and idioms. " +
    "The text should be understandable by someone who has just started learning the language.",

  "Pre-Intermediate":
    "DIFFICULTY — Pre-Intermediate: Use common vocabulary with a few less-frequent words (A2–B1 level). " +
    "Mix simple sentences with occasionally compound sentences joined by coordinating conjunctions (and, but, so). " +
    "Stick to present, past simple, and future tenses. " +
    "The text should be accessible to a learner with basic conversational knowledge.",

  "Intermediate":
    "DIFFICULTY — Intermediate: Use a varied, natural vocabulary including some abstract nouns and collocations (B1–B2 level). " +
    "Mix sentence lengths; use relative clauses, conditionals, and a range of tenses including perfect and continuous aspects. " +
    "The text should read like a general-interest magazine article.",

  "Advanced":
    "DIFFICULTY — Advanced: Use sophisticated, nuanced vocabulary including idiomatic expressions, technical terms, and low-frequency words (C1–C2 level). " +
    "Use complex sentence structures: nested clauses, passive voice, inversion, and varied discourse markers. " +
    "The text can challenge even an experienced learner and should read like quality journalism or literary prose.",
};

export class RandomTopicProvider implements SourceProvider {
  type = "random" as const;

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    if (!OPENROUTER_API_KEY) {
      throw new Error("API key is not configured");
    }

    const langName = SUPPORTED_LANGUAGES[req.lang] ?? req.lang;
    const studyLang = req.studyLang ?? req.lang;
    const studyLangName = SUPPORTED_LANGUAGES[studyLang] ?? studyLang;
    const chosenCategory = pickRandom(TOPIC_CATEGORIES);
    const seed = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
    const difficulty: DifficultyLevel = (req.options?.difficulty as DifficultyLevel) ?? "Intermediate";
    const difficultyInstruction = DIFFICULTY_INSTRUCTIONS[difficulty];
    const culturalContext = studyLang !== req.lang
      ? `CULTURAL CONTEXT: This passage is a learning exercise for ${studyLangName} language learners. Set the passage in contexts, places, or situations familiar to ${studyLangName}-speaking cultures.`
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
            content: `You are a creative text generator for language-learning exercises.
Your job is to produce a coherent, natural-sounding passage in ${langName} (language code: "${req.lang}").
${culturalContext ? `\n${culturalContext}\n` : ""}
${difficultyInstruction}

RULES:
- Write exactly 10 to 12 sentences that form a unified, readable passage.
- The passage MUST be about an interesting, SPECIFIC topic within the category "${chosenCategory}".
  Do NOT write something generic — pick a concrete subject, story, or scenario.
- Strictly match the difficulty level described above. This is the most important instruction.
- Do NOT include any translation, explanation, title, or metadata.
- Return ONLY the passage text, nothing else.

Randomization seed (ignore its meaning, it is only to ensure variety): ${seed}`,
          },
          {
            role: "user",
            content: `Please generate a ${difficulty} level passage in ${langName}.`,
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
      metadata: { topic: chosenCategory },
    };
  }
}

