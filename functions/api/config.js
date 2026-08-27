import { LIBRARIES } from "../../server/libraries.js";

export function onRequestGet(context) {
  return Response.json(
    {
      libraries: LIBRARIES.map(({ id, name, openDataName }) => ({ id, name, openDataName: openDataName || null })),
      maxQueries: 200,
      batchSize: 20,
      turnstileSiteKey: context.env.TURNSTILE_SITE_KEY || null,
      apiReady: Boolean(context.env.DATA4LIBRARY_API_KEY)
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff"
      }
    }
  );
}
