import type { Config } from 'tailwindcss';

/// Все цвета/радиусы/шрифты берутся из семантических CSS-токенов
/// (src/styles/tokens.css). Компоненты не знают hex-значений — направление
/// дизайна переключается атрибутом data-direction / data-theme.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        background: token('background'),
        foreground: token('foreground'),
        surface: {
          DEFAULT: token('surface'),
          raised: token('surface-raised'),
          overlay: token('surface-overlay'),
          sunken: token('surface-sunken'),
        },
        muted: {
          DEFAULT: token('muted'),
          foreground: token('muted-foreground'),
        },
        subtle: {
          foreground: token('subtle-foreground'),
        },
        primary: {
          DEFAULT: token('primary'),
          hover: token('primary-hover'),
          active: token('primary-active'),
          foreground: token('primary-foreground'),
          soft: token('primary-soft'),
          'soft-foreground': token('primary-soft-foreground'),
        },
        border: {
          DEFAULT: token('border'),
          strong: token('border-strong'),
          subtle: token('border-subtle'),
        },
        ring: token('ring'),
        success: {
          DEFAULT: token('success'),
          foreground: token('success-foreground'),
          soft: token('success-soft'),
        },
        warning: {
          DEFAULT: token('warning'),
          foreground: token('warning-foreground'),
          soft: token('warning-soft'),
        },
        destructive: {
          DEFAULT: token('destructive'),
          foreground: token('destructive-foreground'),
          soft: token('destructive-soft'),
        },
        info: {
          DEFAULT: token('info'),
          foreground: token('info-foreground'),
          soft: token('info-soft'),
        },
      },
      borderColor: {
        DEFAULT: token('border'),
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        md: 'var(--radius)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow)',
        lg: 'var(--shadow-lg)',
        edge: 'inset 0 1px 0 0 var(--edge-highlight)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        display: ['var(--font-display)'],
        mono: ['var(--font-mono)'],
        serif: ['var(--font-serif, var(--font-sans))'],
      },
      height: {
        'control-sm': 'var(--control-h-sm)',
        control: 'var(--control-h)',
        'control-lg': 'var(--control-h-lg)',
        row: 'var(--row-h)',
      },
      minHeight: {
        'control-sm': 'var(--control-h-sm)',
        control: 'var(--control-h)',
        'control-lg': 'var(--control-h-lg)',
        row: 'var(--row-h)',
      },
      spacing: {
        'control-px': 'var(--control-px)',
        'card-p': 'var(--card-p)',
        gap: 'var(--gap)',
      },
      transitionDuration: {
        fast: 'var(--motion-fast)',
        DEFAULT: 'var(--motion)',
        slow: 'var(--motion-slow)',
      },
      transitionTimingFunction: {
        DEFAULT: 'var(--ease)',
        out: 'var(--ease-out)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-out': { from: { opacity: '1' }, to: { opacity: '0' } },
        'pop-in': {
          from: { opacity: '0', transform: 'scale(0.96) translateY(var(--pop-y, 0))' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'pop-out': {
          from: { opacity: '1', transform: 'scale(1) translateY(0)' },
          to: { opacity: '0', transform: 'scale(0.96) translateY(var(--pop-y, 0))' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-out-right': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(100%)' },
        },
        'slide-in-left': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-out-left': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-100%)' },
        },
        'slide-in-top': {
          from: { transform: 'translateY(-100%)' },
          to: { transform: 'translateY(0)' },
        },
        'slide-out-top': {
          from: { transform: 'translateY(0)' },
          to: { transform: 'translateY(-100%)' },
        },
        'slide-in-bottom': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'slide-out-bottom': {
          from: { transform: 'translateY(0)' },
          to: { transform: 'translateY(100%)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in var(--motion) var(--ease-out)',
        'fade-out': 'fade-out var(--motion-fast) var(--ease)',
        'pop-in': 'pop-in var(--motion) var(--ease-out)',
        'pop-out': 'pop-out var(--motion-fast) var(--ease)',
        'slide-in-right': 'slide-in-right var(--motion-slow) var(--ease-out)',
        'slide-out-right': 'slide-out-right var(--motion) var(--ease)',
        'slide-in-left': 'slide-in-left var(--motion-slow) var(--ease-out)',
        'slide-out-left': 'slide-out-left var(--motion) var(--ease)',
        'slide-in-top': 'slide-in-top var(--motion-slow) var(--ease-out)',
        'slide-out-top': 'slide-out-top var(--motion) var(--ease)',
        'slide-in-bottom': 'slide-in-bottom var(--motion-slow) var(--ease-out)',
        'slide-out-bottom': 'slide-out-bottom var(--motion) var(--ease)',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
