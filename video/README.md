# Editor de vídeo · Inglês sem Roteiro

Sistema em que o Claude edita os vídeos da Gabi: corta, coloca legenda, põe texto
animado na tela, dá zoom, entra efeito sonoro e trilha. Ela grava e manda o
vídeo; ele devolve o reel pronto e conta o que fez.

O Claude decide (o que cortar, o que escrever, onde dar zoom, que som entra) e
escreve tudo num **plano** (JSON). Os scripts desta pasta só executam o plano
com o ffmpeg. Assim toda decisão fica visível e fácil de mudar: "tira o zoom do
0:12" é uma linha a menos no plano e um novo render.

## Como usar

1. Uma vez só: `bash video/preparar.sh` (instala ffmpeg e o transcritor).
2. Coloque o vídeo em `video/entrada/` (ou mande pelo Google Drive).
3. Peça no Claude Code: **"edita o vídeo X"**. A skill `editar-video` faz o resto.
4. O resultado sai em `video/saida/<nome>-editado.mp4`.

Para mudar alguma coisa, é só dizer o que ("legenda maior", "sem música",
"corta a parte do começo em que eu me enrolo"). Ele mexe no plano e renderiza de novo.

## O que cada arquivo faz

| Arquivo | Função |
|---|---|
| `preparar.sh` | Instala o que falta e gera a biblioteca de sons. |
| `transcrever.py` | Transcreve o vídeo com o tempo de cada palavra, mede os silêncios e sugere cortes. |
| `editar.js` | Renderiza o plano: cortes, enquadramento, legendas, textos, zoom, efeitos, trilha. |
| `revisar.js` | Tira quadros do vídeo pronto para conferir com os olhos. |
| `biblioteca/gerar-sons.js` | Sintetiza os efeitos sonoros e as trilhas (nada com dono). |
| `biblioteca/sfx.json` · `trilhas.json` | Catálogo: nome, quando usar. |
| `biblioteca/fontes/` | Poppins (licença OFL), a fonte das legendas. |
| `exemplos/plano-exemplo.json` | Um plano completo, comentado. |

Pastas `entrada/`, `trabalho/`, `saida/` ficam fora do git.

## Comandos

```bash
python3 video/transcrever.py video/entrada/aula.mp4            # → video/trabalho/aula/transcricao.txt
node video/editar.js video/trabalho/aula/plano.json --rapido    # prévia rápida, meia resolução
node video/editar.js video/trabalho/aula/plano.json             # render final
node video/revisar.js video/saida/aula-editado.mp4 --plano video/trabalho/aula/plano.json
```

## O plano (`plano.json`)

Todos os tempos são em segundos **do vídeo original** (os mesmos da
transcrição). O renderizador converte para o vídeo cortado. Se você preferir
escrever tempos do vídeo final, coloque `"tempos": "saida"`.

```jsonc
{
  "entrada": "entrada/aula.mp4",          // relativo à pasta video/
  "saida": "saida/aula-editado.mp4",      // opcional
  "formato": "9:16",                      // 9:16 (reel), 4:5, 1:1, 16:9 ou "manter"
  "foco_x": 0.5, "foco_y": 0.5,           // onde recortar quando o formato muda (0 = esquerda/cima, 1 = direita/baixo)

  "cortes": [                             // o que FICA, na ordem. Sem este campo, fica tudo.
    { "ini": 0.8, "fim": 6.4 },
    { "ini": 7.1, "fim": 15.0, "zoom": 1.08 },          // trecho um pouco mais fechado (esconde o corte seco)
    { "ini": 15.0, "fim": 18.0, "velocidade": 1.5 },    // acelera (áudio acompanha)
    { "arquivo": "entrada/b-roll.mp4", "ini": 0, "fim": 3, "mudo": true }   // outro clipe no meio
  ],

  "legendas": {
    "estilo": "palavra",                  // "palavra" (a palavra falada acende), "frase" (frase inteira) ou "nenhum"
    "posicao": "baixo",                   // baixo (padrão), centro, cima
    "tamanho": 0.036,                     // fração da altura do vídeo
    "maiusculas": false,
    "cor": "#ffffff", "cor_destaque": "#fc9082", "cor_contorno": "#000000",
    "frases": [
      { "ini": 0.9, "fim": 2.6, "texto": "Você trava na hora de falar",
        "destaque": ["trava"],            // essas palavras ficam em MAIÚSCULA e coral
        "palavras": [ { "w": "Você", "ini": 0.9, "fim": 1.1 }, … ]   // copie da transcrição; sem isso o tempo é dividido por igual
      }
    ]
  },

  "textos": [                             // texto animado na tela
    { "texto": "3 coisas que *travam* seu inglês",   // *palavra* fica coral
      "ini": 0.8, "fim": 4.0,
      "posicao": "cima",                  // cima, centro, baixo ou { "x": 0.5, "y": 0.3 }
      "estilo": "caixa",                  // caixa (fundo teal, letra creme), limpo (branco com contorno), destaque (coral grande)
      "animacao": "pop",                  // pop, subir, fade, digitar, nenhuma
      "tamanho": 1.0 }
  ],

  "animacoes": [                          // movimento de câmera
    { "tipo": "zoom",       "ini": 3.0, "fim": 5.5, "fator": 1.15, "entrada": 0.25, "saida": 0.25 },
    { "tipo": "punch",      "ini": 7.1, "fim": 9.0, "fator": 1.2 },     // fecha de repente, para ênfase
    { "tipo": "zoom_lento", "ini": 15.0, "fim": 18.0, "fator": 1.1 },   // aproxima devagar o tempo todo
    { "tipo": "tremor",     "ini": 12.0, "fim": 12.5, "forca": 1 }      // chacoalha (impacto, "erro")
  ],

  "efeitos_sonoros": [                    // nomes em biblioteca/sfx.json
    { "nome": "pop",   "em": 0.8, "volume": 0.5 },
    { "nome": "subir", "em": 12.0, "alinhar": "fim" },   // termina exatamente no instante 'em'
    { "nome": "boom",  "em": 12.0 }
  ],

  "trilha": {                             // ou null, quando a música vai ser colocada no Instagram
    "clima": "leve",                      // calma, leve, energia, emocao (biblioteca/trilhas.json) — ou "arquivo": "minha.mp3"
    "volume": 0.3,                        // 0.2 discreta · 0.3 padrão · 0.5 presente
    "ducking": true,                      // abaixa sozinha quando a voz entra
    "fade_inicio": 1.0, "fade_fim": 1.5,
    "ini": 0, "fim": null                 // opcional: só num trecho
  },

  "audio": { "normalizar": true, "remover_ruido": false, "volume": 1.0 }
}
```

Legendas e textos que caem inteiros num trecho cortado somem (o render avisa).
Os que atravessam um corte são partidos e continuam do outro lado.

## Limites conhecidos

- **Emoji** nos textos e legendas sai como quadrado: a fonte não tem. Use palavras.
- As trilhas geradas são simples, de propósito. Para um reel de feed, o melhor
  ainda é escolher a música no próprio Instagram (áudio em alta) e deixar
  `"trilha": null`. Músicas próprias entram em `biblioteca/trilhas/` + uma linha no `trilhas.json`.
- O transcritor baixa o modelo de `huggingface.co` na primeira vez. Em sessão
  na nuvem, esse endereço precisa estar liberado na rede do ambiente; no
  computador não há restrição.
- Um vídeo só por plano (mais clipes entram como `cortes[].arquivo`).
