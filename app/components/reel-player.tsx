"use client";

import * as React from "react";
import { Dialog } from "radix-ui";
import { ArrowUpRight, ChevronDown, ChevronUp, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Reference = { id:string; creator:string|null; source_url:string };
type Props = {
  initial:Reference;
  items:Reference[];
  total:number;
  hasMore:boolean;
  loadMore:()=>Promise<Reference[]>;
  onClose:()=>void;
};

export function ReelPlayer({initial,items,total,hasMore,loadMore,onClose}:Props) {
  const [current,setCurrent]=React.useState(initial);
  const [loading,setLoading]=React.useState(false);
  const [error,setError]=React.useState("");
  const pending=React.useRef(false);
  const mounted=React.useRef(true);
  const origin=React.useRef(typeof document!=="undefined"?document.activeElement as HTMLElement:null);
  const gesture=React.useRef<{id:number;x:number;y:number}|null>(null);
  const index=items.findIndex(item=>item.id===current.id);
  const hasPrevious=index>0;
  const hasNext=index>=0&&(index<items.length-1||hasMore);
  React.useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);

  const move=async(direction:-1|1)=>{
    if(pending.current||!(direction===1?hasNext:hasPrevious))return;
    setError("");
    const next=items[index+direction];
    if(next){setCurrent(next);return;}
    pending.current=true;setLoading(true);
    try{
      const more=await loadMore();
      if(mounted.current&&more[0])setCurrent(more[0]);
    }catch(e){if(mounted.current)setError((e as Error).message);}
    finally{pending.current=false;if(mounted.current)setLoading(false);}
  };
  const startGesture=(event:React.PointerEvent<HTMLDivElement>)=>{
    if(event.pointerType==="mouse")return;
    if(!event.isPrimary){gesture.current=null;return;}
    if((event.target as Element).closest("button,a"))return;
    gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const endGesture=(event:React.PointerEvent<HTMLDivElement>)=>{
    const start=gesture.current;gesture.current=null;
    if(!start||start.id!==event.pointerId)return;
    const dx=event.clientX-start.x,dy=event.clientY-start.y;
    if(Math.abs(dy)>=48&&Math.abs(dy)>Math.abs(dx)*1.5)void move(dy<0?1:-1);
  };

  return <Dialog.Root open onOpenChange={open=>{if(!open)onClose();}}>
    <Dialog.Portal>
      <Dialog.Overlay className="sheet-overlay"/>
      <Dialog.Content className="player-panel" aria-describedby={undefined}
        onCloseAutoFocus={event=>{event.preventDefault();origin.current?.focus();}}
        onKeyDown={event=>{
          if(event.altKey||event.ctrlKey||event.metaKey)return;
          if(event.key==="ArrowDown"||event.key==="ArrowUp"){
            event.preventDefault();void move(event.key==="ArrowDown"?1:-1);
          }
        }}>
        <div className="panel-heading"><Dialog.Title>{current.creator??"Reel"}</Dialog.Title>
          <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Fechar reprodução"><X size={20}/></Button></Dialog.Close>
        </div>
        <div className="player-body">
          <iframe key={current.id} title={`Reel de ${current.creator??"criador"} no Instagram`}
            src={`${current.source_url}embed/`} sandbox="allow-scripts allow-same-origin allow-popups" allow="autoplay; fullscreen"/>
          {/* The cross-origin embed owns its gestures. Keep the swipe area outside its controls. */}
          <div className="player-navigation" role="group" aria-label="Navegar pelas referências"
            onPointerDown={startGesture} onPointerUp={endGesture}
            onPointerCancel={()=>{gesture.current=null;}} onLostPointerCapture={()=>{gesture.current=null;}}>
            <Button variant="ghost" size="icon" aria-label="Referência anterior" disabled={!hasPrevious||loading} onClick={()=>void move(-1)}><ChevronUp size={22}/></Button>
            <span className="player-swipe-hint">Deslize aqui</span>
            <Button variant="ghost" size="icon" aria-label="Próxima referência" disabled={!hasNext||loading} onClick={()=>void move(1)}>{loading?<LoaderCircle size={22} className="loading-icon"/>:<ChevronDown size={22}/>}</Button>
          </div>
        </div>
        <div className="player-position" role="status" aria-live="polite">{index+1} de {total}{loading?" · Carregando":!hasNext?" · Fim das referências":""}</div>
        {error&&<p className="player-error" role="alert">{error} Use a seta para tentar novamente.</p>}
        <a className="instagram-fallback" href={current.source_url} target="_blank" rel="noopener noreferrer">Abrir no Instagram<ArrowUpRight size={16}/></a>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
