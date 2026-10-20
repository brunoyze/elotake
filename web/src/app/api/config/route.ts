import { currentUser } from "@/lib/server/auth";
import { aiEnabled } from "@/lib/server/runner";
import { storage } from "@/lib/server/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  return Response.json({ storage: storage().kind, ia: aiEnabled(), usuario: user });
}
