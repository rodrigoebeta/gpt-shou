import { changeSettings,body,errorResponse } from "@/server/browser";
export const dynamic="force-dynamic";
export async function POST(request:Request){try{return Response.json(await changeSettings(await body(request),request.headers),{headers:{"Cache-Control":"no-store"}});}catch(error){return errorResponse(error);}}
