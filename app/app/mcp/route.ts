import { callTool, toolList, assertOutput } from "@/server/store";
import { AppError, readBody } from "@/server/validation";
import { mcpRequest } from "@/server/mcp-request";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  let id: string | number | null = null;
  try {
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return Response.json({error:"Content-Type must be application/json."},{status:415});
    if (Number(request.headers.get("content-length")??0)>2097152) return Response.json({error:"Request too large."},{status:413});
    const body = mcpRequest(await readBody(request));
    id = body.id;
    if (body.method === "server/discover") return Response.json({jsonrpc:"2.0",id,result:{supportedVersions:["2026-07-28"],capabilities:{tools:{}}}});
    if (body.method === "tools/list") return Response.json({jsonrpc:"2.0",id,result:{tools:toolList}});
    if (body.method !== "tools/call") throw new AppError("INVALID_ARGUMENT", "Unsupported MCP method.");
    const value = await callTool(body.params.name,body.params.arguments,request.headers);
    if (!assertOutput(body.params.name,value)) throw new AppError("INTERNAL_ERROR", "Result contract validation failed.");
    return Response.json({jsonrpc:"2.0",id,result:{content:[{type:"text",text:JSON.stringify(value)}],isError:false}},{headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    const failure = error instanceof AppError ? error : new AppError("INTERNAL_ERROR");
    const value = {ok:false,contract_version:"1.0.0",error:{code:failure.code,message:failure.message,retryable:["RUN_BUSY","RATE_LIMITED","DEPENDENCY_UNAVAILABLE","INTERNAL_ERROR"].includes(failure.code),retry_at:failure.retryAt,current_revision:failure.revision}};
    return Response.json({jsonrpc:"2.0",id,result:{content:[{type:"text",text:JSON.stringify(value)}],isError:true}},{headers:{"Cache-Control":"no-store"}});
  }
}
