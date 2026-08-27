import { LIBRARIES } from "../../server/libraries.js";

export function onRequestGet() {
  return Response.json(
    {
      libraries: LIBRARIES.map(({ id, name, openDataName }) => ({ id, name, openDataName: openDataName || null })),
      maxQueries: 200,
      batchSize: 20
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff"
      }
    }
  );
}
