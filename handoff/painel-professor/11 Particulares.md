# Painel do professor › Particulares

> **Prompt para colar no Claude Code:**
> Leia `00 LEIA PRIMEIRO.md`, depois `gestao/painel-professor/00 Moldura do painel.md`, depois este arquivo inteiro. Implemente só a subpágina **Particulares** do Painel do professor. Siga as regras de dados reais do 00. Antes de editar, me mostre o plano (mapeamento dos dados reais e o que falta). Espere eu aprovar. Depois de editar, rode a verificação do fim deste arquivo e me mostre o resultado.

**Onde fica:** aba "Particulares".

## O que é
Aulas particulares seguem o **mesmo syllabus do nível** da aluna, com atenção 1:1. A professora pode pular e reordenar sessões livremente e ajustar tudo na aula. Para alunas que também fazem grupo, a particular serve para revisar e aprofundar o que viram no grupo.

## Layout
1. **Escolha da aluna:** pills com as alunas particulares da professora.
2. **Cartão da aluna:**
   - nome (18px/800) + meta (nível, frequência) + "Abrir perfil →";
   - caixa `#fdf3d6` "objetivo da aluna" (editável no modo ajuste);
   - se a aluna também faz grupo, caixa `#e5f2f6` com "Também faz grupo na <turma>. Esta semana o grupo viu Session N: use para revisar e aprofundar."
3. **Faixa de sessões:** igual à do Plano das aulas, mas cada cartão tem controles ← → para mudar a ordem e "pular"/"incluir". As sessões puladas ficam riscadas.
4. **Área da sessão:** igual ao Plano das aulas (ver `07`), com estas diferenças:
   - a etapa extra **review** aparece nas pills de "adicionar atividade";
   - o texto da caixa de perguntas diz "a aluna responde no caderno";
   - no fim, o cartão "**suas notas sobre a aluna**" com "só a equipe vê" (textarea `#f5f5f0`).
5. **Materiais e apoio pedagógico:** os mesmos dois cartões da aba Materiais (ver `10`).

## Dados reais desta subpágina
Mapeie cada item para a fonte que já existe no app. Se não existir, marque **FALTA** no plano e pare; não invente.

- Alunas particulares da professora: nome, nível, frequência, objetivo, se também faz grupo (e qual turma/sessão atual)
- Ordem e sessões puladas por aluna
- Plano por sessão (syllabus) + ajustes por aluna
- Notas da professora por aluna
- Materiais e pedidos de apoio

## Verificação (rodar depois de implementar)
- [ ] Nenhum nome, número ou texto fictício do protótipo aparece (Dave, Priscila, Traditions, SEG 19h etc.).
- [ ] A subpágina abre sem erro com uma professora que tem dados e com uma sem dados (estado vazio).
- [ ] A professora só vê as próprias turmas, alunas e clubes.
- [ ] Pular ou reordenar uma sessão vale só para essa aluna.
- [ ] As notas não aparecem no app da aluna.
- [ ] Para uma aluna híbrida, a caixa azul mostra a sessão real do grupo dela.
- [ ] O sistema de verificação e transposição de dados que já existe continua rodando e passando como antes.
Shell cwd was reset to /home/user/isr-app
