"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { getTTSProvider } from "@/lib/speech";

export function useSpeech() {
  const [currentSegmentId, setCurrentSegmentId] = useState<string | null>(null);
  // isSupported は useEffect で確定させ、SSR と hydration のミスマッチを防ぐ
  const [isSupported, setIsSupported] = useState(false);
  const provider = useRef(getTTSProvider());

  useEffect(() => {
    setIsSupported(provider.current.isSupported());
  }, []);

  const speak = useCallback(async (text: string, lang: string, segmentId: string) => {
    // 先にIDをセット — ■を即座に表示するため cancel より前に行う
    setCurrentSegmentId(segmentId);

    // 前の再生を止める
    if (typeof window !== "undefined") {
      window.speechSynthesis.cancel();
    }

    // cancel() の非同期完了を待つバッファ
    await new Promise<void>(r => setTimeout(r, 50));

    try {
      await provider.current.speak(text, lang, segmentId);
    } catch {
      // speak エラーは非クリティカル
    } finally {
      // 別セグメントがすでに再生開始していたらリセットしない
      setCurrentSegmentId(prev => (prev === segmentId ? null : prev));
    }
  }, []);

  const stop = useCallback(() => {
    provider.current.stop();
    setCurrentSegmentId(null);
  }, []);

  // isSpeaking を独立した state にすると cancel/speak の競合で瞬間リセットが起きるため導出する
  const isSpeaking = currentSegmentId !== null;

  return { speak, stop, isSpeaking, currentSegmentId, isSupported };
}
