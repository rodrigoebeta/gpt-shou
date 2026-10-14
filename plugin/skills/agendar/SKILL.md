---
name: agendar
description: Agenda a captura de favoritos do ShouBox em uma tarefa Work pelo aplicativo do ChatGPT no seu celular, no intervalo e fuso escolhidos pela pessoa.
---

# Agendar a captura

Oriente a configuração pelo Work no aplicativo do ChatGPT no celular.
As ocorrências usam a execução remota do Work. Não exija que o aplicativo permaneça aberto.

Confirme o Site, o intervalo e o fuso solicitados.
Reutilize escolhas explícitas já fornecidas. Pergunte somente pelos valores ausentes.
Deixe a pessoa escolher livremente o intervalo ou os horários. Não imponha uma frequência padrão nem dois horários diários.
Leia as tarefas existentes antes de criar outra tarefa.
Confirme o acesso aos Salvos e uma captura manual bem-sucedida.

Use as ferramentas de agendamento da nuvem disponíveis neste host.
Para uma tarefa ligada ao Site, leia get_site e suas automations.
Use create_schedule somente com o schedule_request_id retornado por essa leitura.
Repita o mesmo request_id se a resposta da criação se perder.
Não crie uma duplicata para substituir uma atualização indisponível.
Não use uma automação local do Codex como substituto de uma tarefa Work pelo aplicativo do ChatGPT no seu celular.

Use o [modelo de prompt](references/prompt.txt) e substitua SITE_URL pelo endereço confirmado.
Inclua a instrução capturar-favoritos e a leitura do workflow atual.
Preserve o intervalo escolhido no agendamento, sem criar ocorrências extras para esvaziar a fila.
Informe a pessoa quando uma alteração do intervalo ajudar a concluir o acervo mais rapidamente.

Confirme o identificador, o fuso, o intervalo e a próxima ocorrência retornados pelo agendador.
Use uma execução manual bem-sucedida para validar o método de captura.
Conclua a configuração após confirmar a tarefa salva e as escolhas da pessoa. Não exija aguardar uma ocorrência pelo horário.
Registre o teste manual e a confirmação do agendamento separadamente. Não declare que observou um disparo automático sem essa evidência.
Se faltar a ferramenta de criação ou atualização, entregue o prompt e indique a etapa pendente.
Não declare que a tarefa existe sem uma confirmação do agendador.

