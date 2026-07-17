import type { TTSProvider } from "./types";

export class OpenAITTSProvider implements TTSProvider {
  isSupported(): boolean {
    // 未実装 — /api/tts エンドポイント実装後に true を返すよう変更する
    return false;
  }

  async speak(_text: string, _lang: string, _segmentId: string): Promise<void> {
    // TODO: 実装例
    // const res = await fetch("/api/tts", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({ text: _text, lang: _lang }),
    // });
    // const blob = await res.blob();
    // const url = URL.createObjectURL(blob);
    // const audio = new Audio(url);
    // await audio.play();
  }

  stop(): void {
    // TODO: 再生中の Audio インスタンスを停止する
  }
}
