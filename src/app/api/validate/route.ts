import { validateDocument } from "@/lib/validate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (!payload || typeof payload !== "object") {
    return new Response(JSON.stringify({ error: "Invalid payload." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const { text, options } = payload as { text?: string; options?: { strict?: boolean } };

  if (!text || typeof text !== "string") {
    return new Response(JSON.stringify({ error: "Text is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const report = validateDocument(text, {
    strict: options?.strict ?? false
  });

  return new Response(JSON.stringify(report), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
