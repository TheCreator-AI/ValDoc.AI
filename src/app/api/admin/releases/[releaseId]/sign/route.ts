import { z } from "zod";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { signReleaseEntry } from "@/server/releases/service";

const signSchema = z.object({
  password: z.string().min(1, "password is required."),
  remarks: z.string().optional()
});

export async function POST(request: Request, context: { params: Promise<{ releaseId: string }> }) {
  try {
    const session = await getSessionOrThrow("ADMIN");
    const body = signSchema.parse(await request.json());
    const { releaseId } = await context.params;
    const signed = await signReleaseEntry({
      organizationId: session.organizationId,
      releaseId,
      actorUserId: session.userId,
      password: body.password,
      remarks: body.remarks,
      request
    });
    return apiJson(200, signed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(400, { error: error.issues[0]?.message ?? "Invalid payload." });
    }
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to sign release entry." });
  }
}
