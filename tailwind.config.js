import tailwindcssAnimate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
  	extend: {
  		fontFamily: {
  			sans: ['Manrope', 'system-ui', 'sans-serif'],
  			mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
  		},
  		colors: {
  			ink: '#0a1a2f',
  			bone: '#eef2f6',
  			cobalt: {
  				DEFAULT: '#2864ff',
  				bright: '#4a82ff',
  			},
  			contam: '#ff4d6d',
  			lime: '#aff048',
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			breathe: {
  				'0%, 100%': {
  					opacity: '0.6'
  				},
  				'50%': {
  					opacity: '0.85'
  				}
  			},
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			'hud-pulse-red': {
  				'0%, 100%': {
  					'box-shadow': '0 0 16px rgba(255,77,109,0.25), inset 0 0 8px rgba(255,77,109,0.10)'
  				},
  				'50%': {
  					'box-shadow': '0 0 32px rgba(255,77,109,0.55), inset 0 0 16px rgba(255,77,109,0.20)'
  				}
  			},
  			'shimmer': {
  				'0%': { 'background-position': '-200% 0' },
  				'100%': { 'background-position': '200% 0' }
  			},
  			'rise-in': {
  				'0%': { opacity: '0', transform: 'translateY(8px)' },
  				'100%': { opacity: '1', transform: 'translateY(0)' }
  			},
  			'reveal-from-left': {
  				'0%': { opacity: '0', transform: 'translateX(-12px)' },
  				'100%': { opacity: '1', transform: 'translateX(0)' }
  			},
  			'count-up-pulse': {
  				'0%': { transform: 'scale(1)' },
  				'30%': { transform: 'scale(1.08)' },
  				'100%': { transform: 'scale(1)' }
  			}
  		},
  		animation: {
  			breathe: 'breathe 4s ease-in-out infinite',
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'hud-pulse-red': 'hud-pulse-red 1.4s ease-in-out infinite',
  			shimmer: 'shimmer 2.5s linear infinite',
  			'rise-in': 'rise-in 0.5s ease-out both',
  			'reveal-from-left': 'reveal-from-left 0.5s ease-out both',
  			'count-up-pulse': 'count-up-pulse 0.5s ease-out'
  		}
  	}
  },
  plugins: [tailwindcssAnimate],
}
