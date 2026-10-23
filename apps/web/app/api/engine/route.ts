import { engineStatus, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Whether the protection engine is running, from its last heartbeat. */
export async function GET() {
  return json(await engineStatus());
}
