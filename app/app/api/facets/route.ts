import { facets,errorResponse } from "@/server/browser";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{return Response.json(await facets(new URL(request.url),request.headers),{headers:{"Cache-Control":"no-store"}});}catch(error){return errorResponse(error);}}
