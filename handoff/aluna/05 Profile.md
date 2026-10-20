# Profile

> **Prompt para colar no Claude Code:**
> Leia `00 LEIA PRIMEIRO.md` e depois este arquivo inteiro. Implemente só a tela **Profile** do app da aluna. Siga as regras de dados reais do 00. Antes de editar, me mostre o plano (mapeamento dos dados reais e o que falta). Espere eu aprovar. Depois de editar, rode a verificação do fim deste arquivo e me mostre o resultado.

## Layout
### Profile
- Faixa `#e5f2f6` explicando a diferença entre 💬 Scrap (recado público imediato) e ⭐ Testimonial (só aparece se a pessoa aceitar).
- **Coluna esquerda:** foto de 120px com o botão "📷 Change", nome, meta, 🎂 aniversário, bio e atributos com estrelas. As colegas votam nos atributos, mas só no perfil de outra pessoa.
- **Coluna direita:** Scraps (campo + Post + lista) e Testimonials. Um depoimento pendente aparece com "Accept · +15 miles" / "Not now". No perfil de uma colega, aparece o campo para escrever um depoimento.

## Dados reais desta tela
Mapeie cada item para a fonte que já existe no app. Se não existir, marque **FALTA** no plano e pare; não invente.

- Perfil: foto, nome, nível, aniversário, bio, atributos
- Scraps e depoimentos (pendentes e aceitos)

## Verificação (rodar depois de implementar)
- [ ] Nenhum nome, número ou texto fictício do protótipo aparece na tela (Marianne, Tutor Dave, Priscila, Book Club, 1.240 miles etc.).
- [ ] A tela abre sem erro com uma usuária real que tenha dados e com uma sem dados (estado vazio).
- [ ] Aceitar um depoimento dá +15 miles uma única vez.
- [ ] Um depoimento pendente só é visto pela dona do perfil.
- [ ] O sistema de verificação e transposição de dados que já existe continua rodando e passando como antes.
