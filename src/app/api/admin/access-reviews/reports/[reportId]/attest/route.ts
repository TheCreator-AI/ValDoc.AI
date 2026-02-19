import { z } from "zod";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { attestAccessReviewReport } from "@/server/access-review/service";

const attestSchema = z.object({
  password: z.string().min(1, "password is required."),
  remarks: z.string().optional()
});

export async function POST(request: Request, context: { params: Promise<{ reportId: string }> }) {
  try {
    const session = await getSessionOrThrow("ADMIN");
    const { reportId } = await context.params;
    const body = attestSchema.parse(await request.json());
    const attestation = await attestAccessReviewReport({
      organizationId: session.organizationId,
      reportId,
      actorUserId: session.userId,
      password: body.password,
      remarks: body.remarks,
      request
    });
    return apiJson(201, attestation);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(400, { error: error.issues[0]?.message ?? "Invalid payload." });
    }
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to attest access review report." });
  }
}

