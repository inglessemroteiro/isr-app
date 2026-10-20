# Shop (miles)

> **Prompt para colar no Claude Code:**
> Leia `00 LEIA PRIMEIRO.md` e depois este arquivo inteiro. Implemente só a tela **Shop (miles)** do app da aluna. Siga as regras de dados reais do 00. Antes de editar, me mostre o plano (mapeamento dos dados reais e o que falta). Espere eu aprovar. Depois de editar, rode a verificação do fim deste arquivo e me mostre o resultado.

## Layout
### Shop (miles)
Subabas "School rewards" | "Swap & sell" + pill escura com o saldo à direita.
- **School rewards:** grade de cartões com emoji, nome, custo e botão Redeem (fica desabilitado sem saldo; depois do resgate mostra "Redeemed"). Embaixo, como ganhar miles.
  - **Ao resgatar, os miles saem do saldo na hora.** Se a escola cancelar o resgate na gestão, os miles voltam e a aluna recebe um aviso.
  - Só aparecem as recompensas marcadas como visíveis na gestão.
- **Swap & sell:** filtros (All, Swap, Sell, Miles, Services, My listings), botão "+ New listing" e grade de anúncios com paginação. Nos anúncios das outras, o botão é "Message"; nos próprios, "Edit" e "Mark sold". Anúncios ocultados ou apagados pela escola não aparecem.
- **Ajuste manual de miles pela escola:** a aluna recebe uma notificação com o motivo ("The school added 50 miles · Evento da escola").

## Dados reais desta tela
Mapeie cada item para a fonte que já existe no app. Se não existir, marque **FALTA** no plano e pare; não invente.

- Saldo de miles
- Recompensas visíveis (definidas na gestão)
- Resgates da aluna
- Anúncios de Swap & sell não ocultos/apagados
- Notificações de ajuste ou devolução de miles

## Verificação (rodar depois de implementar)
- [ ] Nenhum nome, número ou texto fictício do protótipo aparece na tela (Marianne, Tutor Dave, Priscila, Book Club, 1.240 miles etc.).
- [ ] A tela abre sem erro com uma usuária real que tenha dados e com uma sem dados (estado vazio).
- [ ] Resgatar desconta os miles na hora e o item aparece em "Resgates para entregar" na gestão.
- [ ] Um ajuste feito na gestão muda o saldo e gera uma notificação com o motivo.
- [ ] Um anúncio oculto na gestão não aparece aqui.
- [ ] O sistema de verificação e transposição de dados que já existe continua rodando e passando como antes.
