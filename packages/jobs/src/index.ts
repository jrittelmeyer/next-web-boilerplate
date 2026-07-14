// Public surface for the WEB app (the producer side). It imports only the
// enqueue helper + the job contract — never the worker/handlers — so pg-boss's
// worker code and `@repo/email` stay out of the Next build. `enqueue.ts` carries
// the `server-only` guard that keeps pg-boss out of any client bundle.
export { enqueue } from "./enqueue";
export { JOBS, type WelcomeEmailPayload } from "./queues";
