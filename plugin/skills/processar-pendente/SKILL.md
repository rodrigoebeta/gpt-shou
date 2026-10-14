---
name: processar-pendente
description: Processa a fila pendente do ShouBox por páginas, preserva a posição após interrupções e remove os artefatos de cada item.
---

# Processar pendentes

Execute somente no Work na nuvem.
Leia o workflow.txt atual com get_runtime antes de processar a fila.
Reutilize a lease ativa desta tarefa. Adquira uma lease somente quando não houver uma lease desta tarefa.
Não adquira uma segunda lease para a mesma execução.

1. Guarde a página pending e seu next_pending_cursor retornados por start_run.
2. Releia cada referência antes de processá-la. Preserve o conteúdo e as classificações manuais.
3. Processe um item por vez conforme workflow.txt.
4. Grave o resultado verificado com update_reference, inclusive um resultado parcial ou uma falha definitiva.
5. Releia o conteúdo e a capa antes de declarar sucesso.
6. Execute a limpeza do item e confirme que o diretório work ficou vazio.
7. Feche a aba do item e confirme sua ausência.
8. Continue nos demais itens da página.
9. Solicite a próxima página com start_run mode=renew e pending_cursor igual ao cursor guardado.
10. Continue até next_pending_cursor=null e a página atual estar concluída.

Durante uma renovação intermediária, mantenha a página local em andamento.
Não substitua essa página por uma página reiniciada.
Após a última página, consulte uma vez com pending_cursor=null para obter itens descobertos durante o processamento.
O backend exclui as tentativas da mesma execução. Não repita resultados parciais em um ciclo infinito.
O backend prioriza itens nunca tentados e depois as tentativas mais antigas.
Cada update_reference grava essa posição de forma durável, mesmo sem finish_run.
Uma nova lease usa pending_cursor=null. Nunca reutilize o cursor de uma lease anterior.

Respeite failure.retry_at. Preserve itens indisponíveis sem tentar novamente em todas as execuções.
Se a análise falhar, grave o conteúdo disponível e continue no próximo item.
Use no máximo duas tentativas para uma falha transitória do item.
Suspenda a modalidade afetada após uma falha repetida de infraestrutura.
Não substitua uma transcrição válida por null durante uma tentativa malsucedida.
Pare antes do próximo item se a gravação ou a limpeza permanecer incerta.
Respeite as rejeições de aprovação e os cancelamentos. Não procure outra rota para executar uma ação rejeitada.

Finalize uma lease adquirida por esta skill com finish_run.
Devolva o controle à captura quando ela for a dona da lease.
Informe separadamente: itens completos, parciais, adiados e bloqueados.
Uma fila elegível vazia não comprova o fim da descoberta nem a ausência de itens em cooldown.

