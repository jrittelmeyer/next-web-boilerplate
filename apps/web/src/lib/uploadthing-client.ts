import { generateUploadButton, generateUploadDropzone } from "@uploadthing/react";
import type { OurFileRouter } from "@/lib/uploadthing";

// Typed client helpers for the file router. The `OurFileRouter` import is
// type-only, so it's erased at compile time — the server-only file router (and
// its auth/db imports) never leak into the client bundle.
export const UploadButton = generateUploadButton<OurFileRouter>();
/** @public — generated alongside UploadButton; the drop-zone variant consumers swap to. */
export const UploadDropzone = generateUploadDropzone<OurFileRouter>();
