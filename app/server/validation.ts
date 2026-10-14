export class AppError extends Error {
  constructor(public code: string, message = "Request unavailable.", public retryAt: string | null = null, public revision: number | null = null) { super(message); }
}

export async function readBody(request:Pick<Request,"body">):Promise<any>{
  const reader=request.body?.getReader();
  if(!reader)throw new AppError("INVALID_ARGUMENT","Request body is required.");
  const chunks:Uint8Array[]=[];let length=0;
  try{for(;;){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.length;if(length>2097152)throw new AppError("CONTENT_TOO_LARGE");chunks.push(chunk.value);}}finally{await reader.cancel();}
  const bytes=new Uint8Array(length);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return parseStrict(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}catch(error){if(error instanceof AppError)throw error;throw new AppError("INVALID_ARGUMENT","Invalid UTF-8 JSON.");}
}

export function parseStrict(text: string): any {
  if (new TextEncoder().encode(text).length > 2097152) throw new AppError("INVALID_ARGUMENT", "Request too large.");
  let value: any;
  try { value = JSON.parse(text); } catch { throw new AppError("INVALID_ARGUMENT", "Invalid JSON."); }
  const tokens = [...text.matchAll(/"(?:\\.|[^"\\])*"|[{}[\]:,]/g)].map(match => match[0]);
  const stack: (Set<string> | null)[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "{") stack.push(new Set());
    else if (token === "[") stack.push(null);
    else if (token === "}" || token === "]") stack.pop();
    else if (token.startsWith('"') && tokens[i + 1] === ":") {
      const key = JSON.parse(token);
      const keys = stack.at(-1);
      if (!keys || keys.has(key) || ["__proto__", "constructor", "prototype"].includes(key)) throw new AppError("INVALID_ARGUMENT", "Invalid object keys.");
      keys.add(key);
    }
    if (stack.length > 64) throw new AppError("INVALID_ARGUMENT", "JSON nesting is too deep.");
  }
  return value;
}

export function valid(schema: any, value: any): boolean {
  if (schema.anyOf && !schema.anyOf.some((branch: any) => valid(branch, value))) return false;
  if ("const" in schema && value !== schema.const) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type) {
    const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
    if (schema.type === "integer" ? !Number.isSafeInteger(value) : type !== schema.type) return false;
  }
  if (typeof value === "number" && (!Number.isFinite(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) return false;
  if (typeof value === "string") {
    if (value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity)) return false;
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) return false;
    if (schema.format === "date-time" && (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,19) !== value.slice(0,19))) return false;
  }
  if (Array.isArray(value)) {
    if (value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity)) return false;
    if (schema.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) return false;
    if (schema.items && !value.every(item => valid(schema.items, item))) return false;
  } else if (value && typeof value === "object") {
    if (schema.required?.some((key: string) => !Object.hasOwn(value, key))) return false;
    for (const [key, item] of Object.entries(value)) {
      if (schema.additionalProperties === false && !Object.hasOwn(schema.properties ?? {}, key)) return false;
      if (schema.properties?.[key] && !valid(schema.properties[key], item)) return false;
    }
  }
  return true;
}

export function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function validateContent(content:any, complete:boolean) {
  if(new TextEncoder().encode(canonical(content)).length>1048576) throw new AppError("INVALID_ARGUMENT","Content is too large.");
  for(const field of ["caption","transcription","video_inspection"]){
    const state=content.availability[field],text=content[field];
    if(state==="unavailable" && text!==null) throw new AppError("INVALID_ARGUMENT","Unavailable content must be null.");
    if(state==="observed" && (typeof text!=="string" || (field!=="caption" && !text.trim()))) throw new AppError("INVALID_ARGUMENT","Observed content is required.");
    if(field==="transcription" && state==="absent" && text!=="") throw new AppError("INVALID_ARGUMENT","Absent speech requires an empty transcription.");
    if(complete && state==="unavailable") throw new AppError("INVALID_ARGUMENT","Required content is unavailable.");
  }
  if(["1.1.0","1.2.0"].includes(content.content_version)){
    const speech=content.availability.transcription,state=content.availability.transcription_pt,text=content.transcription_pt;
    if(state==="unavailable" && (text!==null || complete)) throw new AppError("INVALID_ARGUMENT","Portuguese transcription is unavailable.");
    if(speech==="unavailable" && state!=="unavailable") throw new AppError("INVALID_ARGUMENT","Translation requires observed speech.");
    if(speech==="absent" && (state!=="absent" || text!=="")) throw new AppError("INVALID_ARGUMENT","Absent speech requires empty Portuguese text.");
    if(speech==="observed"){
      if(state==="absent" || (state!=="unavailable" && (typeof text!=="string" || !text.trim()))) throw new AppError("INVALID_ARGUMENT","Portuguese transcription is required.");
      if(state==="original" && text!==content.transcription) throw new AppError("INVALID_ARGUMENT","Original Portuguese speech must remain unchanged.");
    }
  }
  if(content.content_version==="1.2.0"){
    const state=content.availability.semantic_description,text=content.semantic_description;
    if(state==="unavailable" && (text!==null || complete)) throw new AppError("INVALID_ARGUMENT","Semantic description is unavailable.");
    if(state==="generated"){
      if(typeof text!=="string" || !text.trim()) throw new AppError("INVALID_ARGUMENT","Semantic description is required.");
      if(!["caption","transcription","video_inspection"].some(field=>content.availability[field]==="observed" && content[field]?.trim())) throw new AppError("INVALID_ARGUMENT","Semantic description requires observed source content.");
    }
  }
}

export function validateAnalysis(analysis: any, complete: boolean) {
  if (!analysis) { if (complete) throw new AppError("INVALID_ARGUMENT", "Complete analysis is required."); return; }
  if (new TextEncoder().encode(canonical(analysis)).length > 1048576) throw new AppError("INVALID_ARGUMENT", "Analysis is too large.");
  const inspection = analysis.inspection;
  if (analysis.transcript.length && (inspection.speech !== "observed" || !analysis.transcript_language)) throw new AppError("INVALID_ARGUMENT", "Speech inspection is required.");
  if (analysis.transcript_language) { try { new Intl.Locale(analysis.transcript_language); } catch { throw new AppError("INVALID_ARGUMENT", "Unsupported language tag."); } }
  for (const item of [...analysis.transcript, ...analysis.observations, ...analysis.creative_inferences]) {
    if (item.start > item.end || item.end > analysis.duration_seconds) throw new AppError("INVALID_ARGUMENT", "Invalid evidence interval.");
    if (item.modality?.includes("visual") && inspection.visual !== "observed") throw new AppError("INVALID_ARGUMENT", "Visual inspection is required.");
    if (item.modality?.includes("audio") && inspection.audio !== "observed") throw new AppError("INVALID_ARGUMENT", "Audio inspection is required.");
  }
  if (analysis.observations.some((item: any) => item.inference) || analysis.creative_inferences.some((item: any) => !item.inference)) throw new AppError("INVALID_ARGUMENT", "Invalid inference flags.");
  if (inspection.speech === "observed" && inspection.audio !== "observed") throw new AppError("INVALID_ARGUMENT", "Contradictory inspection states.");
  if (inspection.audio === "absent" && inspection.speech !== "absent") throw new AppError("INVALID_ARGUMENT", "Contradictory inspection states.");
  if (complete && (inspection.visual !== "observed" || !["observed","absent"].includes(inspection.audio) || !["observed","absent"].includes(inspection.speech))) throw new AppError("INVALID_ARGUMENT", "Incomplete inspection.");
}
