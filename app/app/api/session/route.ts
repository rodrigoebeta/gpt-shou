import { session, errorResponse } from "@/server/browser";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{return Response.json(await session(request.headers),{headers:{"Cache-Control":"no-store"}});}catch(error){return errorResponse(error);}}
