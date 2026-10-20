# Painel do professor › Página da turma › Visão geral

> **Prompt para colar no Claude Code:**
> Leia `00 LEIA PRIMEIRO.md`, depois `gestao/painel-professor/00 Moldura do painel.md`, depois este arquivo inteiro. Implemente só a subpágina **Página da turma › Visão geral** do Painel do professor. Siga as regras de dados reais do 00. Antes de editar, me mostre o plano (mapeamento dos dados reais e o que falta). Espere eu aprovar. Depois de editar, rode a verificação do fim deste arquivo e me mostre o resultado.

**Onde fica:** Minhas turmas → clicar numa turma (aba aberta por padrão).

## Layout
Dois cartões lado a lado (`flex-wrap`, gap 20px).

**1. Cartão da turma**
- faixa do nível no topo ("<nível> · <nome do nível> · ciclo <ciclo>");
- nome (22px/800) e "horário · professora";
- **ocupação**: rótulo "ocupação" + "x/y" à direita, colorido conforme a lotação, e barra de 10px;
- caixa `#f5f5f0` com o projeto e o status do caderno (ex.: "plano da próxima aula publicado");
- botão "✎ Editar turma", **só para a coordenação**. A professora não vê esse botão.

**2. Cartão "Professor substituto"**
- substituições marcadas para esta turma, em caixas `#e5f2f6`;
- para a professora, só leitura. Quem marca substituição é a coordenação. A professora pede a substituição pela aba Hoje.

## Dados reais desta subpágina
Mapeie cada item para a fonte que já existe no app. Se não existir, marque **FALTA** no plano e pare; não invente.

- Turma: nome, nível, ciclo, horário, professora, projeto, vagas ocupadas/total
- Status do caderno/plano da próxima sessão
- Substituições marcadas para a turma (data, quem cobre)

## Verificação (rodar depois de implementar)
- [ ] Nenhum nome, número ou texto fictício do protótipo aparece (Dave, Priscila, Traditions, SEG 19h etc.).
- [ ] A subpágina abre sem erro com uma professora que tem dados e com uma sem dados (estado vazio).
- [ ] A professora só vê as próprias turmas, alunas e clubes.
- [ ] A professora não vê "Editar turma" nem o formulário de substituto.
- [ ] A ocupação é a mesma da Minhas turmas.
- [ ] O sistema de verificação e transposição de dados que já existe continua rodando e passando como antes.
@@@@@@@@@@
# Painel do professor › Página da turma › Plano das aulas

> **Prompt para colar no Claude Code:**
> Leia `00 LEIA PRIMEIRO.md`, depois `gestao/painel-professor/00 Moldura do painel.md`, depois este arquivo inteiro. Implemente só a subpágina **Página da turma › Plano das aulas** do Painel do professor. Siga as regras de dados reais do 00. Antes de editar, me mostre o plano (mapeamento dos dados reais e o que falta). Espere eu aprovar. Depois de editar, rode a verificação do fim deste arquivo e me mostre o resultado.

**Onde fica:** Página da turma → aba "Plano das aulas". Também abre pelo botão "Ver plano" do Hoje.

## O que é
O plano de cada sessão já vem pronto do syllabus. A professora confere e publica. Se quiser, ajusta antes ("Ajustar"). O que ela publica vai para o caderno das alunas.

## Layout
1. **Faixa de sessões:** cartões de 128px roláveis na horizontal. Cada um mostra "S4", a data, o título e o status. A sessão aberta fica escura (`#164951`) e as passadas ficam com opacidade menor.
2. **Área da sessão** (fundo `#f2ebe3`, radius 28px, padding 24px, gap 16px):
   - **topo**:
     - eyebrow com sessão e data, título 24px/800;
     - pills de status (rascunho / publicado) e de origem ("do syllabus" / "ajustado por você");
     - à direita, os botões **Ajustar** (branco) e **Publicar** (escuro). Em modo ajuste, os botões viram "Pronto" e "Publicar alterações".
   - **material de referência**: cartão branco com dois links-pill, "Syllabus 2026.4 ↗" e "<nível> ↗" (abrem os documentos gerais).
   - **today you will…**: o objetivo da sessão (19px/800).
   - **Roteiro** (cartão branco), com o título e "x de 60 min" à direita. Cada atividade é uma linha:
     - modo leitura: "N min" · pill da etapa colorida · título · selo "sua" (se foi a professora que criou) · caixa `#e5f2f6` "as alunas respondem no caderno" com as perguntas;
     - modo ajuste: checkbox ✓ para incluir ou tirar a etapa desta turma (vale para todas, inclusive as do syllabus; a etapa tirada fica riscada e com opacidade menor) · minutos editáveis · ↑ ↓ para reordenar · × para apagar (só nas atividades dela) · perguntas editáveis.
   - **Adicionar atividade** (só em modo ajuste, caixa `#f5f5f0`):
     - pills de **etapa**: warm-up, listen, learn, practice, mission;
     - nome da atividade + minutos;
     - pergunta para o caderno (opcional);
     - botão "Adicionar ao roteiro".
   - Dois cartões lado a lado: **palavras · vão para o Review** (chips verdes; em ajuste, um textarea separado por vírgula) e **homework · abre quando a aula termina**.
   - Rodapé: linha sobre o formato da turma, "Gerar worksheet para imprimir →" (turmas offline) e "Ver como aluna →".

## Cores das etapas
warm-up `#f2ebe3` · listen `#e5f2f6` · learn `#fdf3d6` · practice `#e8f5dd` · mission `#fde4df`

## Regras
- Formato da turma (digital/papel) é configuração da turma, não do plano.
- Sessões passadas: só leitura.
- O total de minutos só soma as etapas incluídas.

## Dados reais desta subpágina
Mapeie cada item para a fonte que já existe no app. Se não existir, marque **FALTA** no plano e pare; não invente.

- Sessões do projeto da turma (nº, data, título, status)
- Plano do syllabus por sessão: objetivo, atividades (etapa, título, minutos, perguntas), palavras, homework
- Ajustes da professora por turma e sessão (incluir/tirar, minutos, ordem, atividades próprias, perguntas, palavras, homework)
- Status de publicação por sessão
- Links do Syllabus geral e do documento do nível

## Verificação (rodar depois de implementar)
- [ ] Nenhum nome, número ou texto fictício do protótipo aparece (Dave, Priscila, Traditions, SEG 19h etc.).
- [ ] A subpágina abre sem erro com uma professora que tem dados e com uma sem dados (estado vazio).
- [ ] A professora só vê as próprias turmas, alunas e clubes.
- [ ] Publicar faz as perguntas aparecerem no caderno da aluna daquela turma.
- [ ] Tirar uma etapa do syllabus some só desta turma, não das outras.
- [ ] Uma atividade nova aparece com a etapa escolhida e o selo "sua".
- [ ] Sessões passadas não podem ser editadas.
- [ ] O sistema de verificação e transposição de dados que já existe continua rodando e passando como antes.
Shell cwd was reset to /home/user/isr-app
