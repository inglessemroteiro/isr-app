# Inglês sem Roteiro — Design System

**Versão:** 1.0  
**Última atualização:** Junho 2026

---

## O que é este Design System?

Este é o **Kit de Design Oficial** da Inglês sem Roteiro — um conjunto completo e reutilizável de **cores, tipografia, componentes, espaçamento e padrões** para aplicar em:

- 🎨 Posts Instagram e materiais visuais
- 📱 App (web e mobile)
- 🌐 Website
- 📄 Documentos e materiais de apoio
- 🎯 Qualquer superfície visual da marca

Use este sistema para manter **consistência visual** em tudo que você criar.

---

## Estrutura

```
/tokens           → Variáveis CSS (cores, tipografia, spacing)
/components       → Componentes reutilizáveis
/assets           → Logos, ícones, imagens
/guidelines       → Cards de referência visual
styles.css        → Ponto de entrada (importa todos os tokens)
```

---

## TOKENS FUNDAMENTAIS

### Cores

**Primária (Teal)** — A cor principal da marca  
`--color-primary-500: #348a8e` | `--color-primary-900: #164951`

**Texto** — Variações de dark teal  
`--color-text-dark: #164951` | `--color-text-light: #229090`

**Botões** — Coral/Salmon e backgrounds  
`--color-button-primary: #fc9082` (Coral) | `--color-button-secondary: #f2ebe3` (Cream)

**Background Padrão**  
`--color-bg-default: #f5f5f0`

**Secundária (Verde Claro)** — Accent, positivo  
`--color-secondary-500: #9ec970`

**Terciária (Marrom)** — Grounding, confiança  
`--color-tertiary-500: #8a7465`

**Neutros** — Grays para texto e backgrounds  
`--color-neutral-900` a `--color-neutral-0`

**Semânticas** — Success, warning, error, info

👉 **Ver cards visuais:** `guidelines/colors-primary.html`, `guidelines/colors-secondary.html`, `guidelines/colors-custom.html`

---

### Tipografia

### Tipografia

**Fonte Principal:** Inter (ou system fonts como fallback)  
**Escala:** Base 16px com razão 1.25 (Major Third)

**Tamanhos:**
- `--font-size-xs: 12px`
- `--font-size-base: 16px`
- `--font-size-lg: 20px`
- `--font-size-xl: 25px`
- `--font-size-2xl: 31px`
- ... até `--font-size-5xl: 61px`

**Estilos semânticos:**
- Display (grandes títulos)
- Heading (h1–h6)
- Body (textos corpo)
- Caption (labels pequenos)

👉 **Ver cards visuais:** `guidelines/typography-display.html`, `guidelines/typography-body.html`

---

### Spacing

**Escala:** 4px base, Fibonacci-inspired

- `--spacing-4: 16px`
- `--spacing-6: 24px`
- `--spacing-8: 32px`
- `--spacing-12: 48px`

Usada para margins, paddings, gaps entre elementos.

---

### Componentes

Componentes reutilizáveis (Button, Card, Input, etc.) estão em `/components`.

Cada componente tem:
- `.jsx` — O código React
- `.d.ts` — Type definition
- `.prompt.md` — Documentação de uso

---

## CONTENT FUNDAMENTALS

### Tom e Voz

**Inglês sem Roteiro** é uma marca **acessível, motivadora e humana**.

- **Linguagem:** Português claro, sem jargão excessivo
- **Tom:** Informal mas profissional, amigável, empoderador
- **Casing:** Minúsculas (exceto nomes próprios e inícios de frases)
- **Emoji:** Usados com moderação, para alegria e humanização (não em exagero)
- **Abordagem:** "Você consegue!" em vez de "Todos conseguem"
- **Exemplo:** "Seu espaço na ISR" (possessivo, personalizado)

### Padrões Comuns

- Frases curtas e impactantes
- Foco em ação e progresso
- Comunidade e inclusão
- Sem culpa, sem pressão

---

## VISUAL FOUNDATIONS

### Paleta de Cores

A marca usa **3 cores principais + neutros**:

1. **Teal (#348a8e)** — Confiança, calma, profissionalismo
2. **Verde Claro (#9ec970)** — Esperança, crescimento, positividade
3. **Marrom (#8a7465)** — Estabilidade, terra, acolhimento

**Vibes:**
- Moderna mas acessível
- Quente mas profissional
- Inclusiva e motivadora

### Tipografia

- **Sistema font:** Sans-serif nativa (não customizada)
- **Hierarquia clara:** Títulos grandes e pesados, corpo respirado
- **Legibilidade:** Importante — muitos alunos em diferentes dispositivos

### Spacing & Layout

- **Generous padding** — Não quer parecer apertado
- **Breathing room** — Elementos não competem por atenção
- **Grid 12 colunas** — Para web responsivo
- **Gaps:** Sempre `--spacing-*` tokens

### Backgrounds

- Branco ou neutrals leves (`--color-neutral-50`)
- Ocasional accent color (teal ou verde claro) em hero sections
- Sem gradientes desnecessários
- Sem padrões texturizados

### Iconografia

**Estilo:** Linha fina, geométrica, moderna  
**Uso:** Navigation, destaque de features, ações  
**Arquivo:** Icons customizados em `/assets/icons`

### Animação

- **Easing:** `cubic-bezier(0.4, 0, 0.2, 1)` (Material Design)
- **Velocidade:** 150ms–300ms (sem drag)
- **Padrão:** Hover subtle (opacity, color shift), sem bounce excessivo
- **Reduced motion:** Respeitar `prefers-reduced-motion`

### Estados de Interação

**Hover:** Cor levemente mais escura ou opacidade  
**Active/Press:** Cor primária com pequeno shrink (1-2%)  
**Disabled:** Desaturada, `opacity: 0.5`  
**Focus:** Outline colorido, ou inner shadow

### Cards & Containers

- **Rounding:** `--radius-lg` (12px) é o padrão
- **Shadow:** `--shadow-md` para elevação
- **Border:** Raramente — prefer shadows

### Hover States

- Links ficam mais escuros
- Buttons mudam cor ou sombreamento
- Cards ganham sombra maior
- Transição smooth (150–200ms)

---

## ICONOGRAFIA

**Conjunto Atual:**
- Location pin (lugar, encontro)
- Chat/Message (comunidade, conversa)
- Book/Course (aulas, materiais)
- Settings (configurações)
- Check/Success (conclusão, êxito)

**Princípios:**
- Ícones **stroke** (não filled) para leveza
- Peso de linha: 1.5–2px
- Tamanhos: 20px, 24px, 32px
- Always responder a cor de contexto

---

## COMO USAR

### Em HTML/CSS

```html
<link rel="stylesheet" href="path/to/styles.css">

<button style="background: var(--color-primary-500); padding: var(--spacing-4);">
  Clique aqui
</button>
```

### Em Componentes React

```jsx
import './styles.css';

export function MyButton({ children }) {
  return (
    <button style={{
      background: 'var(--color-primary-500)',
      padding: 'var(--spacing-4)',
      borderRadius: 'var(--radius-lg)',
      fontSize: 'var(--font-size-base)',
    }}>
      {children}
    </button>
  );
}
```

### Em Design Tools (Figma, etc.)

Copie os valores hex das cores e tamanhos de fonte do arquivo de tokens.

---

## PRÓXIMAS ETAPAS

- [ ] Componentes prontos (Button, Card, Input, Badge, etc.)
- [ ] UI Kit completo (example screens)
- [ ] Slide templates
- [ ] Exemplos de posts Instagram
- [ ] Guia de aplicação em diferentes contextos

---

## Contato

Para dúvidas sobre o design system, contacte a equipe de design.

---

**Inglês sem Roteiro © 2026**
