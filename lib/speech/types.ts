export interface TTSProvider {
  speak(text: string, lang: string, segmentId: string): Promise<void>;
  stop(): void;
  isSupported(): boolean;
}
