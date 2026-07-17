import { SourceProvider, SourceType } from "./types";
import { RandomTopicProvider } from "./random";
import { SkitProvider } from "./skit";

/**
 * Factory — returns the SourceProvider for a given type.
 * Add new providers here as they are implemented.
 */
export function getProvider(type: SourceType): SourceProvider {
  switch (type) {
    case "random":
      return new RandomTopicProvider();
    case "skit":
      return new SkitProvider();
    // case "news":
    //   return new NewsProvider();
    // case "dialogue":
    //   return new DialogueProvider();
    default:
      throw new Error(`Unknown source type: ${type}`);
  }
}

export type { SourceType, GenerateRequest, GenerateResult } from "./types";
