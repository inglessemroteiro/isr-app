/* @ds-bundle: {"format":3,"namespace":"InglesSemRoteiroDesignSystem_a7985f","components":[{"name":"Badge","sourcePath":"components/Badge.jsx"},{"name":"Button","sourcePath":"components/Button.jsx"},{"name":"Card","sourcePath":"components/Card.jsx"},{"name":"Input","sourcePath":"components/Input.jsx"}],"sourceHashes":{"components/Badge.jsx":"a5b7b4b14525","components/Button.jsx":"7196daf9f863","components/Card.jsx":"630697428f85","components/Input.jsx":"039907c1a933"},"inlinedExternals":[],"unexposedExports":[]} */

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

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Input = __ds_scope.Input;

})();
