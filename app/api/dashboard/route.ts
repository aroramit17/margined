import { requireOrg, failure } from "@/lib/server";
import { loadDataset } from "@/lib/live-data";
export async function GET(req: Request) {
  try {
    const { db, org } = await requireOrg();
    return Response.json(
      {
        ...(await loadDataset(
          db,
          org,
          new URL(req.url).searchParams.get("product") ?? "all",
        )),
        warnings: org.stripe_sync_warnings ?? [],
        slackConnected: Boolean(org.slack_webhook),
        targetMargin: Number(org.target_margin),
        emailAlerts: org.email_alerts,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
