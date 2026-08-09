import * as Crypto from "expo-crypto";
import type { AuthCallbackFlow } from "@/domain/auth-callback";
import {
  buildAuthCallbackUrl,
  clearPendingAuthCallback,
  savePendingAuthCallback,
  takePendingAuthCallback
} from "@/domain/auth-callback";
import { secureStorage } from "./secure-storage";

let callbackQueue: Promise<unknown> = Promise.resolve();

export async function createMobileAuthRedirect(flow: AuthCallbackFlow) {
  const state = Crypto.randomUUID();
  await savePendingAuthCallback(secureStorage, {
    version: 1,
    flow,
    state,
    createdAt: Date.now()
  });
  return buildAuthCallbackUrl(flow, state);
}

export function clearMobileAuthRedirect(flow: AuthCallbackFlow) {
  return clearPendingAuthCallback(secureStorage, flow);
}

export function consumeMobileAuthCallback(url: string) {
  const result = callbackQueue.then(() => takePendingAuthCallback(url, secureStorage));
  callbackQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}
