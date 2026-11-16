import { createAssemblyAiCaptionProvider } from "./assemblyai";
import { createAzureCaptionProvider } from "./azure";
import { createDeepgramCaptionProvider } from "./deepgram";
import { createGoogleCaptionProvider } from "./google";
import { registerProvider } from "./registry";

/** Register every built-in provider once at app boot. */
export function bootstrapProviders(): void {
  registerProvider(createAzureCaptionProvider());
  registerProvider(createGoogleCaptionProvider());
  registerProvider(createDeepgramCaptionProvider());
  registerProvider(createAssemblyAiCaptionProvider());
}

export { listProviders, getProvider } from "./registry";
export type { CaptionCue, CaptionProvider, ProviderId } from "./types";
