import type { TTSProvider } from "./types";
import { WebSpeechProvider } from "./webSpeech";
import { OpenAITTSProvider } from "./openaiTTS";

export type { TTSProvider };

export function getTTSProvider(): TTSProvider {
  const key = process.env.NEXT_PUBLIC_TTS_PROVIDER ?? "webSpeech";
  switch (key) {
    case "openai":
      return new OpenAITTSProvider();
    default:
      return new WebSpeechProvider();
  }
}
