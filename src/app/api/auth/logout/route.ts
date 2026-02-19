import { apiJson, getSessionOrThrow } from "@/server/api/http";
import { writeAuditEvent } from "@/server/audit/events";
import { buildSessionClearCookieHeader } from "@/server/auth/cookie";

export async function POST(request: Request) {
  try {
    const session = await getSessionOrThrow();
    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "auth.logout",
      entityType: "User",
      entityId: session.userId,
      details: { email: session.email },
      request
    });
  } catch {
    // Do not fail logout if session or audit logging fails.
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": buildSessionClearCookieHeader()
    }
  });
}

export async function GET() {
  return apiJson(405, { error: "Method not allowed." });
}
