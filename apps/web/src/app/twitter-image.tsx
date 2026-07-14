// Reuse the OpenGraph image for the Twitter (summary_large_image) card. Next's
// file convention emits og:image and twitter:image from SEPARATE files — it does
// not derive twitter:image from opengraph-image — so this thin re-export serves
// the same design at /twitter-image and wires up the twitter:image:* tags.
export { alt, contentType, default, size } from "./opengraph-image";
