# Lógica do sistema (vale para tudo)

> **Prompt para colar no Claude Code (uma vez, antes das telas):**
> Leia `00 LEIA PRIMEIRO.md` e este arquivo. Compare com o que o app já tem: para cada entidade, papel, regra e evento, diga se **já existe**, **existe diferente** ou **FALTA**. Não edite nada. Me mostre a tabela. Depois, cada tela só usa o que estiver aqui.

Os arquivos de tela descrevem o **design**. Este arquivo descreve a **lógica**: quem pode o quê, de onde vem cada dado, as regras de negócio e o que uma tela muda na outra. Se uma tela e este arquivo discordarem, **este arquivo vale** e o Claude Code deve avisar.

---

## 1. Papéis e permissões

| Papel | Quem (hoje) | Vê |
|---|---|---|
| Coordenação | Gabi | tudo |
| Comercial | Carla | central, alunas, matrícula, turmas (sem plano/chamadas/financeiro), renovação e vagas, agenda |
| Admin/Financeiro | Érika | central, alunas, turmas (sem plano), chamadas, financeiro, folha, Miles & loja, agenda |
| Professora | Dave, Erika (prof.), Carla (prof.)… | só o Painel do professor, com as próprias turmas, particulares e clubes |
| Aluna | — | só o app da aluna, com os próprios dados |

**Abas da Página da turma por papel:**

| Aba | Gabi | Carla | Érika | Professora |
|---|---|---|---|---|
| Visão geral | ✓ (edita) | ✓ | ✓ | ✓ (leitura) |
| Alunas | ✓ (edita) | ✓ | ✓ | ✓ (leitura) |
| Plano das aulas | ✓ | — | — | ✓ (edita a própria turma) |
| Chamadas | ✓ | — | ✓ | ✓ (a própria turma) |
| Projeto | ✓ | — | ✓ | ✓ |
| Materiais | ✓ | — | ✓ | ✓ |
| Renovação e vagas | ✓ | ✓ | ✓ | — |
| Financeiro | ✓ | — | — | — |

- O seletor "vendo como" só existe para a coordenação e não muda o que fica salvo como autor.
- Uma substituta tem **acesso temporário** à turma (link, chamada, materiais) só no dia da aula que cobre.

---

## 2. Entidades (o que o banco precisa ter)

Os nomes são sugestão; use os que já existem no app.

- **Aluna**: nome, foto, nível, formato (grupo / particular / híbrida), status, turma, objetivo (particular), saldo de miles
- **Professora**: nome, foto, bio, papel
- **Turma**: nome, nível, ciclo, horário, professora, projeto, capacidade, formato durante a aula (digital / papel), alunas
- **Sessão**: turma ou particular, nº, data, título, status (a vir / ao vivo / dada), link dos slides
- **Plano da sessão**:
  - base do syllabus: objetivo, atividades (etapa, título, min, perguntas), palavras, homework;
  - **ajustes por turma** (ou por aluna, no particular): incluir/tirar, minutos, ordem, atividades próprias, perguntas, palavras, homework;
  - status: rascunho / publicado.
- **Resposta no caderno**: aluna, sessão, tarefa, texto/áudio/foto, atualizada em, comentários da professora
- **Homework**: aluna, sessão, texto, status (aberto / entregue / atrasado), prazo
- **Chamada**: sessão, status por aluna (P/A/F/J), tópico, data real, salva por, salva em, conta na folha (sim/não)
- **Substituição**: sessão, quem pediu, motivo, observação, quem cobre, status
- **Clube**: nome, descrição (EN), **nível** (all/A1/A2/B1/B2), professora, formato, local/endereço ou link, horário, duração, vagas, 4 encontros (data + tema), bio, status (rascunho / publicado), inscritas, lista de espera, material, é novo
- **Review Vault**: aluna, palavra/frase, significado, exemplo, origem (aula / própria), progresso
- **Miles**:
  - extrato: aluna, valor (+/−), motivo, autor (sistema / escola / aluna), data, id do resgate (quando for devolução);
  - recompensa: emoji, nome, custo, estoque, visível;
  - resgate: aluna, recompensa, data, status (para entregar / entregue / cancelado).
- **Anúncio (Swap & sell)**: aluna, tipo, título, descrição, preço, cidade, oculto, apagado, editado pela escola
- **Perfil social**: scraps, depoimentos (pendente / aceito), atributos votados

**O saldo de miles é sempre a soma do extrato.** Não guarde o saldo como número solto, que pode desencontrar do extrato.

---

## 3. Regras de negócio

**Aula e caderno**
- O plano vem do syllabus. A professora confere e **publica**. Só o que foi publicado aparece no caderno.
- As atividades no caderno abrem quando a aula **começa** e fecham quando ela **termina**.
- O homework abre quando a aula termina.
- Tirar uma etapa vale só para aquela turma ou aluna; o syllabus base não muda.
- Sessões passadas ficam só leitura para a professora.
- Se o homework anterior não foi entregue, aparece um aviso no topo do caderno. Ele não impede a aluna de usar o caderno.

**Particular**
- Usa o mesmo syllabus do nível. A professora pode pular e reordenar sessões **por aluna**.
- Aluna híbrida: a particular revisa e aprofunda a sessão atual do grupo dela.
- As notas da professora sobre a aluna: só a equipe vê.

**Chamada e folha**
- O tópico da lição é obrigatório para salvar.
- Só a chamada **salva** conta na folha de professores.
- Editar uma chamada salva tira a aula da folha até salvar de novo.
- A aula dada pela substituta conta na folha **da substituta**.
- 2 faltas seguidas geram alerta (aba Alunas + Fila pedagógica).
- A presença mínima é de 75%; abaixo disso a aluna vê um aviso em Account.

**Substituição**
- A professora pede pela aba Hoje. A coordenação atribui quem cobre.
- Com menos de 24h para a aula, a coordenação também recebe um aviso por WhatsApp.

**Clubes**
- Cada clube tem 4 encontros por ciclo.
- O plano da aluna inclui 2 clubes; o 3º custa €50 e passa pelo pagamento.
- 2 faltas seguidas tiram a aluna do clube; a vaga vai para a 1ª da lista de espera.
- Só aparece no catálogo da aluna o clube **publicado**. Um clube recém-publicado ganha a tag "New".
- Só rascunho pode ser apagado. Clube publicado só pode ser despublicado, e só se não tiver inscritas.
- Para publicar, precisa ter: nome, descrição, nível, horário, as 4 datas, vagas e local ou link.

**Miles**
| Ação | Miles |
|---|---|
| Entrar na aula ao vivo | +25 |
| Mandar o homework | +15 |
| Terminar o Review do dia (1× por dia) | +15 |
| Adicionar palavras ao Review Vault | +20 |
| Responder no fórum do clube com áudio | +5 |
| Aceitar um depoimento no perfil (1× por depoimento) | +15 |

- **Resgate:** desconta na hora em que a aluna toca em Redeem. Só funciona se o saldo for suficiente e houver estoque; o estoque cai 1.
- **Cancelar resgate (escola):** cria uma linha de devolução no extrato, devolve o estoque e libera a recompensa de novo.
- **Ajuste manual (escola):** o motivo é obrigatório e a aluna vê o texto dele. Não é possível tirar mais do que o saldo.
- Só Gabi e Érika mexem em miles, recompensas e anúncios.

**Swap & sell**
- A aluna cria, edita e marca como vendido os próprios anúncios.
- A escola pode editar, ocultar (dá para desfazer) ou apagar qualquer anúncio.

---

## 4. Eventos entre os apps

Tudo que uma tela muda e outra precisa mostrar. No protótipo isso é simulado com `localStorage`; no app real tem que passar pelo backend e pelo **sistema de verificação e transposição de dados que já existe**.

| Quando… | Onde acontece | Muda em… |
|---|---|---|
| Professora publica o plano | Painel › Plano | Caderno da aluna (objetivo, tarefas, palavras, homework) |
| Professora começa/encerra a aula | Painel › Hoje / Em aula | Caderno abre/fecha as atividades; homework abre |
| Aluna escreve no caderno | App › Notebook | Painel › Respostas ao vivo |
| Professora comenta uma resposta | Painel › Respostas ao vivo | Caderno da aluna |
| Professora salva o link dos slides | Painel › Slides | Caderno ("Class slides") |
| Professora salva a chamada | Painel › Chamadas | Folha de professores · contagem do Hoje · presença da aluna (Progress, Account) · alertas |
| Professora pede substituição | Painel › Hoje | Coordenação (+ WhatsApp se < 24h) |
| Coordenação atribui substituta | Página da turma | Painel da substituta (acesso temporário) · folha |
| Professora edita/publica um clube | Painel › Clubes | App › Clubs (catálogo e detalhe) |
| Professora anexa material ao clube | Painel › Clubes | App › Clubs ("reference material") |
| Aluna entra/sai de um clube | App › Clubs | Painel › Clubes › Inscritas |
| Aluna resgata uma recompensa | App › Shop | Miles & loja › Resgates para entregar · extrato |
| Escola cancela um resgate | Miles & loja | App › Shop (miles voltam + aviso) |
| Escola ajusta miles | Miles & loja | App (saldo + notificação com o motivo) |
| Escola cria/edita/oculta uma recompensa | Miles & loja | App › Shop › School rewards |
| Escola edita/oculta/apaga um anúncio | Miles & loja | App › Shop › Swap & sell |
| Aluna cria um anúncio | App › Shop | Miles & loja › Swap & sell |
| Ações que dão miles | App (vários) | Extrato · saldo · Miles & loja › Saldos |

---

## 5. Verificação geral (rodar no fim de cada tela)
- [ ] Cada dado mostrado vem de uma entidade da seção 2, pelo mesmo caminho que as telas atuais usam.
- [ ] As permissões da seção 1 continuam valendo (teste com uma professora e com a Carla).
- [ ] Os eventos da seção 4 que tocam esta tela funcionam nos dois lados.
- [ ] O saldo de miles é igual à soma do extrato.
- [ ] O sistema de verificação e transposição que já existe continua passando.
