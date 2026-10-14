---
name: instalar
description: Instala ou atualiza o shōu privado no ChatGPT Sites e adiciona as cinco skills ao plugin da instalação.
---

# Instalar o shōu

Use esta skill para instalar ou atualizar o shōu na conta da pessoa.
Responda no idioma da pessoa.

1. Obtenha o pacote público em https://github.com/rodrigoebeta/gpt-shou.
2. Leia VERSION.json e INSTRUCOES-DO-AGENTE.md na mesma revisão.
3. Verifique FILES.sha256 antes de executar arquivos.
4. Use a skill Sites instalada para preparar, testar e publicar a instalação privada. Atualize o título do Site para shōu.
5. Reutilize o project_id existente. Preserve os dados, o acesso e as escolhas da pessoa nas atualizações.
6. Obtenha o plugin_id retornado por get_site com include_mcp_connection=true.
7. Use Plugin Creator para ler o inventário e os arquivos atuais desse plugin.
8. Prepare a atualização com plugin/package.py conforme plugin/README.md.
9. Atualize o plugin existente com expected_release_id. Preserve os identificadores, a conexão e a apresentação gerenciada pelo App.
10. Releia os arquivos publicados. Confirme as cinco skills e as ferramentas do shōu.
11. Em uma instalação nova, use autenticar pelo Work no aplicativo do ChatGPT no celular.
12. Em uma instalação nova, valide captura, gravação, busca e reprodução com uma amostra explicitamente limitada.
13. Use agendar somente depois de obter o intervalo e o fuso da pessoa.

Não crie outro plugin para envolver o mesmo Site.
Não publique identidades da instalação no pacote público.
Não declare uma instalação nova completa sem uma gravação real e sua releitura.

Para uma atualização, leia a seção Atualizações em INSTRUCOES-DO-AGENTE.md.
Confira release_version em VERSION.json e version em app/server/release.json na mesma revisão completa.
Não execute login do Instagram nem captura quando a pessoa pedir somente uma atualização.
Verifique a lease atual antes de publicar. Aguarde uma execução ativa terminar sem interrompê-la.
Preserve project_id, dados, mídia armazenada, credenciais server-only, acesso, configurações e migrações aplicadas.
Atualize o plugin existente e os prompts das tarefas autorizadas sem mudar intervalo ou fuso.
Não crie outra tarefa quando não houver ferramenta para atualizar a tarefa existente. Informe essa etapa pendente.
Valide o build e as versões publicadas. Releia as skills e confira /api/updates após a atualização.
Não confunda disponibilidade de versão com uma atualização já aplicada.
Valide o método de captura com o teste manual. Confirme a tarefa salva se a pessoa solicitar um agendamento.
Não exija aguardar uma ocorrência pelo horário para concluir essa validação.
Se faltar uma ferramenta necessária, indique seu nome e preserve a instalação existente.

O runtime mínimo destas skills é 1.7.5. O contrato é 1.0.0; o pacote da API é 0.1.0.

