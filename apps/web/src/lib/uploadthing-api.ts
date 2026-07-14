import "server-only";

import { UTApi } from "uploadthing/server";

/**
 * Lazy Uploadthing server-SDK client (P2-3), the upload analog of `getStripe()` /
 * `getResend()`: constructed on first use so importing this module never depends on
 * env. `new UTApi()` itself is safe with the token unset (it resolves
 * `UPLOADTHING_TOKEN` per REQUEST, not in the constructor — verified in 7.7.4), but
 * callers still gate on `isUploadthingConfigured()` first so unconfigured
 * deployments never attempt a remote call they know will fail.
 */
let utapi: UTApi | null = null;

/** True when UPLOADTHING_TOKEN is present (so remote storage calls can succeed). */
export function isUploadthingConfigured(): boolean {
  return Boolean(process.env.UPLOADTHING_TOKEN);
}

export function getUTApi(): UTApi {
  if (!utapi) {
    utapi = new UTApi();
  }
  return utapi;
}
