import { transcriptionResponse,errorResponse } from "@/server/browser";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{return await transcriptionResponse((await params).id,request.headers);}catch(error){return errorResponse(error);}}
