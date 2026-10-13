/* @ds-bundle: {"format":4,"namespace":"InglesSemRoteiroDesignSystem_a7985f","components":[{"name":"Badge","sourcePath":"components/Badge.jsx"},{"name":"Button","sourcePath":"components/Button.jsx"},{"name":"Card","sourcePath":"components/Card.jsx"},{"name":"Input","sourcePath":"components/Input.jsx"},{"name":"AuthorChip","sourcePath":"components/web/AuthorChip.jsx"},{"name":"CTAButton","sourcePath":"components/web/CTAButton.jsx"},{"name":"ChatBubble","sourcePath":"components/web/ChatBubble.jsx"},{"name":"FaqItem","sourcePath":"components/web/FaqItem.jsx"},{"name":"Gable","sourcePath":"components/web/Gable.jsx"},{"name":"Highlight","sourcePath":"components/web/Highlight.jsx"},{"name":"PriceTag","sourcePath":"components/web/PriceTag.jsx"},{"name":"StreetSign","sourcePath":"components/web/StreetSign.jsx"},{"name":"Tag","sourcePath":"components/web/Tag.jsx"},{"name":"WordMarquee","sourcePath":"components/web/WordMarquee.jsx"}],"sourceHashes":{"components/Badge.jsx":"a5b7b4b14525","components/Button.jsx":"7196daf9f863","components/Card.jsx":"630697428f85","components/Input.jsx":"039907c1a933","components/web/AuthorChip.jsx":"15d7cdf69aae","components/web/CTAButton.jsx":"8b20594d3c49","components/web/ChatBubble.jsx":"0e5dfe72c526","components/web/FaqItem.jsx":"56e92315d9ce","components/web/Gable.jsx":"5820e05ee3ea","components/web/Highlight.jsx":"8a7768f8f866","components/web/PriceTag.jsx":"91d958002ac8","components/web/StreetSign.jsx":"7ec9160bc0ed","components/web/Tag.jsx":"30de18cc159e","components/web/WordMarquee.jsx":"739875d44301"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.InglesSemRoteiroDesignSystem_a7985f = window.InglesSemRoteiroDesignSystem_a7985f || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Badge({
  children,
  variant = 'primary',
  ...props
}) {
  const baseStyles = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    padding: `var(--spacing-1) var(--spacing-3)`,
    borderRadius: 'var(--radius-full)'
  };
  const variantStyles = {
    primary: {
      backgroundColor: 'var(--color-primary-100)',
      color: 'var(--color-primary-900)'
    },
    secondary: {
      backgroundColor: 'var(--color-secondary-100)',
      color: 'var(--color-secondary-900)'
    },
    success: {
      backgroundColor: 'var(--color-success-light)',
      color: 'var(--color-success)'
    },
    error: {
      backgroundColor: 'var(--color-error-light)',
      color: 'var(--color-error)'
    }
  };
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      ...baseStyles,
      ...variantStyles[variant]
    }
  }, props), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Badge.jsx", error: String((e && e.message) || e) }); }

// components/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * @dsCard group="Components" viewport="700x300" name="Button" subtitle="Primary, secondary, ghost variants"
 */
function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  ...props
}) {
  const baseStyles = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-sans)',
    fontWeight: 'var(--font-weight-semibold)',
    border: 'none',
    borderRadius: 'var(--radius-lg)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all var(--transition-base)',
    opacity: disabled ? 0.5 : 1
  };
  const sizeStyles = {
    sm: {
      fontSize: 'var(--font-size-sm)',
      padding: `var(--spacing-2) var(--spacing-4)`,
      minHeight: '32px'
    },
    md: {
      fontSize: 'var(--font-size-base)',
      padding: `var(--spacing-3) var(--spacing-6)`,
      minHeight: '40px'
    },
    lg: {
      fontSize: 'var(--font-size-lg)',
      padding: `var(--spacing-4) var(--spacing-8)`,
      minHeight: '48px'
    }
  };
  const variantStyles = {
    primary: {
      backgroundColor: 'var(--color-primary-500)',
      color: 'var(--color-neutral-0)'
    },
    secondary: {
      backgroundColor: 'var(--color-secondary-500)',
      color: 'var(--color-neutral-0)'
    },
    ghost: {
      backgroundColor: 'transparent',
      color: 'var(--color-primary-500)',
      border: '1px solid var(--color-primary-500)'
    }
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    style: {
      ...baseStyles,
      ...sizeStyles[size],
      ...variantStyles[variant]
    },
    disabled: disabled
  }, props), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Button.jsx", error: String((e && e.message) || e) }); }

// components/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Card({
  children,
  variant = 'default',
  ...props
}) {
  const baseStyles = {
    backgroundColor: 'var(--color-bg-primary)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-md)',
    padding: 'var(--spacing-6)',
    transition: 'all var(--transition-base)'
  };
  const variantStyles = {
    default: {
      border: `1px solid var(--color-border-light)`
    },
    elevated: {
      boxShadow: 'var(--shadow-lg)'
    },
    subtle: {
      backgroundColor: 'var(--color-bg-secondary)',
      boxShadow: 'none'
    }
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      ...baseStyles,
      ...variantStyles[variant]
    }
  }, props), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Card.jsx", error: String((e && e.message) || e) }); }

// components/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Input({
  type = 'text',
  placeholder = '',
  size = 'md',
  disabled = false,
  error = false,
  ...props
}) {
  const baseStyles = {
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--font-size-base)',
    border: `1px solid ${error ? 'var(--color-error)' : 'var(--color-border)'}`,
    borderRadius: 'var(--radius-lg)',
    backgroundColor: 'var(--color-bg-primary)',
    color: 'var(--color-text-primary)',
    transition: 'all var(--transition-base)',
    outline: 'none'
  };
  const sizeStyles = {
    sm: {
      padding: `var(--spacing-2) var(--spacing-3)`,
      minHeight: '32px'
    },
    md: {
      padding: `var(--spacing-3) var(--spacing-4)`,
      minHeight: '40px'
    },
    lg: {
      padding: `var(--spacing-4) var(--spacing-6)`,
      minHeight: '48px'
    }
  };
  return /*#__PURE__*/React.createElement("input", _extends({
    type: type,
    placeholder: placeholder,
    disabled: disabled,
    style: {
      ...baseStyles,
      ...sizeStyles[size],
      opacity: disabled ? 0.5 : 1
    }
  }, props));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Input.jsx", error: String((e && e.message) || e) }); }

// components/web/AuthorChip.jsx
try { (() => {
function AuthorChip({
  name = 'Gabi Souza',
  photo,
  badge = 'NL'
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 12,
      background: '#fff',
      borderRadius: 'var(--web-radius-pill)',
      padding: '6px 18px 6px 6px',
      fontFamily: 'var(--font-sans)',
      boxShadow: 'var(--web-shadow-card)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      width: 44,
      height: 44,
      borderRadius: '50%',
      background: photo ? `center/cover url(${photo})` : 'var(--web-teal)',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 800
    }
  }, !photo && name.split(' ').map(s => s[0]).join('').slice(0, 2), badge && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: -6,
      bottom: -4,
      background: 'var(--web-coral)',
      color: 'var(--web-ink)',
      fontSize: 10,
      fontWeight: 800,
      borderRadius: 999,
      padding: '2px 6px',
      border: '2px solid #fff'
    }
  }, badge)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      fontSize: 16,
      color: 'var(--web-ink)'
    }
  }, name));
}
Object.assign(__ds_scope, { AuthorChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/web/AuthorChip.jsx", error: String((e && e.message) || e) }); }

// components/web/CTAButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function CTAButton({
  children,
  tone = 'dark',
  arrow = true,
  href,
  onClick,
  ...rest
}) {
  const [h, setH] = React.useState(false),
    [p, setP] = React.useState(false);
  const onDark = tone === 'onDark';
  const bg = onDark ? 'var(--web-coral)' : 'var(--web-ink)';
  const fg = onDark ? 'var(--web-ink)' : '#fff';
  const shadow = p ? 'none' : h ? onDark ? 'var(--web-shadow-ledge-coral-hover)' : 'var(--web-shadow-ledge-hover)' : onDark ? 'var(--web-shadow-ledge-coral)' : 'var(--web-shadow-ledge)';
  const ty = p ? 4 : h ? -3 : 0;
  const Tag = href ? 'a' : 'button';
  return /*#__PURE__*/React.createElement(Tag, _extends({
    href: href,
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => {
      setH(false);
      setP(false);
    },
    onMouseDown: () => setP(true),
    onMouseUp: () => setP(false),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 14,
      background: bg,
      color: fg,
      border: 'none',
      borderRadius: 'var(--web-radius-pill)',
      padding: '20px 34px',
      fontFamily: 'var(--font-sans)',
      fontWeight: 800,
      fontSize: 19,
      letterSpacing: '-0.01em',
      textDecoration: 'none',
      cursor: 'pointer',
      boxShadow: shadow,
      transform: `translateY(${ty}px)`,
      transition: 'transform 160ms var(--web-ease), box-shadow 160ms var(--web-ease)'
    }
  }, rest), /*#__PURE__*/React.createElement("span", null, children), arrow && /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true"
  }, "\u2192"));
}
Object.assign(__ds_scope, { CTAButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/web/CTAButton.jsx", error: String((e && e.message) || e) }); }

// components/web/ChatBubble.jsx
try { (() => {
function ChatBubble({
  children,
  side = 'left',
  tone
}) {
  const me = side === 'right';
  const t = tone || (me ? 'ink' : 'white');
  const c = {
    ink: ['var(--web-ink)', '#fff'],
    white: ['#fff', 'var(--web-ink)'],
    green: ['var(--web-green)', 'var(--web-ink)'],
    coral: ['var(--web-coral)', 'var(--web-ink)']
  }[t];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: me ? 'flex-end' : 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      background: c[0],
      color: c[1],
      fontFamily: 'var(--font-sans)',
      fontSize: 18,
      fontWeight: 600,
      padding: '12px 18px',
      borderRadius: 22,
      [me ? 'borderBottomRightRadius' : 'borderBottomLeftRadius']: 6,
      maxWidth: '80%',
      boxShadow: 'var(--web-shadow-card)'
    }
  }, children));
}
Object.assign(__ds_scope, { ChatBubble });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/web/ChatBubble.jsx", error: String((e && e.message) || e) }); }

// components/web/FaqItem.jsx
try { (() => {
function FaqItem({
  question,
  children,
  defaultOpen = false
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      borderRadius: 'var(--web-radius-card)',
      padding: '20px 26px',
      fontFamily: 'var(--font-sans)',
      boxShadow: 'var(--web-shadow-card)'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpen(!open),
    style: {
      all: 'unset',
      cursor: 'pointer',
      display: 'flex',
      width: '100%',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 16,
      fontWeight: 800,
      fontSize: 19,
      color: 'var(--web-ink)',
      letterSpacing: '-0.01em'
    }
  }, /*#__PURE__*/React.createElement("span", null, question), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 32,
      height: 32,
      borderRadius: '50%',
      background: open ? 'var(--web-coral)' : 'var(--web-bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 'none',
      transition: 'transform 200ms var(--web-ease)',
      transform: open ? 'rotate(45deg)' : 'none'
    }
  }, "+")), open && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      fontSize: 17,
      lineHeight: 1.5,
      color: 'var(--web-ink-2)'
    }
  }, children));
}
Object.assign(__ds_scope, { FaqItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/web/FaqItem.jsx", error: String((e && e.message) || e) }); }

// components/web/Gable.jsx
try { (() => {
const CLIP = {
  escada: 'polygon(0 100%,0 40%,12% 40%,12% 28%,24% 28%,24% 16%,36% 16%,36% 4%,64% 4%,64% 16%,76% 16%,76% 28%,88% 28%,88% 40%,100% 40%,100% 100%)',
  pescoco: 'polygon(0 100%,0 55%,22% 55%,30% 38%,30% 6%,70% 6%,70% 38%,78% 55%,100% 55%,100% 100%)',
  bico: 'polygon(0 100%,0 45%,50% 0,100% 45%,100% 100%)',
  sino: 'path("M0 200 L0 110 C0 80 30 80 34 52 C38 22 50 8 70 8 C90 8 102 22 106 52 C110 80 140 80 140 110 L140 200 Z")',
  reto: 'polygon(0 100%,0 18%,100% 18%,100% 100%)'
};
function Gable({
  shape = 'bico',
  color = 'var(--web-teal)',
  width = 140,
  height = 200,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      background: color,
      clipPath: CLIP[shape],
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      paddingBottom: 18,
      boxSizing: 'border-box',
      color: '#fff',
      fontFamily: 'var(--font-sans)',
      fontWeight: 700,
      fontSize: 13
    }
  }, children);
}
Object.assign(__ds_scope, { Gable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/web/Gable.jsx", error: String((e && e.message) || e) }); }

// components/web/Highlight.jsx
try { (() => {
function Highlight({
  children
}) {
  return /*#__PURE__*/React.createElement("mark", {
    style: {
      background: 'linear-gradient(transparent 38%, var(--web-highlight) 38%, var(--web-highlight) 92%, transparent 92%)',
      color: 'inherit',
      padding: '0 3px',
      boxDecorationBreak: 'clone',
      WebkitBoxDecorationBreak: 'clone'
    }
  }, children);
}
Object.assign(__ds_scope, { Highlight });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/web/Highlight.jsx", error: String((e && e.message) || e) }); }

// components/web/PriceTag.jsx
try { (() => {
function PriceTag({
  label = 'AANBIEDING',
  from,
  price,
  tone = 'light'
}) {
  const dark = tone === 'dark';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 14,
      fontFamily: 'var(--font-sans)'
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      background: 'var(--web-coral)',
      color: 'var(--web-ink)',
      fontWeight: 800,
      fontSize: 12,
      letterSpacing: '.12em',
      padding: '6px 12px',
      borderRadius: 'var(--web-radius-pill)'
    }
  }, label), from && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 22,
      fontWeight: 600,
      color: dark ? 'rgba(255,255,255,.6)' : 'var(--web-brown)',
      textDecoration: 'line-through',
      textDecorationThickness: 2
    }
  }, from), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 44,
      fontWeight: 800,
      letterSpacing: 'var(--web-tracking-title-tight)',
      color: dark ? '#fff' : 'var(--web-ink)',
      lineHeight: 1
    }
  }, price));
}
Object.assign(__ds_scope, { PriceTag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/web/PriceTag.jsx", error: String((e && e.message) || e) }); }

// components/web/StreetSign.jsx
try { (() => {
function StreetSign({
  title = 'Goed om te weten',
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '3px solid var(--web-ink)',
      borderRadius: 'var(--web-radius-paper)',
      boxShadow: 'inset 0 0 0 4px #fff, inset 0 0 0 6px var(--web-ink)',
      padding: '22px 26px',
      fontFamily: 'var(--font-sans)',
      color: 'var(--web-ink)',
      maxWidth: 520
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 800,
      fontSize: 20,
      letterSpacing: '-0.02em',
      marginBottom: 6
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      lineHeight: 1.5,
      color: 'var(--web-ink-2)'
    }
  }, children));
}
Object.assign(__ds_scope, { StreetSign });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/web/StreetSign.jsx", error: String((e && e.message) || e) }); }

// components/web/Tag.jsx
try { (() => {
function Tag({
  children,
  tone = 'green'
}) {
  const t = {
    green: ['var(--web-green)', 'var(--web-ink)'],
    coral: ['var(--web-coral)', 'var(--web-ink)'],
    ink: ['var(--web-ink)', '#fff'],
    paper: ['#fff', 'var(--web-ink)']
  }[tone];
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      background: t[0],
      color: t[1],
      fontFamily: 'var(--font-sans)',
      fontWeight: 700,
      fontSize: 13,
      padding: '6px 14px',
      borderRadius: 'var(--web-radius-pill)'
    }
  }, children);
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/web/Tag.jsx", error: String((e && e.message) || e) }); }

// components/web/WordMarquee.jsx
try { (() => {
const DEFAULT = ['huisarts', 'juf', 'afspraak', 'Tikkie', 'traktatie', 'balie', 'buren', 'ziekmelding', 'kinderopvang', 'gemeente'];
function WordMarquee({
  words = DEFAULT,
  speed = 40,
  tone = 'dark'
}) {
  const id = React.useMemo(() => 'isrmq' + Math.random().toString(36).slice(2, 7), []);
  const dark = tone === 'dark';
  const row = words.flatMap((w, i) => [/*#__PURE__*/React.createElement("span", {
    key: 'w' + i,
    style: {
      fontWeight: 800,
      fontSize: 28,
      letterSpacing: '-0.02em'
    }
  }, w), /*#__PURE__*/React.createElement("span", {
    key: 's' + i,
    style: {
      color: 'var(--web-coral)',
      fontSize: 22
    }
  }, "\u2733")]);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      overflow: 'hidden',
      background: dark ? 'var(--web-ink)' : 'var(--web-bg)',
      color: dark ? '#fff' : 'var(--web-ink)',
      padding: '18px 0',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("style", null, `@keyframes ${id}{from{transform:translateX(0)}to{transform:translateX(-50%)}}@media (prefers-reduced-motion:reduce){.${id}{animation:none!important}}`), /*#__PURE__*/React.createElement("div", {
    className: id,
    style: {
      display: 'flex',
      gap: 28,
      alignItems: 'center',
      width: 'max-content',
      animation: `${id} ${speed}s linear infinite`
    }
  }, row, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'contents'
    }
  }, row.map((n, i) => React.cloneElement(n, {
    key: 'b' + i
  })))));
}
Object.assign(__ds_scope, { WordMarquee });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/web/WordMarquee.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.AuthorChip = __ds_scope.AuthorChip;

__ds_ns.CTAButton = __ds_scope.CTAButton;

__ds_ns.ChatBubble = __ds_scope.ChatBubble;

__ds_ns.FaqItem = __ds_scope.FaqItem;

__ds_ns.Gable = __ds_scope.Gable;

__ds_ns.Highlight = __ds_scope.Highlight;

__ds_ns.PriceTag = __ds_scope.PriceTag;

__ds_ns.StreetSign = __ds_scope.StreetSign;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.WordMarquee = __ds_scope.WordMarquee;

})();
