import { z } from "zod";
import {
  admin,
  ApiError,
  requireOrg,
  failure,
  jsonBody,
  sameOrigin,
} from "@/lib/server";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { org } = await requireOrg();
    const body = z
      .object({
        name: z.string().trim().min(1).max(80).optional(),
        targetMargin: z.number().min(0).max(100),
        emailAlerts: z.boolean(),
        slackWebhook: z
          .string()
          .url()
          .refine((v) =>
            /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]+$/.test(v),
          )
          .nullable()
          .optional(),
      })
      .parse(await jsonBody(req));
    if (body.slackWebhook && org.tier < 3)
      throw new ApiError("Slack alerts require Tier 3", 403);
    const { error } = await admin()
      .from("organizations")
      .update({
        name: body.name ?? org.name,
        target_margin: body.targetMargin,
        email_alerts: body.emailAlerts,
        slack_webhook:
          body.slackWebhook === undefined
            ? org.slack_webhook
            : body.slackWebhook,
      })
      .eq("id", org.id);
    if (error) throw error;
    return Response.json({ saved: true });
  } catch (e) {
    return failure(e);
  }
}
