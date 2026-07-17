import type { TTSProvider } from "./types";

const LANG_MAP: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
  ja: "ja-JP",
  ko: "ko-KR",
  ca: "ca-ES",
  fr: "fr-FR",
  de: "de-DE",
  pt: "pt-PT",
  zh: "zh-CN",
  it: "it-IT",
};

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) return Promise.resolve(voices);
  return new Promise(resolve => {
    window.speechSynthesis.addEventListener(
      "voiceschanged",
      () => resolve(window.speechSynthesis.getVoices()),
      { once: true }
    );
  });
}

export class WebSpeechProvider implements TTSProvider {
  isSupported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  async speak(text: string, lang: string, _segmentId: string): Promise<void> {
    if (!this.isSupported()) return;

    const bcp47 = LANG_MAP[lang] ?? lang;
    const voices = await loadVoices();
    const voice =
      voices.find(v => v.lang === bcp47) ??
      voices.find(v => v.lang.startsWith(bcp47.split("-")[0]));

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = bcp47;
      if (voice) utterance.voice = voice;
      utterance.onend = () => resolve();
      utterance.onerror = (e) => {
        if (e.error === "interrupted" || e.error === "canceled") {
          resolve();
          return;
        }
        reject(new Error(e.error));
      };
      window.speechSynthesis.speak(utterance);
    });
  }

  stop(): void {
    if (!this.isSupported()) return;
    window.speechSynthesis.cancel();
  }
}
