/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        obsidian: {
          DEFAULT: '#070709',
          surface: '#111116',
          card: '#15151c',
          border: 'rgba(255, 255, 255, 0.08)',
          muted: '#1e1e28',
        },
        brand: {
          lime: '#CCFF00',       // Acid Lime Primary
          violet: '#8B5CF6',     // Electric Violet
          pink: '#FF2E93',       // Hot Cyber Pink
          cyan: '#00F0FF',       // Laser Cyan
          dark: '#070709',
        },
      },
      fontFamily: {
        heading: ['"Space Grotesk"', 'sans-serif'],
        body: ['"Plus Jakarta Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'neo': '4px 4px 0px 0px #CCFF00',
        'neo-sm': '2px 2px 0px 0px #CCFF00',
        'neo-pink': '4px 4px 0px 0px #FF2E93',
        'neo-cyan': '4px 4px 0px 0px #00F0FF',
        'neo-violet': '4px 4px 0px 0px #8B5CF6',
        'glow-lime': '0 0 25px -4px rgba(204, 255, 0, 0.45)',
        'glow-pink': '0 0 25px -4px rgba(255, 46, 147, 0.45)',
        'glow-cyan': '0 0 25px -4px rgba(0, 240, 255, 0.45)',
      },
      animation: {
        'pulse-speaking': 'speakingPulse 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float-slow': 'floating 4s ease-in-out infinite',
      },
      keyframes: {
        speakingPulse: {
          '0%, 100%': { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(204, 255, 0, 0.7)' },
          '50%': { transform: 'scale(1.05)', boxShadow: '0 0 0 12px rgba(204, 255, 0, 0)' },
        },
        floating: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        }
      }
    },
  },
  plugins: [],
}
