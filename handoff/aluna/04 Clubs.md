# Clubs

> **Prompt para colar no Claude Code:**
> Leia `00 LEIA PRIMEIRO.md` e depois este arquivo inteiro. Implemente só a tela **Clubs** do app da aluna. Siga as regras de dados reais do 00. Antes de editar, me mostre o plano (mapeamento dos dados reais e o que falta). Espere eu aprovar. Depois de editar, rode a verificação do fim deste arquivo e me mostre o resultado.

## Layout
### Clubs
Subabas "My clubs" | "All clubs".
- **My clubs:**
  - pills para escolher o clube;
  - cartão escuro com emoji, nome, "with professor · horário", os 4 encontros (data, tema, tag) e o CTA "Join live meeting";
  - cartão "reference material" (só aparece se o professor anexou algo);
  - fórum com posts, respostas e **respostas em áudio** (gravar → Stop & send; player com barra de progresso).
- **All clubs:**
  - aviso "Each club has 4 live meetings per cycle. Your plan includes 2 clubs… 3rd club €50";
  - grade de cartões (`minmax(250px,1fr)`). Cada cartão tem emoji, pill de **nível** (`#e8f5dd`: All levels / A1 and up / A2 and up / B1 and up / B2 and up), pill "New" coral quando o clube é novo, nome, descrição, professor, horário, membros e local, o link "See dates and details →" e o botão Join.
- **Detalhe do clube:**
  - hero escuro (`radius 40px`) com pills de formato e nível, nome em 34–56px, descrição, botão Join e preço/vagas, fatos em mini-cartões e a foto do professor à direita;
  - abaixo, duas colunas: "4 meetings" (dia em bloco + tema) e "about your teacher" | preço com barra de vagas e Join, depois "where we meet" (endereço + Google Maps, ou "Online, on Google Meet").
- **Regras:**
  - o que o professor publica ou edita na gestão (nome, descrição, nível, datas, temas, vagas, local, bio) aparece aqui;
  - clubes publicados entram no catálogo com a tag "New";
  - entrar num 3º clube passa pelo pagamento extra.

## Dados reais desta tela
Mapeie cada item para a fonte que já existe no app. Se não existir, marque **FALTA** no plano e pare; não invente.

- Catálogo de clubes publicados: nome, descrição, nível, professor, horário, 4 encontros, vagas, inscritas, formato, local/link, bio, se é novo
- Clubes da aluna e limite do plano (2 incluídos; 3º pago)
- Fórum do clube: posts, respostas, áudios
- Material do clube

## Verificação (rodar depois de implementar)
- [ ] Nenhum nome, número ou texto fictício do protótipo aparece na tela (Marianne, Tutor Dave, Priscila, Book Club, 1.240 miles etc.).
- [ ] A tela abre sem erro com uma usuária real que tenha dados e com uma sem dados (estado vazio).
- [ ] Um clube editado pelo professor na gestão aparece atualizado aqui.
- [ ] Um clube publicado recentemente aparece com "New".
- [ ] Tentar entrar num 3º clube leva ao pagamento.
- [ ] O sistema de verificação e transposição de dados que já existe continua rodando e passando como antes.
