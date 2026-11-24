import { anthropicProvider } from "./anthropic";
import { geminiProvider } from "./gemini";
import type { Provider } from "./provider";

export type ProviderName = "google" | "anthropic";

// Adapter pattern: the rest of the app only sees the Provider interface, so switching vendors is one env var.
export function getProvider(name: ProviderName = (process.env.AI_PROVIDER as ProviderName) || "anthropic", model?: string): Provider {
  return name === "google" ? geminiProvider(undefined, model) : anthropicProvider(undefined, model);
}
