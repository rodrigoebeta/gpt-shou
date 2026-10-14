"use client";

import * as React from "react";
import { Dialog, Popover, DropdownMenu } from "radix-ui";
import { Bookmark, Search, LayoutGrid, Trash2, Settings2, ArrowRight, ArrowUpRight, Play, X, ChevronDown, Check, MoreHorizontal, Pencil, RotateCcw, SlidersHorizontal, LoaderCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReelPlayer } from "@/components/reel-player";
import { UpdateNotice } from "@/components/update-notice";

type Option={id:string;label:string};
type Group="category"|"topic"|"creator"|"collection";
type Selected=Record<Group,Option[]>;
type Reel={id:string;revision:number;creator:string|null;source_url:string;cover_url:string|null;saved_at:string;categories:Option[];topics:Option[];category_ids:string[];topic_ids:string[];outcome:string;removed:boolean};
const blank:Selected={category:[],topic:[],creator:[],collection:[]};
const labels:Record<Group,string>={category:"Categoria",topic:"Tópico",creator:"Criador",collection:"Coleção"};
const plural:Record<Group,string>={category:"Categorias",topic:"Tópicos",creator:"Criadores",collection:"Coleções"};
const states:Record<string,string>={pending:"Pendente",partial:"Análise incompleta",retry_wait:"Aguardando tentativa",login_required:"Login necessário",unavailable:"Fonte indisponível"};
const errors:Record<string,string>={UNAUTHENTICATED:"Entre com o ChatGPT.",FORBIDDEN:"Acesso não autorizado.",REVISION_CONFLICT:"A referência mudou. Atualize a biblioteca.",INVALID_ARGUMENT:"Verifique os valores informados.",REFERENCE_REMOVED:"A referência foi removida.",NOT_FOUND:"Referência indisponível.",DEPENDENCY_UNAVAILABLE:"Serviço indisponível. Tente novamente."};
async function api(path:string,options:RequestInit={}):Promise<any> {
  const response=await fetch(path,{...options,headers:{"Content-Type":"application/json",...options.headers}});
  const data:any=await response.json();
  if(!response.ok)throw new Error(errors[data.error?.code]??"Não foi possível concluir. Tente novamente.");
  return data;
}
const post=(path:string,value:unknown)=>api(path,{method:"POST",body:JSON.stringify(value)});

function FilterPicker({group,values,onChange}: {group:Group;values:Option[];onChange:(values:Option[])=>void}) {
  const [open,setOpen]=React.useState(false),[query,setQuery]=React.useState(""),[items,setItems]=React.useState<Option[]>([]),[next,setNext]=React.useState<number|null>(null),[loading,setLoading]=React.useState(false),[error,setError]=React.useState(false),[mobile,setMobile]=React.useState(false),[retry,setRetry]=React.useState(0);
  const search=React.useRef<HTMLInputElement>(null);
  const requestGeneration=React.useRef(0);
  React.useEffect(()=>{const media=matchMedia("(max-width:650px)");const change=()=>setMobile(media.matches);change();media.addEventListener("change",change);return()=>media.removeEventListener("change",change);},[]);
  React.useEffect(()=>{
    requestGeneration.current++;
    if(!open)return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      setLoading(true);setError(false);
      api(`/api/facets?type=${group}&query=${encodeURIComponent(query)}`,{signal:controller.signal}).then(data=>{setItems(data.items);setNext(data.next_offset);}).catch(e=>{if(e.name!=="AbortError")setError(true);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    },120);
    return()=>{clearTimeout(timer);controller.abort();};
  },[open,query,group,retry]);
  const toggle=(item:Option)=>onChange(values.some(value=>value.id===item.id)?values.filter(value=>value.id!==item.id):[...values,item]);
  const close=(value:boolean)=>{setOpen(value);if(!value)setQuery("");};
  const loadMore=async()=>{if(next===null||loading)return;const generation=requestGeneration.current;setLoading(true);try{const data=await api(`/api/facets?type=${group}&query=${encodeURIComponent(query)}&offset=${next}`);if(generation===requestGeneration.current){setItems(old=>[...old,...data.items]);setNext(data.next_offset);}}catch{if(generation===requestGeneration.current)setError(true);}finally{if(generation===requestGeneration.current)setLoading(false);}};
  const row=(item:Option,checked:boolean)=><label className="picker-option" key={item.id}><input type="checkbox" checked={checked} onChange={()=>toggle(item)}/><span className="checkmark" aria-hidden="true">{checked&&<Check size={13}/>}</span><span>{item.label}</span></label>;
  const content=<>
    <div className="picker-heading">{mobile?<Dialog.Title>{plural[group]}</Dialog.Title>:<h2>{plural[group]}</h2>}<Button variant="ghost" size="icon" aria-label="Fechar filtro" onClick={()=>close(false)}><X size={18}/></Button></div>
    <div className="picker-search"><Search size={16} aria-hidden="true"/><Input ref={search} value={query} onChange={e=>setQuery(e.target.value)} placeholder={`Buscar ${labels[group].toLowerCase()}`} aria-label={`Buscar ${labels[group].toLowerCase()}`}/></div>
    {values.length>0&&<div className="pinned-values"><p>Selecionados <span>{values.length}</span></p><div>{values.map(item=>row(item,true))}</div></div>}
    <div className="picker-results" onKeyDown={event=>{if(event.key!=="ArrowDown"&&event.key!=="ArrowUp")return;const inputs=Array.from(event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));const current=inputs.indexOf(document.activeElement as HTMLInputElement);if(inputs.length){event.preventDefault();inputs[(current+(event.key==="ArrowDown"?1:-1)+inputs.length)%inputs.length].focus();}}}>
      {items.filter(item=>!values.some(value=>value.id===item.id)).map(item=>row(item,false))}
      {!loading&&!error&&items.filter(item=>!values.some(value=>value.id===item.id)).length===0&&<p className="picker-status">Nenhum resultado</p>}
      {error&&<Button className="picker-retry" variant="ghost" onClick={()=>setRetry(value=>value+1)}>Tentar novamente</Button>}
      {loading&&<p className="picker-status" role="status"><LoaderCircle size={16} className="loading-icon"/>Carregando</p>}
      {next!==null&&!error&&<Button className="load-more-options" variant="ghost" disabled={loading} onClick={loadMore}>Mais resultados</Button>}
    </div>
    <div className="picker-footer"><Button variant="ghost" disabled={!values.length} onClick={()=>onChange([])}>Limpar</Button><Button className="done-button" onClick={()=>close(false)}>Concluir</Button></div>
  </>;
  const trigger=<Button className={`filter-trigger ${values.length?"has-values":""}`} variant="outline" aria-label={`Filtrar por ${labels[group].toLowerCase()}`}><span>{labels[group]}</span>{values.length>0&&<span className="filter-count">{values.length}</span>}<ChevronDown size={13}/></Button>;
  return mobile?<Dialog.Root open={open} onOpenChange={close}><Dialog.Trigger asChild>{trigger}</Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="sheet-overlay"/><Dialog.Content className="picker-sheet" aria-describedby={undefined} onOpenAutoFocus={e=>{e.preventDefault();search.current?.focus();}}>{content}</Dialog.Content></Dialog.Portal></Dialog.Root>:<Popover.Root open={open} onOpenChange={close}><Popover.Trigger asChild>{trigger}</Popover.Trigger><Popover.Portal><Popover.Content className="picker-popover" sideOffset={10} align="center" onOpenAutoFocus={e=>{e.preventDefault();search.current?.focus();}}>{content}</Popover.Content></Popover.Portal></Popover.Root>;
}

function ReelCard({reel,onChange,onEdit,onPlay}: {reel:Reel;onChange:(reel:Reel,action:string)=>void;onEdit:()=>void;onPlay:()=>void}) {
  const initials=(reel.creator??"?").replace(/^@/,"").slice(0,2).toUpperCase();
  return <article className="reel-card" data-testid="reel" data-creator={reel.creator}>
    <div className="cover-frame">
      {reel.cover_url?<img src={reel.cover_url} alt={`Reel de ${reel.creator??"criador"}`} width="720" height="1280" loading="lazy"/>:<div className="missing-cover"><Bookmark size={32}/><span>Sem capa</span></div>}
      <div className="cover-shade" aria-hidden="true"/>
      {states[reel.outcome]&&<Badge className="partial-badge"><span aria-hidden="true"/>{states[reel.outcome]}</Badge>}
      <span className="cover-type"><Play size={10} fill="currentColor" aria-hidden="true"/>Reel</span>
      <button className="cover-open" onClick={onPlay} aria-label={`Reproduzir Reel de ${reel.creator??"criador"}`}><span className="cover-play" aria-hidden="true"><Play size={16} fill="currentColor"/></span></button>
      <a className="cover-source" href={reel.source_url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir Reel de ${reel.creator??"criador"} no Instagram`}><ArrowUpRight size={16}/></a>
    </div>
    <div className="creator-row"><span className="creator-avatar blue" aria-hidden="true">{initials}</span><h2>{reel.creator??"Criador"}</h2><DropdownMenu.Root><DropdownMenu.Trigger asChild><Button className="card-menu" variant="ghost" size="icon" aria-label={`Opções de ${reel.creator??"referência"}`}><MoreHorizontal size={17}/></Button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="card-menu-content" align="end" sideOffset={4}>
      {!reel.removed&&<DropdownMenu.Item onSelect={onEdit}><Pencil size={14}/>Classificar</DropdownMenu.Item>}
      <DropdownMenu.Item onSelect={()=>onChange(reel,reel.removed?"restore":"remove")}>{reel.removed?<RotateCcw size={14}/>:<Trash2 size={14}/>} {reel.removed?"Restaurar":"Remover"}</DropdownMenu.Item>
    </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></div>
    <div className="card-labels">{reel.categories.map((value,index)=><Badge key={value.id} className={`category-badge ${["blue","cyan","lavender","indigo"][index%4]}`}>{value.label}</Badge>)}{reel.topics.map(value=><span key={value.id} className="topic-label">{value.label}</span>)}</div>
    <time className="saved-date" dateTime={reel.saved_at}>{new Intl.DateTimeFormat("pt-BR",{day:"numeric",month:"short"}).format(new Date(reel.saved_at))}</time>
  </article>;
}

function Settings({session,onUpdate,onError}: {session:any;onUpdate:(session:any)=>void;onError:(message:string)=>void}) {
  const [open,setOpen]=React.useState(false),[tab,setTab]=React.useState<Group|"status">("category"),[label,setLabel]=React.useState(""),[reclassify,setReclassify]=React.useState(false),[busy,setBusy]=React.useState(false),[editing,setEditing]=React.useState<Option|null>(null),[query,setQuery]=React.useState("");
  const values:Option[]=tab==="category"?session?.settings?.categories??[]:tab==="topic"?session?.settings?.topics??[]:session?.collections??[];
  const save=async(action:string,item?:Option)=>{
    if(!session?.connected||busy)return;
    setBusy(true);
    try{const next=await post("/api/settings",{revision:session.settings.taxonomy_revision,action,type:tab,id:item?.id??null,label:action==="remove"?null:label,reclassify});onUpdate(next);setLabel("");setEditing(null);setReclassify(false);}catch(e){onError((e as Error).message);}finally{setBusy(false);}
  };
  return <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Trigger asChild><Button variant="ghost" size="icon" className="settings-button" aria-label="Configurações"><Settings2 size={18}/></Button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="sheet-overlay"/><Dialog.Content className="settings-panel" aria-describedby={undefined}>
    <div className="panel-heading"><Dialog.Title>Configurações</Dialog.Title><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Fechar configurações"><X size={20}/></Button></Dialog.Close></div>
    <div className="settings-tabs" aria-label="Configurações">{(["category","topic","collection","status"] as const).map(value=><Button variant="ghost" key={value} aria-pressed={tab===value} className={tab===value?"tab-active":""} onClick={()=>{setTab(value);setEditing(null);setLabel("");setQuery("");}}>{value==="status"?"Status":plural[value]}</Button>)}</div>
    {tab==="status"?<dl className="connection-status"><div><dt>Agente MCP</dt><dd>{session?.connected?"Conectado":"Conexão pendente"}</dd></div><div><dt>Busca</dt><dd>Palavras-chave</dd></div><div><dt>Automação</dt><dd>Pausada</dd></div><div><dt>Versão</dt><dd>{session?.version??"0.1.0"}</dd></div>{session?.cooldowns?.filter((c:any)=>new Date(c.next_allowed_at)>new Date()).map((c:any)=><div key={c.service}><dt>{c.service}</dt><dd>{new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(c.next_allowed_at))}</dd></div>)}</dl>:<>
      <form className="taxonomy-form" onSubmit={e=>{e.preventDefault();save(editing?"rename":"add",editing??undefined);}}><label htmlFor="taxonomy-label">{editing?"Nome":"Adicionar"}</label><div><Input id="taxonomy-label" value={label} onChange={e=>setLabel(e.target.value)} maxLength={100} disabled={!session?.connected||busy} required/><Button type="submit" disabled={!session?.connected||busy||!label.trim()}>{editing?"Salvar":"Adicionar"}</Button>{editing&&<Button variant="ghost" type="button" aria-label="Cancelar edição" onClick={()=>{setEditing(null);setLabel("");}}><X size={16}/></Button>}</div><label className="reclassify-choice"><input type="checkbox" checked={reclassify} onChange={e=>setReclassify(e.target.checked)} disabled={!session?.connected||busy}/>Atualizar referências existentes</label></form>
      <Input className="taxonomy-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={`Buscar ${plural[tab].toLowerCase()}`} aria-label={`Buscar ${plural[tab].toLowerCase()}`}/>
      <ul className="taxonomy-list">{values.filter(value=>value.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(item=><li key={item.id}><span>{item.label}</span><Button variant="ghost" size="icon" aria-label={`Renomear ${item.label}`} disabled={busy} onClick={()=>{setEditing(item);setLabel(item.label);}}><Pencil size={15}/></Button><Button variant="ghost" size="icon" aria-label={`Remover ${item.label}`} disabled={busy} onClick={()=>save("remove",item)}><Trash2 size={15}/></Button></li>)}</ul>
    </>}
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export default function Library({initial}:{initial:string}) {
  const [session,setSession]=React.useState<any>(null),[sessionError,setSessionError]=React.useState(false),[query,setQuery]=React.useState(""),[selected,setSelected]=React.useState<Selected>(blank),[order,setOrder]=React.useState("best"),[removed,setRemoved]=React.useState(false),[result,setResult]=React.useState<{items:Reel[];total:number;cursor:string|null}>({items:[],total:0,cursor:null}),[loading,setLoading]=React.useState(true),[failure,setFailure]=React.useState(false),[revision,setRevision]=React.useState(0),[notice,setNotice]=React.useState(""),[editing,setEditing]=React.useState<Reel|null>(null),[classification,setClassification]=React.useState<{category:Option[];topic:Option[]}>({category:[],topic:[]}),[playing,setPlaying]=React.useState<Reel|null>(null),[busy,setBusy]=React.useState(false);
  const search=React.useRef<HTMLInputElement>(null);
  const filters=React.useMemo(()=>Object.fromEntries(Object.entries(selected).map(([key,values])=>[key,values.map(value=>value.id)])),[selected]);
  const pageRequest=React.useRef<AbortController|null>(null);
  React.useEffect(()=>{api("/api/session").then(setSession).catch(()=>setSessionError(true));},[revision]);
  React.useEffect(()=>{const handler=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){event.preventDefault();search.current?.focus();}};document.addEventListener("keydown",handler);return()=>document.removeEventListener("keydown",handler);},[]);
  React.useEffect(()=>{
    pageRequest.current?.abort();pageRequest.current=null;setPlaying(null);
    if(!session)return;
    if(!session.connected){setLoading(false);setResult({items:[],total:0,cursor:null});return;}
    const controller=new AbortController();
    const timer=setTimeout(()=>{setLoading(true);setFailure(false);postSearch(null,controller.signal).then(setResult).catch(e=>{if(e.name!=="AbortError")setFailure(true);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});},150);
    return()=>{clearTimeout(timer);controller.abort();pageRequest.current?.abort();};
  },[session?.connected,query,filters,order,removed,revision]);
  const postSearch=(cursor:string|null,signal?:AbortSignal)=>api("/api/search",{method:"POST",body:JSON.stringify({query,filters,order,removed,cursor}),signal});
  const loadMore=async():Promise<Reel[]>=>{
    if(!result.cursor||pageRequest.current)return [];
    const controller=new AbortController();pageRequest.current=controller;setLoading(true);
    try{
      const data=await postSearch(result.cursor,controller.signal);
      if(controller.signal.aborted)return [];
      const known=new Set(result.items.map(item=>item.id));
      const more:Reel[]=data.items.filter((item:Reel)=>!known.has(item.id));
      setResult(old=>({...data,items:[...old.items,...more]}));return more;
    }finally{if(pageRequest.current===controller){pageRequest.current=null;setLoading(false);}}
  };
  const clear=()=>{setSelected(blank);setQuery("");search.current?.focus();};
  const change=async(reel:Reel,action:string)=>{if(busy)return;setBusy(true);try{await post("/api/references",{id:reel.id,expected_revision:reel.revision,action});setRevision(v=>v+1);setNotice(action==="remove"?"Referência removida":"Referência restaurada");}catch(e){setNotice((e as Error).message);}finally{setBusy(false);}};
  const edit=(reel:Reel)=>{setEditing(reel);setClassification({category:reel.categories,topic:reel.topics});};
  const saveClassification=async()=>{if(!editing||busy)return;setBusy(true);try{await post("/api/references",{id:editing.id,expected_revision:editing.revision,action:"classify",category_ids:classification.category.map(value=>value.id),topic_ids:classification.topic.map(value=>value.id)});setEditing(null);setRevision(v=>v+1);setNotice("Classificação atualizada");}catch(e){setNotice((e as Error).message);}finally{setBusy(false);}};
  const chips=Object.entries(selected).flatMap(([group,values])=>values.map(value=>({group:group as Group,...value})));
  const active=!!query.trim()||chips.length>0;
  return <>
    <a className="skip-link" href="#library">Ir para a biblioteca</a><div className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="ShouBox, biblioteca"><span className="brand-symbol"><Bookmark size={20} strokeWidth={2.2}/></span><span>ShouBox</span></a>
      <nav className="navigation-capsule" aria-label="Navegação principal"><Button variant="ghost" className={!removed?"nav-active":"nav-inactive"} aria-pressed={!removed} onClick={()=>setRemoved(false)}><LayoutGrid size={15}/>Biblioteca</Button><Button variant="ghost" className={removed?"nav-active":"nav-inactive"} aria-pressed={removed} onClick={()=>setRemoved(true)}><Trash2 size={15}/>Removidos</Button></nav>
      <form className="search-capsule" role="search" onSubmit={e=>{e.preventDefault();setRevision(v=>v+1);}}><Search size={18} aria-hidden="true"/><Input ref={search} className="search-input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Uma ideia, um assunto, um criador…" aria-label="Encontrar uma referência" maxLength={500} autoComplete="off"/><Button className="search-action" size="icon" aria-label="Buscar" type="submit"><ArrowRight size={16}/></Button></form>
      <div className="account-capsule"><Settings session={session} onUpdate={next=>{setSession(next);setRevision(v=>v+1);}} onError={setNotice}/><DropdownMenu.Root><DropdownMenu.Trigger asChild><Button variant="ghost" className="account-button" aria-label="Meu espaço"><span aria-hidden="true">{initial}</span></Button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="card-menu-content" align="end"><DropdownMenu.Item asChild><a href="/signout-with-chatgpt?return_to=%2F" target="_top"><LogOut size={15}/>Sair</a></DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></div>
    </header>
    <main className="workspace" id="library"><UpdateNotice enabled={!!session}/><div className="library-heading"><h1>{removed?"Removidos":"Biblioteca"}</h1></div>
      <section className="toolbar" aria-label="Filtros da biblioteca"><div className="filter-controls"><SlidersHorizontal className="filter-symbol" size={16} aria-hidden="true"/>{(Object.keys(labels) as Group[]).map(group=><FilterPicker key={group} group={group} values={selected[group]} onChange={values=>setSelected(old=>({...old,[group]:values}))}/>)}{active&&<Button variant="ghost" className="clear-filters" onClick={clear}>Limpar tudo</Button>}</div>
      {chips.length>0&&<div className="selection-chips" aria-label="Filtros selecionados">{chips.slice(0,3).map(item=><Button variant="ghost" key={`${item.group}:${item.id}`} aria-label={`Remover filtro ${item.label}`} onClick={()=>setSelected(old=>({...old,[item.group]:old[item.group].filter(value=>value.id!==item.id)}))}>{item.label}<X size={12}/></Button>)}{chips.length>3&&<span className="more-chips">+{chips.length-3}</span>}</div>}</section>
      <div className="results-bar"><p role="status" aria-live="polite">{loading?"Buscando":`${result.total} ${result.total===1?"referência":"referências"}`}</p>
        <Select value={order} onValueChange={setOrder}>
          <SelectTrigger className="sort-trigger" aria-label="Ordenar referências"><SelectValue/></SelectTrigger>
          <SelectContent className="filter-menu sort-menu" position="popper" align="end" sideOffset={6}>
            <SelectItem value="best">Melhor correspondência</SelectItem>
            <SelectItem value="recent">Salvos mais recentes</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {sessionError||failure?<section className="empty-state" role="alert"><h2>Não foi possível carregar</h2><Button className="reset-button" onClick={()=>{setSessionError(false);setRevision(v=>v+1);}}>Tentar novamente</Button></section>:!session?.connected&&!loading?<section className="empty-state"><div className="empty-symbol"><Bookmark size={28}/></div><h2>Conexão pendente</h2><Button className="reset-button" onClick={()=>setRevision(v=>v+1)}>Atualizar</Button></section>:loading&&result.items.length===0?<section className="empty-state" aria-busy="true"><LoaderCircle className="loading-icon" size={24}/></section>:result.items.length?<section className="reel-grid" aria-label={removed?"Referências removidas":"Referências"} aria-busy={loading}>{result.items.map(reel=><ReelCard key={reel.id} reel={reel} onChange={change} onEdit={()=>edit(reel)} onPlay={()=>setPlaying(reel)}/>)}</section>:<section className="empty-state"><div className="empty-symbol"><Bookmark size={28}/></div><h2>{active?"Nenhum resultado":removed?"Nenhuma referência removida":"Nenhuma referência"}</h2>{active&&<Button className="reset-button" onClick={clear}>Limpar filtros</Button>}</section>}
      {result.cursor&&<div className="library-more"><Button disabled={loading} onClick={()=>void loadMore().catch(e=>{if(e.name!=="AbortError")setNotice(e.message);})}>Mais referências</Button></div>}
    </main></div>
    {notice&&<div className="notification" role="status"><span>{notice}</span><Button variant="ghost" size="icon" aria-label="Fechar aviso" onClick={()=>setNotice("")}><X size={17}/></Button></div>}
    <Dialog.Root open={!!editing} onOpenChange={value=>{if(!value)setEditing(null);}}><Dialog.Portal><Dialog.Overlay className="sheet-overlay"/><Dialog.Content className="classification-panel" aria-describedby={undefined}><div className="panel-heading"><Dialog.Title>Classificar</Dialog.Title><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Fechar classificação"><X size={20}/></Button></Dialog.Close></div><div className="classification-pickers"><FilterPicker group="category" values={classification.category} onChange={category=>setClassification(old=>({...old,category}))}/><FilterPicker group="topic" values={classification.topic} onChange={topic=>setClassification(old=>({...old,topic}))}/></div><div className="classification-values">{[...classification.category,...classification.topic].map(item=><Badge key={item.id} className="blue">{item.label}</Badge>)}</div><Button className="save-classification" disabled={busy} onClick={saveClassification}>Salvar</Button></Dialog.Content></Dialog.Portal></Dialog.Root>
    {playing&&<ReelPlayer initial={playing} items={result.items} total={result.total} hasMore={!!result.cursor} loadMore={loadMore} onClose={()=>setPlaying(null)}/>}
  </>;
}
