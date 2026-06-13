// Returns the current deployment's build identity so clients can detect skew.
// force-dynamic ensures this is never edge-cached; no-store on the response
// header prevents the browser from caching the id either.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { id: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
    { headers: { "cache-control": "no-store" } }
  );
}
