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
