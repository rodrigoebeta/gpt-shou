---
name: capturar-favoritos
description: Captura os Reels salvos do Instagram para o ShouBox, um por vez, com descoberta persistente e retomada da fila.
---

# Capturar favoritos

Execute somente no Work pelo aplicativo do ChatGPT no seu celular e na instalação escolhida pela pessoa.
Leia get_runtime com file=workflow.txt. Exija runtime 1.7.4 ou uma versão compatível posterior.
Adquira start_run com mode=acquire e pending_cursor=null.
Use trigger=scheduled somente quando o host identificar uma ocorrência agendada.
Use trigger=manual para uma mensagem da pessoa ou um teste manual.

Use [processar-pendente](../processar-pendente/SKILL.md) primeiro, com a lease atual.
Percorra toda a fila elegível existente antes de verificar novos Salvos, percorrer coleções ou registrar descobertas.
Não espere itens com retry_at futuro nem repita tentativas desta execução.
Ignore identidades baseline_only. Inicie o levantamento quando não houver pendentes elegíveis.
Somente então confirme o acesso aos Salvos no navegador remoto. Use autenticar se o login for necessário.

Continue até concluir as listas selecionadas e tentar todos os itens elegíveis.
Não transforme uma página, um lote ou alguns itens bem-sucedidos em uma condição de conclusão.
Obedeça um limite menor quando a pessoa solicitar uma amostra.
Informe progresso breve durante a execução, sem encerrar a captura para apresentar esse progresso.

Use sync_collections, get_discovery e record_discovery_page para a descoberta.
Use uma única aba de descoberta no fluxo normal. Leia os hiperlinks dos cartões já carregados nos Salvos.
Não abra cada Reel para copiar sua URL. Grave as identidades e processe as URLs por código.
Use creator=null quando o cartão não mostrar o autor. Complete-o com metadados verificados durante o processamento.
Confirme cada página e sua âncora no Site antes de obter a mídia.
Faça a verificação dos novos Salvos sem perder a âncora das listas antigas.
Depois de cada página descoberta, processe os novos pendentes elegíveis antes de descobrir outra página.
Conclua todas as listas iniciais quando baseline.status=collecting. Ignore as identidades baseline_only.
Marque end_reached somente quando o navegador comprovar o fim real da lista.

Use [processar-pendente](../processar-pendente/SKILL.md) para os itens registrados.
Abra uma aba de descoberta somente ao começar o levantamento dos Salvos.
Abra uma aba do item somente quando faltar uma informação que exija inspeção no navegador.
Confirme a remoção dos arquivos criados e o fechamento de qualquer aba do item antes do próximo item.
Preserve as edições manuais, as referências removidas e o conteúdo já verificado.

Trate uma falha de download do modelo como falha da análise.
Preserve a transcrição como indisponível e continue a descoberta e as modalidades disponíveis.
Não repita a preparação do transcritor em cada item após a mesma falha de infraestrutura.
Respeite o cooldown do serviço afetado. Pare as requisições ao Instagram em caso de 429 ou perda de autenticação.
Não contorne uma rejeição de aprovação, um cancelamento do usuário ou um controle do host.
Apply the approval handling in processar-pendente when optional telemetry blocks analysis.
Continue permitted stages and remaining items unless the host declares a wider restriction.

Renove a lease antes do vencimento. Preserve a página e o cursor atuais durante a renovação.
Se o host anunciar um limite real, grave o estado e finalize a lease com o resultado correto.
Use a próxima ocorrência de uma tarefa autorizada para retomar o trabalho restante.
Não invente um agendamento nem prometa uma nova execução sem um gatilho confirmado.
Uma interrupção não significa que a biblioteca está completa.

Ao terminar, informe o run_id, started_at, o resultado de finish_run e as pendências restantes.
Diferencie itens processados nesta execução das contagens totais da biblioteca.
Informe a próxima execução somente quando houver uma tarefa e um horário confirmados.

