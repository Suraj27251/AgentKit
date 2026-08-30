/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Material "Sahara" surfaces (from the Azure SQL Workbench reference)
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        surface: 'hsl(var(--surface))',
        'surface-bright': 'hsl(var(--surface-bright))',
        'surface-dim': 'hsl(var(--surface-dim))',
        'surface-container': 'hsl(var(--surface-container))',
        'surface-container-low': 'hsl(var(--surface-container-low))',
        'surface-container-lowest': 'hsl(var(--surface-container-lowest))',
        'surface-container-high': 'hsl(var(--surface-container-high))',
        'surface-container-highest': 'hsl(var(--surface-container-highest))',
        'surface-variant': 'hsl(var(--surface-variant))',
        'on-background': 'hsl(var(--on-background))',
        'on-surface': 'hsl(var(--on-surface))',
        'on-surface-variant': 'hsl(var(--on-surface-variant))',
        'tint': 'hsl(var(--tint))',

        primary: 'hsl(var(--primary))',
        'primary-foreground': 'hsl(var(--primary-foreground))',
        'on-primary': 'hsl(var(--on-primary))',
        'primary-container': 'hsl(var(--primary-container))',
        'on-primary-container': 'hsl(var(--on-primary-container))',
        'primary-fixed': 'hsl(var(--primary-fixed))',
        'primary-fixed-dim': 'hsl(var(--primary-fixed-dim))',
        'on-primary-fixed': 'hsl(var(--on-primary-fixed))',
        'on-primary-fixed-variant': 'hsl(var(--on-primary-fixed-variant))',
        'inverse-primary': 'hsl(var(--inverse-primary))',

        secondary: 'hsl(var(--secondary))',
        'secondary-foreground': 'hsl(var(--secondary-foreground))',
        'on-secondary': 'hsl(var(--on-secondary))',
        'secondary-container': 'hsl(var(--secondary-container))',
        'on-secondary-container': 'hsl(var(--on-secondary-container))',
        'secondary-fixed': 'hsl(var(--secondary-fixed))',
        'secondary-fixed-dim': 'hsl(var(--secondary-fixed-dim))',
        'on-secondary-fixed': 'hsl(var(--on-secondary-fixed))',
        'on-secondary-fixed-variant': 'hsl(var(--on-secondary-fixed-variant))',

        tertiary: 'hsl(var(--tertiary))',
        'tertiary-foreground': 'hsl(var(--tertiary-foreground))',
        'on-tertiary': 'hsl(var(--on-tertiary))',
        'tertiary-container': 'hsl(var(--tertiary-container))',
        'on-tertiary-container': 'hsl(var(--on-tertiary-container))',
        'tertiary-fixed': 'hsl(var(--tertiary-fixed))',
        'tertiary-fixed-dim': 'hsl(var(--tertiary-fixed-dim))',
        'on-tertiary-fixed': 'hsl(var(--on-tertiary-fixed))',
        'on-tertiary-fixed-variant': 'hsl(var(--on-tertiary-fixed-variant))',

        error: 'hsl(var(--error))',
        'on-error': 'hsl(var(--on-error))',
        'error-container': 'hsl(var(--error-container))',
        'on-error-container': 'hsl(var(--on-error-container))',
        destructive: 'hsl(var(--destructive))',
        'destructive-foreground': 'hsl(var(--destructive-foreground))',

        outline: 'hsl(var(--outline))',
        'outline-variant': 'hsl(var(--outline-variant))',
        'inverse-surface': 'hsl(var(--inverse-surface))',
        'inverse-on-surface': 'hsl(var(--inverse-on-surface))',

        // Semantic aliases used by components
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
      },
      fontFamily: {
        headline: ['var(--font-headline)', 'ui-serif', 'Georgia', 'serif'],
        display: ['var(--font-headline)', 'ui-serif', 'Georgia', 'serif'],
        body: ['var(--font-body)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        label: ['var(--font-body)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        soft: '0 2px 16px rgba(58, 48, 42, 0.04)',
        bento: '0 4px 32px rgba(58, 48, 42, 0.06)',
        'bento-focus': '0 8px 48px rgba(194, 101, 42, 0.1)',
      },
      backgroundImage: {
        'grid-pattern':
          "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h40v40H0V0zm39 39V1H1v38h38z' fill='%23d8d0c8' fill-opacity='0.2' fill-rule='evenodd'/%3E%3C/svg%3E\")",
      },
    },
  },
  plugins: [],
};