import { configured } from "@/lib/server";
export function GET() {
  return Response.json({
    status: "ok",
    service: "inferlytic",
    version: "0.1.0",
    liveConfigured: configured(),
    demoAvailable: true,
  });
}
