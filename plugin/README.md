# Skills do ShouBox

Este diretório contém instalar, autenticar, capturar-favoritos, agendar e processar-pendente.
As skills complementam o plugin que o Sites cria para cada instalação.

1. Leia get_site com include_mcp_connection=true.
2. Copie o plugin_id retornado, sem alterar seu valor.
3. Leia o inventário com Plugin Creator get_plugin_files.
4. Leia plugin.json e .codex-plugin/plugin.json quando aparecerem no inventário.
5. Preserve o current_release_id retornado nessa leitura.
6. Salve um objeto JSON com o campo contents em current-source.json, no ambiente temporário privado.
7. Execute `python plugin/package.py current-source.json update.zip`.
8. Compare os manifests gerados com os manifests originais.
9. Use update_plugin com o plugin_id, expected_release_id e o caminho absoluto do ZIP.
10. Releia o inventário e as cinco skills depois da atualização.

O pacote preserva as conexões, os arquivos omitidos, a apresentação e os prompts existentes.
O pacote aumenta somente a versão de patch e adiciona as skills.
O script recusa conversões desconhecidas e caminhos personalizados que exigem revisão.
Se a versão mudar durante a preparação, leia os arquivos atuais e prepare outro pacote.

Não distribua o ZIP de uma instalação para outra pessoa.
Não inclua current-source.json, o ZIP privado ou os IDs de uma instalação no repositório público.
Cada instalação recebe suas próprias conexões pelo Sites.

Use runtime 1.7.0 ou uma versão compatível posterior.
Atualize as tarefas já existentes com PROMPT-DA-TAREFA.txt; a publicação das skills não altera os prompts antigos.
Valide o método de captura com uma execução manual.
Deixe cada pessoa escolher o intervalo e o fuso. Confirme a tarefa salva quando ela solicitar o agendamento.
Não exija aguardar uma ocorrência pelo horário para concluir a instalação.
