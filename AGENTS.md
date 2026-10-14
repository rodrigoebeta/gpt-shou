# ShouBox — instruções para instalação e uso

- Este repositório prepara uma instalação independente no Sites para cada pessoa. Referências e análises serão armazenadas no próprio Site, sem Notion obrigatório.
- Este pacote contém as fontes e as instruções para validação. Verificar as capacidades cloud, o fluxo agendado e a instalação independente antes de ativar a automação.
- Manter onboarding, modelo de prompt da Scheduled Task, scripts auxiliares e aplicativo compatíveis na mesma versão. Ao mudar instalação, execução ou formato dos resultados, revisar esses materiais na mesma entrega.
- O prompt orienta o agente do Work pelo aplicativo do ChatGPT no seu celular. O auxiliar de aquisição obtém mídia e legenda. O auxiliar de transcrição usa FFmpeg e faster-whisper no contêiner Work. O agente realiza a descrição visual e a tradução integral da fala estrangeira para português do Brasil. Preservar o original e usar ambos os textos na busca. O modelo Work também gera a descrição semântica com base nas fontes verificadas. Incluir esse texto na busca e preservar a descrição visual factual.
- O prompt deve identificar a versão compatível do script e o procedimento para obtê-lo, preparar suas dependências e validar seus resultados. Não presumir arquivos do computador nem instalações de execuções anteriores na nuvem.
- Atualizar um template no repositório não atualiza automaticamente uma tarefa já configurada. A instalação e as atualizações devem orientar o agente a conferir e atualizar a tarefa quando necessário, dentro do escopo autorizado.
- Manter dependências, ferramentas, caches e temporários locais à instalação ou ao ambiente temporário da execução. Não instalar globalmente nem alterar PATH/configurações globais sem autorização explícita.
- Credenciais, configurações da instância, mídia pessoal e arquivos locais de continuidade não pertencem ao pacote de distribuição.
- Preparar o login do Instagram em uma conversa Work pelo aplicativo do ChatGPT no seu celular antes da tarefa agendada. Usar AUTENTICAR-INSTAGRAM.txt e confirmar a conta e o acesso aos Salvos. Preservar a sessão e verificar seu acesso em uma execução posterior.
