# Painel do professor › Clubes

> **Prompt para colar no Claude Code:**
> Leia `00 LEIA PRIMEIRO.md`, depois `gestao/painel-professor/00 Moldura do painel.md`, depois este arquivo inteiro. Implemente só a subpágina **Clubes** do Painel do professor. Siga as regras de dados reais do 00. Antes de editar, me mostre o plano (mapeamento dos dados reais e o que falta). Espere eu aprovar. Depois de editar, rode a verificação do fim deste arquivo e me mostre o resultado.

**Onde fica:** aba "Clubes".

## O que é
A professora vê os clubes que oferece, edita cada um e oferece novos. O que ela publica aparece no catálogo de clubes da aluna (ver `aluna/04 Clubs.md`).

## Layout
1. **Cabeçalho:** "Seus clubes" (22px/800) + botão "+ Oferecer novo clube" à direita (fundo `#164951`, sombra `0 3px 0 #0e3339`).
2. **Grade de cartões** (`repeat(auto-fill,minmax(260px,1fr))`, gap 14px). **Todos os clubes usam o mesmo cartão**, seja um, sejam vários:
   - pill de status (publicado / rascunho) + "online · A2+" à direita (12px/700 `#6b5749`);
   - nome 17px/800;
   - descrição com no máximo 2 linhas;
   - "quando" (dia, hora, datas);
   - "inscritas x/y" com barra de 8px `#9ec970`.
   O cartão selecionado tem borda de 2px `#164951`.
3. **Painel do clube selecionado** (cartão branco abaixo da grade):
   - nome 22px/800 + pill de status;
   - linha "quando · onde";
   - ações à direita: "Fazer chamada · próximo encontro" (publicado) · "Publicar para as alunas" (rascunho) · "Apagar rascunho" (só rascunho; dá para desfazer) · "Despublicar" (só sem inscritas);
   - abas sublinhadas: Página do clube · Inscritas · Encontros · Material.
4. **Aba Página do clube, modo leitura:** lista de fatos com rótulo à esquerda (110px) e valor à direita: descrição, **nível**, quando, formato, local/link, vagas, bio. Se faltar algo, aparece a caixa `#fdf3d6` "Falta para publicar". Embaixo, o botão "Editar clube".
5. **Modo edição:**
   - nome + vagas;
   - descrição em inglês (textarea, com a nota "Aparece no cartão do clube no app das alunas");
   - **nível** em pills: Todos os níveis / A partir do A1 / A2 / B1 / B2;
   - formato (online | presencial) com local, endereço ou link;
   - os 4 encontros (data, hora, tema);
   - bio do professor.
   Ao lado, uma **prévia** de como o cartão vai aparecer para a aluna, em inglês.
6. **Regras:**
   - cada clube tem 4 encontros no ciclo;
   - não mostrar "dentro do fixo" nem "extra/cobertura" no cartão.

## Dados reais desta tela
Mapeie cada item para a fonte que já existe no app. Se não existir, marque **FALTA** no plano e pare; não invente.

- Clubes da professora: nome, descrição, nível, status, formato, local/link, vagas, inscritas, datas, horários, temas, bio
- Lista de inscritas por clube
- Material anexado por clube (título, link, tipo)
- Onde salvar o rascunho e a publicação (precisa chegar ao catálogo da aluna)

## Verificação (rodar depois de implementar)
- [ ] Nenhum nome, número ou texto fictício do protótipo aparece na tela (Marianne, Tutor Dave, Priscila, Book Club, 1.240 miles etc.).
- [ ] A tela abre sem erro com uma usuária real que tenha dados e com uma sem dados (estado vazio).
- [ ] Uma professora com 1 clube e uma com 3 clubes veem cartões idênticos, só que em quantidade diferente.
- [ ] Editar o nível ou a descrição e salvar muda o cartão no catálogo da aluna.
- [ ] Publicar um clube novo faz ele aparecer no catálogo da aluna com a tag "New".
- [ ] Apagar só aparece em rascunho.
- [ ] O sistema de verificação e transposição de dados que já existe continua rodando e passando como antes.
Shell cwd was reset to /home/user/isr-app
