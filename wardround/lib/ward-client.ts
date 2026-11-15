import type { Action, Provider } from "./ward";

export const offline = false;

export function loadWard(provider: Provider) {
  return fetch(`/api/ward?provider=${provider}`, { cache: "no-store" });
}

export function saveWard(action: Action) {
  return fetch("/api/ward", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
}
