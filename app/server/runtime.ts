import bundle from './runtime-bundle.json';
import { AppError } from './validation';

export function runtimeFile(path:string) {
  const file = path==='manifest' ? null : bundle.files.find(file=>file.path===path);
  if(path!=='manifest' && !file) throw new AppError('NOT_FOUND');
  return {ok:true,contract_version:'1.0.0',runtime_version:bundle.manifest.runtime_version,
    manifest:bundle.manifest,path:file?.path??null,sha256:file?.sha256??null,content:file?.content??null,
    archive:path==='manifest'?bundle.archive:null};
}
