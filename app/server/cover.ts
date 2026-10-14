import jpeg from "jpeg-js";
import { decode as decodePng } from "fast-png";
import { imageSize } from "image-size";
import decodeWebp, { init } from "@jsquash/webp/decode.js";
import webpModule from "@jsquash/webp/codec/dec/webp_dec.wasm?module";
import { AppError, sha256 } from "./validation";

let ready: Promise<void> | undefined;
export async function inspectCover(args: any) {
  const bytes = Uint8Array.from(atob(args.bytes_base64), char => char.charCodeAt(0));
  if (!bytes.length || bytes.length > 1048576) throw new AppError("CONTENT_TOO_LARGE");
  if (Buffer.from(bytes).toString("base64") !== args.bytes_base64) throw new AppError("UNSUPPORTED_IMAGE");
  if (await sha256(bytes) !== args.sha256) throw new AppError("IMAGE_HASH_MISMATCH");
  try {
    const dimensions = imageSize(bytes);
    const mime = {jpg:"image/jpeg",png:"image/png",webp:"image/webp"}[dimensions.type as "jpg"|"png"|"webp"];
    const {width,height} = dimensions;
    if (mime !== args.mime_type || !width || !height || width > 8192 || height > 8192 || width * height > 4000000) throw new Error("Unsupported dimensions.");
    let decoded: any;
    if (mime === "image/jpeg") decoded = jpeg.decode(bytes,{useTArray:true,formatAsRGBA:true,tolerantDecoding:false,maxResolutionInMP:4,maxMemoryUsageInMB:64});
    else if (mime === "image/png") {
      const view = new DataView(bytes.buffer);
      const compressed: Uint8Array[]=[];
      for (let offset=8;offset+12<=bytes.length;) {
        const length = view.getUint32(offset);
        const type = String.fromCharCode(...bytes.slice(offset+4,offset+8));
        if (offset+12+length>bytes.length || type === "acTL") throw new Error("Invalid or animated PNG.");
        // shortcut: compressed PNG metadata is unsupported; add bounded decoding if an original cover requires it.
        if (["iCCP","zTXt","iTXt"].includes(type)) throw new Error("Compressed PNG metadata is unsupported.");
        if(type==="IDAT")compressed.push(bytes.slice(offset+8,offset+8+length));
        offset += 12+length;
      }
      if(!compressed.length)throw new Error("Missing PNG image data.");
      const reader=new Blob(compressed as BlobPart[]).stream().pipeThrough(new DecompressionStream("deflate")).getReader();
      let inflated=0;
      const maximum=width*height*8+height*7+1024;
      try{for(;;){const chunk=await reader.read();if(chunk.done)break;inflated+=chunk.value.length;if(inflated>maximum)throw new Error("PNG decompression limit.");}}finally{await reader.cancel();}
      decoded = decodePng(bytes,{checkCrc:true});
    } else {
      const view = new DataView(bytes.buffer);
      if (view.getUint32(4,true)+8!==bytes.length) throw new Error("Invalid RIFF length.");
      for (let offset=12;offset+8<=bytes.length;) {
        const type = String.fromCharCode(...bytes.slice(offset,offset+4));
        const length = view.getUint32(offset+4,true);
        if (offset+8+length>bytes.length || type === "ANIM" || type === "ANMF") throw new Error("Invalid or animated WebP.");
        offset += 8+length+(length%2);
      }
      ready ??= init(webpModule);
      await ready;
      decoded = await decodeWebp(bytes.buffer);
    }
    if (decoded.width !== width || decoded.height !== height || decoded.data.length !== width*height*(mime==="image/png"?decoded.channels:4)) throw new Error("Invalid decoded image.");
    return {bytes,width,height};
  } catch { throw new AppError("UNSUPPORTED_IMAGE", "Cover decoding failed or the image exceeds safe limits."); }
}
