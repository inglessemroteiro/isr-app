# Painel do professor › Página da turma › Alunas

> **Prompt para colar no Claude Code:**
> Leia `00 LEIA PRIMEIRO.md`, depois `gestao/painel-professor/00 Moldura do painel.md`, depois este arquivo inteiro. Implemente só a subpágina **Página da turma › Alunas** do Painel do professor. Siga as regras de dados reais do 00. Antes de editar, me mostre o plano (mapeamento dos dados reais e o que falta). Espere eu aprovar. Depois de editar, rode a verificação do fim deste arquivo e me mostre o resultado.

**Onde fica:** Página da turma → aba "Alunas".

## Layout
Cartão branco "Alunas · x/y":
- uma linha por aluna (`padding 9px 0`, borda inferior `#f2ebe3`);
- o nome clicável abre o perfil da aluna;
- à direita, o alerta em `#a3392c` quando houver (ex.: "2 faltas seguidas", "homework atrasado");
- alunas que saíram aparecem riscadas e em cinza.

Para a professora: **só leitura**. Adicionar e remover alunas ("adicionar aluna sem turma", "remover", "faça a matrícula") é só da coordenação.

Sem alunas: "Nenhuma aluna nesta turma ainda."

## Dados reais desta subpágina
Mapeie cada item para a fonte que já existe no app. Se não existir, marque **FALTA** no plano e pare; não invente.

- Alunas da turma: nome, id do perfil, status (ativa/saiu)
- Alertas por aluna (faltas seguidas, homework pendente)

## Verificação (rodar depois de implementar)
- [ ] Nenhum nome, número ou texto fictício do protótipo aparece (Dave, Priscila, Traditions, SEG 19h etc.).
- [ ] A subpágina abre sem erro com uma professora que tem dados e com uma sem dados (estado vazio).
- [ ] A professora só vê as próprias turmas, alunas e clubes.
- [ ] A professora não vê os botões de adicionar/remover.
- [ ] O alerta de faltas bate com a aba Chamadas.
- [ ] O sistema de verificação e transposição de dados que já existe continua rodando e passando como antes.
