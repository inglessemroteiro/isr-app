# Painel do professor › Página da turma › Materiais

> **Prompt para colar no Claude Code:**
> Leia `00 LEIA PRIMEIRO.md`, depois `gestao/painel-professor/00 Moldura do painel.md`, depois este arquivo inteiro. Implemente só a subpágina **Página da turma › Materiais** do Painel do professor. Siga as regras de dados reais do 00. Antes de editar, me mostre o plano (mapeamento dos dados reais e o que falta). Espere eu aprovar. Depois de editar, rode a verificação do fim deste arquivo e me mostre o resultado.

**Onde fica:** Página da turma → aba "Materiais".

## Layout
1. **Materiais da turma** (cartão branco):
   - título + "Editar links" à direita;
   - lista: bolinha de status (verde com link, cinza sem link) · nome do material (15px/700) · "Abrir →" ou "sem link";
   - em edição, cada linha ganha um campo "Colar link…" e aparece o botão "Salvar links".
2. **Apoio pedagógico** (cartão branco):
   - select do tipo de pedido + campo "Qual aula ou material" + botão teal "Solicitar";
   - lista dos pedidos com o status ("enviado", "em andamento", "pronto").

## Dados reais desta subpágina
Mapeie cada item para a fonte que já existe no app. Se não existir, marque **FALTA** no plano e pare; não invente.

- Materiais da turma (nome, link)
- Tipos de pedido de apoio pedagógico
- Pedidos da professora e status

## Verificação (rodar depois de implementar)
- [ ] Nenhum nome, número ou texto fictício do protótipo aparece (Dave, Priscila, Traditions, SEG 19h etc.).
- [ ] A subpágina abre sem erro com uma professora que tem dados e com uma sem dados (estado vazio).
- [ ] A professora só vê as próprias turmas, alunas e clubes.
- [ ] Um link salvo abre o material certo.
- [ ] O pedido enviado aparece para a coordenação.
- [ ] O sistema de verificação e transposição de dados que já existe continua rodando e passando como antes.
Shell cwd was reset to /home/user/isr-app
