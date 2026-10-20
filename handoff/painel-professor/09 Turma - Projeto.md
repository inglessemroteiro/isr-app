# Painel do professor › Página da turma › Projeto

> **Prompt para colar no Claude Code:**
> Leia `00 LEIA PRIMEIRO.md`, depois `gestao/painel-professor/00 Moldura do painel.md`, depois este arquivo inteiro. Implemente só a subpágina **Página da turma › Projeto** do Painel do professor. Siga as regras de dados reais do 00. Antes de editar, me mostre o plano (mapeamento dos dados reais e o que falta). Espere eu aprovar. Depois de editar, rode a verificação do fim deste arquivo e me mostre o resultado.

**Onde fica:** Página da turma → aba "Projeto".

## Layout
Cartão branco:
- título "Projeto <nome> · entregas" + "x/y" à direita;
- barra de 10px (`#9ec970` sobre `#f2ebe3`);
- "Faltam: <nomes>" (13px `#1d5a63`). Se todas entregaram: "Todas entregaram."

## Dados reais desta subpágina
Mapeie cada item para a fonte que já existe no app. Se não existir, marque **FALTA** no plano e pare; não invente.

- Projeto do ciclo da turma
- Entregas por aluna (entregou / falta)

## Verificação (rodar depois de implementar)
- [ ] Nenhum nome, número ou texto fictício do protótipo aparece (Dave, Priscila, Traditions, SEG 19h etc.).
- [ ] A subpágina abre sem erro com uma professora que tem dados e com uma sem dados (estado vazio).
- [ ] A professora só vê as próprias turmas, alunas e clubes.
- [ ] O número bate com o cartão "Projeto · entregas" do Hoje.
- [ ] O sistema de verificação e transposição de dados que já existe continua rodando e passando como antes.
Shell cwd was reset to /home/user/isr-app
