import { authorize } from "@/server/store";
import { errorResponse } from "@/server/browser";
import { checkUpdates } from "@/server/updates";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await authorize(request.headers, true);
    return Response.json(await checkUpdates(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
