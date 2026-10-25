# As suítes de tela

Os `verificar-*.js` da raiz conferem o código: linguagem, jargão, chaves
de armazenamento, cores, redirecionamentos. O que eles não alcançam é a
tela montada — se o nível do clube chega ao cartão da aluna, se o herói
do painel está nas medidas do desenho, se a professora não vê o botão
que é da coordenação. É isso que estas suítes abrem num navegador de
verdade e conferem.

Elas moravam numa pasta temporária fora do repositório e se perderam na
primeira vez que a máquina foi recriada. Agora moram aqui.

## Como rodar

Primeiro sobe o servidor na raiz do projeto:

    node_modules/.bin/http-server -p 8899 -s .

Depois, uma suíte por vez:

    node testes/clube-catalogo.js

O navegador e o React vêm de `testes/preparar.js`, que acha o Chromium
onde ele estiver instalado e serve as cópias locais do React para as
telas `.dc.html` — elas carregam o React de um CDN que o ambiente de
teste não alcança.

Se o React ainda não estiver baixado:

    npm --prefix testes install

## O que cada suíte guarda

- `clube-catalogo.js` — o catálogo "Todos os clubes" da aluna pelo
  arquivo `handoff/aluna/04 Clubs.md`: o nível de cada clube, o emoji,
  as três linhas de informação, e a trava que não deixa publicar clube
  sem nível escolhido.
- `aluna-home.js` — a Home pelo arquivo `handoff/aluna/01 Home.md`: a
  sala que só abre no dia da aula, os quatro itens da semana, e a
  varredura que não deixa voltar nenhum recado de obra às telas da
  aluna.
- `programas.js` — o repositório de programas da escola: a migração
  do que já existia, criar, duplicar e arquivar, e a escolha do
  programa na turma e na aluna particular.
- `pergunta-caderno.js` — a pergunta que vira tarefa no caderno, na
  tela da turma: a barra de espaço, a conta de quantas perguntas vão
  para o caderno, o rótulo em cima de cada campo e a frase chegando
  inteira ao caderno da aluna.
- `loja-conta.js` — a Loja de milhas e a Conta pelos arquivos
  `handoff/aluna/07 Shop.md` e `08 Account.md`: a vitrine em grade, os
  três estados do botão de resgate, o resgate em duas etapas, as
  páginas numeradas das trocas e os três cartões da Conta.
