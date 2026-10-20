# Handoff ISR · como usar

Esta pasta tem **um arquivo por tela**. Cada arquivo traz o layout, os dados reais de que a tela precisa e uma verificação para rodar no fim.

## Como trabalhar
0. **Uma vez, antes de tudo:** rode `02 Logica do sistema.md`. Ele compara a lógica (papéis, dados, regras, eventos entre os apps) com o que o app já tem, sem editar nada.
1. Faça **uma tela por conversa** no Claude Code. Abra o arquivo da tela e cole o prompt que está no topo dele.
2. O Claude Code lê este 00, depois o arquivo da tela, e mostra um plano antes de editar.
3. Você aprova o plano e ele implementa.
4. Ele roda a verificação do fim do arquivo. Só passe para a próxima tela quando tudo estiver ✓.

Ordem: na aluna, comece por `aluna/00 Estrutura geral`. No Painel do professor, comece por `gestao/painel-professor/00 Moldura do painel` e siga a numeração (01 a 12). Cada subpágina tem o próprio arquivo.

## Regras para o Claude Code (valem para todas as telas)
1. **Os arquivos em `referencia/` são protótipos em HTML, só referência visual.** Não copie código nem dados deles. A sintaxe (`<sc-if>`, `<sc-for>`, `{{ }}`) não existe no app real.
2. **Todos os dados do protótipo são fictícios.** Toda informação na tela vem do banco ou do backend que o app já usa.
3. **O sistema de verificação e transposição de dados reais que já existe no app continua igual.** Não remova, não pule e não reescreva esse sistema. Toda tela nova lê os dados pelo mesmo caminho que as telas atuais usam e passa pelas mesmas verificações. Se uma tela precisar de um dado que esse sistema ainda não traz, estenda o sistema seguindo o padrão dele e avise no plano.
4. **Mude só a tela pedida.** Não refatore outras telas, rotas ou a camada de dados além do necessário.
5. **Mantenha login, permissões e o seletor "vendo como".** Cada pessoa vê só o que já via antes.
6. **Plano antes de editar.** O plano lista: (a) quais blocos atuais viram quais blocos novos; (b) cada dado da seção "Dados reais" e de onde ele vem; (c) o que está FALTANDO.
7. **Estados vazios e de erro são obrigatórios.** Toda lista precisa de um texto para quando não tem nada.

## Arquivos
- `01 Tokens e padroes.md`: **design**, com cores, tipo, raios e comportamento dos botões (vale para tudo)
- `02 Logica do sistema.md`: **lógica**, com papéis e permissões, entidades, regras de negócio e eventos entre gestão e aluna (vale para tudo; se discordar de uma tela, este vale)
- `gestao/painel-professor/`: um arquivo por subpágina do Painel do professor (00 a 12, mapa no 00)
- `gestao/01 Miles e loja.md`: página da escola
- `aluna/`: telas da área da aluna
- `referencia/`: os protótipos (só para olhar)
