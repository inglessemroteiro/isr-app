# Tokens e padrões (valem para todas as telas)

## Design Tokens
- `#164951` texto / fundo escuro · `#1d5a63` texto de apoio · `#348a8e` links · `#fc9082` destaque/CTA no escuro · `#d9675a` sombra coral
- `#9ec970` positivo · `#e8f5dd` tint verde · `#e5f2f6` tint azul · `#fdf3d6` atenção · `#fde4df` tint coral
- `#6b5749` rótulos · `#e2c8b5` borda de input · `#f2ebe3` fundo da página · `#f5f5f0` fundo de campos · `#fff` cartões
- Fonte Inter. Títulos 800 com `letter-spacing` de −0.035 a −0.045em; texto 14–16px com entrelinha 1.5; rótulos 11–12px/700 em minúsculas
- Raios: 12–16px pequenos · 20–28px cartões · 32–40px heroes · 999px botões e pills

## Interactions & Behavior
- Botões principais: hover sobe 3px (`translateY(-3px)`), clique afunda (`translateY(2px)`). Sombra sólida embaixo: `0 4px 0 #0e3339` nos escuros e `0 4px 0 #d9675a` nos corais. Transição de 150–200ms, ease-out.
- Toasts curtos confirmam as ações que dão miles ("Homework sent · +15 miles").
- O seletor EN/PT troca os rótulos da interface. O conteúdo das aulas continua em inglês.
- Respeitar `prefers-reduced-motion`.

## Padrões de layout
- Fundo da página `#f2ebe3`. Cartões brancos com `radius 24px` e `padding 20–24px`.
- Linhas de cartões: `display:flex; flex-wrap:wrap; gap:20–22px`; cada cartão `flex:1 1 280–320px; min-width:0`.
- Pills e botões: `radius 999px`. Ativo = fundo `#164951` e texto branco.
- Título de cartão: 16px/800. Rótulo de seção: 12–13px/700 `#6b5749`, em minúsculas.
Shell cwd was reset to /home/user/isr-app
