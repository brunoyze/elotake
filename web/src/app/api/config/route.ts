import { aiEnabled } from "@/lib/server/runner";
import { storage } from "@/lib/server/storage";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ storage: storage().kind, ia: aiEnabled() });
}
