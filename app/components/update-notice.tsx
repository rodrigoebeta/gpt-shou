"use client";

import * as React from "react";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

type Update = { status: string; installed_version: string; latest: { version: string; summary: string } | null };

export function UpdateNotice({ enabled }: { enabled: boolean }) {
  const [update, setUpdate] = React.useState<Update | null>(null);
  const [open, setOpen] = React.useState(false), [copied, setCopied] = React.useState(false);
  const [copyError, setCopyError] = React.useState(false);
  const instructionsId = React.useId();
  const promptField = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    if (!enabled) return;
    let controller: AbortController | undefined;
    const check = async () => {
      if (document.visibilityState === "hidden" || controller) return;
      controller = new AbortController();
      const active = controller;
      try {
        const response = await fetch("/api/updates", { signal: active.signal });
        if (response.ok) {
          const data = await response.json() as Update;
          if (!active.signal.aborted && data.status !== "unavailable") setUpdate(data);
        }
      } catch { /* A release check must not interrupt the library. */ }
      finally { if (controller === active) controller = undefined; }
    };
    void check();
    const timer = setInterval(check, 15 * 60 * 1000);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", check); controller?.abort(); };
  }, [enabled]);
  if (!enabled || update?.status !== "available" || !update.latest) return null;
  const prompt = `Atualize meu ShouBox em ${window.location.origin} para a versão ${update.latest.version} ou uma versão estável posterior. Use a skill instalar e o pacote oficial https://github.com/rodrigoebeta/gpt-shoubox. Confira a versão e os hashes na mesma revisão. Preserve este Site, seus dados, acesso, configurações, plugin e agendamentos. Verifique se há uma captura ativa antes de publicar. Atualize as skills e os prompts das tarefas existentes sem mudar seus horários. Não inicie captura nem login do Instagram para esta atualização. Confirme as versões publicadas e informe qualquer etapa pendente.`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(prompt); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); promptField.current?.focus(); promptField.current?.select(); }
  };
  return <aside className="update-notice" aria-label="Atualização do ShouBox">
    <div className="update-notice-heading">
      <div><strong>Uma nova versão do ShouBox está disponível</strong><p>Versão {update.latest.version} · Você usa a {update.installed_version}</p></div>
      <Button variant="outline" aria-expanded={open} aria-controls={instructionsId} onClick={() => setOpen(!open)}>{open ? "Fechar detalhes" : "Ver atualização"}<ArrowUpRight size={15} aria-hidden="true"/></Button>
    </div>
    {open && <div id={instructionsId} className="update-instructions">
      <p>{update.latest.summary}</p>
      <ol><li>Copie o pedido de atualização abaixo.</li><li>Abra o Work pelo aplicativo do ChatGPT no seu celular.</li><li>Envie o pedido. O ChatGPT aplica a atualização e confirma o resultado.</li></ol>
      <label htmlFor={`${instructionsId}-prompt`}>Pedido de atualização</label>
      <textarea id={`${instructionsId}-prompt`} ref={promptField} readOnly value={prompt} rows={5}/>
      <div className="update-copy"><Button onClick={copy}>{copied ? <Check size={15} aria-hidden="true"/> : <Copy size={15} aria-hidden="true"/>}{copied ? "Pedido copiado" : "Copiar pedido"}</Button><span role="status">{copyError ? "Selecione e copie o texto acima." : copied ? "Agora envie no Work pelo aplicativo do ChatGPT no seu celular." : "A atualização começa depois que você enviar o pedido."}</span></div>
    </div>}
  </aside>;
}
