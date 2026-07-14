import { createRouteHandler } from "uploadthing/next";
import { ourFileRouter } from "@/lib/uploadthing";

// Serves the Uploadthing endpoints: GET (route metadata) + POST (uploads).
// `UPLOADTHING_TOKEN` is read from the environment automatically; when it's unset
// the route still mounts and uploads fail gracefully (the token is optional in
// env.ts, mirroring the Stripe/email gating).
export const { GET, POST } = createRouteHandler({
  router: ourFileRouter,
});
