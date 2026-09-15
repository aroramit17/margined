import { createHash, timingSafeEqual } from "node:crypto";
import { admin, ApiError, failure } from "@/lib/server";
import { loadDataset } from "@/lib/live-data";
import { recommendations } from "@/lib/engine";
export async function POST(req: Request) {
  try {
    const secret = process.env.CRON_SECRET,
      token = req.headers.get("authorization")?.replace(/^Bearer /, "");
    if (
      !secret ||
      !token ||
      secret.length !== token.length ||
      !timingSafeEqual(Buffer.from(secret), Buffer.from(token))
    )
      throw new ApiError("Unauthorized", 401);
    const db = admin();
    const { error: pruneError } = await db.rpc("prune_raw_events");
    if (pruneError) throw pruneError;
    const { data: orgs, error } = await db.from("organizations").select("*");
    if (error) throw error;
    let sent = 0;
    const failed: string[] = [];
    for (const org of orgs ?? []) {
      try {
        if (!org.email_alerts && !org.slack_webhook) continue;
        const data = await loadDataset(db, org);
        const alerts = recommendations(
          data.customers,
          Number(org.target_margin),
        );
        if (!alerts.length) continue;
        const digest = createHash("sha256")
          .update(
            alerts
              .map((a) => `${a.id}:${a.kind}`)
              .sort()
              .join("|"),
          )
          .digest("hex");
        const day = new Date().toISOString().slice(0, 10);
        const content = `Inferlytic: ${alerts.length} margin signals need attention.\n\n${alerts.map((a) => `${a.title}\n${a.body}`).join("\n\n")}\n\nOpen your dashboard: ${process.env.APP_URL}`;
        for (const channel of ["email", "slack"]) {
          if (
            (channel === "email" && !org.email_alerts) ||
            (channel === "slack" && (!org.slack_webhook || org.tier < 3))
          )
            continue;
          const { data: claimed, error: claimError } = await db.rpc(
            "claim_alert_delivery",
            { p_org: org.id, p_day: day, p_channel: channel, p_hash: digest },
          );
          if (claimError) throw claimError;
          if (!claimed) continue;
          try {
            let response;
            if (channel === "email") {
              if (!process.env.RESEND_API_KEY || !process.env.ALERT_FROM_EMAIL)
                throw Error("Email delivery configuration missing");
              const {
                data: { user },
              } = await db.auth.admin.getUserById(org.owner_id);
              if (!user?.email) throw Error("Workspace owner email missing");
              response = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                  "Content-Type": "application/json",
                  "Idempotency-Key": `${org.id}-${day}-${digest}`,
                },
                body: JSON.stringify({
                  from: process.env.ALERT_FROM_EMAIL,
                  to: user.email,
                  subject: "Your AI margins need attention",
                  text: content,
                }),
                signal: AbortSignal.timeout(10000),
              });
            } else {
              if (
                !/^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]+$/.test(
                  org.slack_webhook,
                )
              )
                throw Error("Invalid Slack destination");
              response = await fetch(org.slack_webhook, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: content }),
                redirect: "error",
                signal: AbortSignal.timeout(10000),
              });
            }
            if (!response.ok)
              throw Error(`Delivery failed (${response.status})`);
            const { error: markError } = await db
              .from("alert_deliveries")
              .update({ sent_at: new Date().toISOString() })
              .eq("organization_id", org.id)
              .eq("day", day)
              .eq("channel", channel)
              .eq("payload_hash", digest);
            if (markError) throw markError;
            sent++;
          } catch (e) {
            await db
              .from("alert_deliveries")
              .delete()
              .eq("organization_id", org.id)
              .eq("day", day)
              .eq("channel", channel)
              .eq("payload_hash", digest);
            throw e;
          }
        }
      } catch {
        failed.push(org.id);
      }
    }
    return Response.json(
      { sent, failed },
      { status: failed.length ? 207 : 200 },
    );
  } catch (e) {
    return failure(e);
  }
}
