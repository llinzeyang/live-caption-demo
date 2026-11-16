import type { CaptionProvider, ProviderId } from "./types";

const providers = new Map<ProviderId, CaptionProvider>();

export function registerProvider(provider: CaptionProvider): void {
  providers.set(provider.id, provider);
}

export function getProvider(id: ProviderId): CaptionProvider | undefined {
  return providers.get(id);
}

export function listProviders(): CaptionProvider[] {
  return Array.from(providers.values());
}
