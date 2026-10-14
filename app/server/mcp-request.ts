import { AppError } from "./validation";

export function mcpRequest(body: any) {
  if (!body || Array.isArray(body) || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    throw new AppError("INVALID_ARGUMENT", "Invalid MCP request envelope.");
  }
  const id = body.id ?? null;
  if (id !== null && typeof id !== "string" && !Number.isSafeInteger(id)) {
    throw new AppError("INVALID_ARGUMENT", "Invalid MCP request identifier.");
  }
  // The managed transport can omit the identifier and attach protocol metadata.
  if (Object.keys(body).some(key => !["jsonrpc", "id", "method", "params", "_meta"].includes(key))) {
    throw new AppError("INVALID_ARGUMENT", "Unsupported MCP envelope field.");
  }
  if (body.method === "tools/call") {
    const params = body.params;
    if (!params || Array.isArray(params) || typeof params.name !== "string" ||
      Object.keys(params).some(key => !["name", "arguments", "_meta"].includes(key))) {
      throw new AppError("INVALID_ARGUMENT", "Invalid MCP tool parameters.");
    }
  }
  return { ...body, id };
}
