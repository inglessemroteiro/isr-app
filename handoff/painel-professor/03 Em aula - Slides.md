# Painel do professor › Em aula › Slides

> **Prompt para colar no Claude Code:**
> Leia `00 LEIA PRIMEIRO.md`, depois `gestao/painel-professor/00 Moldura do painel.md`, depois este arquivo inteiro. Implemente só a subpágina **Em aula › Slides** do Painel do professor. Siga as regras de dados reais do 00. Antes de editar, me mostre o plano (mapeamento dos dados reais e o que falta). Espere eu aprovar. Depois de editar, rode a verificação do fim deste arquivo e me mostre o resultado.

**Onde fica:** barra "em aula" → pill "Slides".

## O que é
Os slides de cada aula ficam no Google Slides. A professora cola o link aqui, apresenta para a turma e as alunas veem o mesmo deck no caderno.

## Layout
1. **Aviso** `#e5f2f6` (radius 20px): "Os slides ficam no Google Slides. Cole o link de compartilhamento de cada aula: você apresenta daqui para a turma e as alunas veem o mesmo deck no caderno."
2. **Um cartão por aula** (branco, radius 24px):
   - à esquerda: turma (12px/700 `#6b5749`), título da sessão (18px/800) e meta (12px);
   - à direita: botão coral "▶ Apresentar para a turma" e, se houver link, "Abrir no Google Slides ↗" em `#f2ebe3`;
   - abaixo: campo do link + botão "Salvar link" (ou "Trocar link");
   - erro `#fde4df` se o link não for do Google Slides: "Esse link não é do Google Slides. Use Compartilhar → Copiar link no Google Slides.";
   - sem link: "Sem link ainda. A prévia abaixo é o roteiro do syllabus.";
   - grade de miniaturas 16:9 (`minmax(150px,1fr)`), cada uma com "nº · etapa" e o título. Clicar abre a apresentação naquele slide.

## Regras
- Só aceitar links `docs.google.com/presentation/`.
- O mesmo link aparece no cartão "Class slides" do caderno da aluna.

## Dados reais desta subpágina
Mapeie cada item para a fonte que já existe no app. Se não existir, marque **FALTA** no plano e pare; não invente.

- Sessões das turmas da professora (turma, nº, título, data)
- Link do Google Slides por sessão
- Roteiro do syllabus por sessão (para as miniaturas quando não há link)

## Verificação (rodar depois de implementar)
- [ ] Nenhum nome, número ou texto fictício do protótipo aparece (Dave, Priscila, Traditions, SEG 19h etc.).
- [ ] A subpágina abre sem erro com uma professora que tem dados e com uma sem dados (estado vazio).
- [ ] A professora só vê as próprias turmas, alunas e clubes.
- [ ] Um link inválido mostra o erro e não é salvo.
- [ ] O link salvo aparece no caderno da aluna da mesma sessão.
- [ ] O sistema de verificação e transposição de dados que já existe continua rodando e passando como antes.
Shell cwd was reset to /home/user/isr-app
