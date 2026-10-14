---
name: capturar-favoritos
description: Captura os Reels salvos do Instagram para o ShouBox, um por vez, com descoberta persistente e retomada da fila.
---

# Capturar favoritos

Execute somente no Work na nuvem e na instalação escolhida pela pessoa.
Leia get_runtime com file=workflow.txt. Exija runtime 1.7.0 ou uma versão compatível posterior.
Confirme o acesso aos Salvos no navegador da nuvem.
Adquira start_run com mode=acquire e pending_cursor=null.
Use trigger=scheduled somente quando o host identificar uma ocorrência agendada.
Use trigger=manual para uma mensagem da pessoa ou um teste manual.

Continue até concluir as listas selecionadas e tentar todos os itens elegíveis.
Não transforme uma página, um lote ou alguns itens bem-sucedidos em uma condição de conclusão.
Obedeça um limite menor quando a pessoa solicitar uma amostra.
Informe progresso breve durante a execução, sem encerrar a captura para apresentar esse progresso.

Use sync_collections, get_discovery e record_discovery_page para a descoberta.
Confirme cada página e sua âncora no Site antes de obter a mídia.
Faça a verificação dos novos Salvos sem perder a âncora das listas antigas.
Alterne páginas de descoberta e páginas de processamento para avançar nas duas filas.
Conclua todas as listas iniciais quando baseline.status=collecting. Ignore as identidades baseline_only.
Marque end_reached somente quando o navegador comprovar o fim real da lista.

Use [processar-pendente](../processar-pendente/SKILL.md) para os itens registrados.
Mantenha uma aba de descoberta e uma aba do item atual.
Confirme a remoção dos arquivos e o fechamento da aba antes do próximo item.
Preserve as edições manuais, as referências removidas e o conteúdo já verificado.

Trate uma falha de download do modelo como falha da análise.
Preserve a transcrição como indisponível e continue a descoberta e as modalidades disponíveis.
Não repita a preparação do transcritor em cada item após a mesma falha de infraestrutura.
Respeite o cooldown do serviço afetado. Pare as requisições ao Instagram em caso de 429 ou perda de autenticação.
Não contorne uma rejeição de aprovação, um cancelamento do usuário ou um controle do host.

Renove a lease antes do vencimento. Preserve a página e o cursor atuais durante a renovação.
Se o host anunciar um limite real, grave o estado e finalize a lease com o resultado correto.
Use a próxima ocorrência de uma tarefa autorizada para retomar o trabalho restante.
Não invente um agendamento nem prometa uma nova execução sem um gatilho confirmado.
Uma interrupção não significa que a biblioteca está completa.

Ao terminar, informe o run_id, started_at, o resultado de finish_run e as pendências restantes.
Diferencie itens processados nesta execução das contagens totais da biblioteca.
Informe a próxima execução somente quando houver uma tarefa e um horário confirmados.

