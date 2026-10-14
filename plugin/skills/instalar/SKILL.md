---
name: instalar
description: Instala ou atualiza o ShouBox privado no ChatGPT Sites e adiciona as cinco skills ao plugin da instalação.
---

# Instalar o ShouBox

Use esta skill para instalar ou atualizar o ShouBox na conta da pessoa.
Responda no idioma da pessoa.

1. Obtenha o pacote público em https://github.com/rodrigoebeta/gpt-shoubox.
2. Leia VERSION.json e INSTRUCOES-DO-AGENTE.md na mesma revisão.
3. Verifique FILES.sha256 antes de executar arquivos.
4. Use a skill Sites instalada para preparar, testar e publicar a instalação privada.
5. Reutilize o project_id existente. Preserve os dados, o acesso e as escolhas da pessoa nas atualizações.
6. Obtenha o plugin_id retornado por get_site com include_mcp_connection=true.
7. Use Plugin Creator para ler o inventário e os arquivos atuais desse plugin.
8. Prepare a atualização com plugin/package.py conforme plugin/README.md.
9. Atualize o plugin existente com expected_release_id. Preserve a conexão, os nomes e a apresentação.
10. Releia os arquivos publicados. Confirme as cinco skills e as ferramentas do ShouBox.
11. Use autenticar para preparar o navegador da nuvem.
12. Execute capturar-favoritos em uma amostra explicitamente limitada para validar gravação, busca e reprodução.
13. Use agendar somente depois de obter o intervalo e o fuso da pessoa.

Não crie outro plugin para envolver o mesmo Site.
Não publique identidades da instalação no pacote público.
Não declare a instalação completa sem uma gravação real e sua releitura.
Valide o método de captura com o teste manual. Confirme a tarefa salva se a pessoa solicitar um agendamento.
Não exija aguardar uma ocorrência pelo horário para concluir essa validação.
Se faltar uma ferramenta necessária, indique seu nome e preserve a instalação existente.

O runtime mínimo destas skills é 1.7.0. O contrato é 1.0.0; o pacote da API é 0.1.0.

