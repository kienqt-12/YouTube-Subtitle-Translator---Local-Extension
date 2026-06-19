import type { Config } from 'tailwindcss';

export default {
  content: [
    './entrypoints/**/*.{html,js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#10213d',
        primary: '#4f46e5',
        accent: '#7c3aed',
      },
      boxShadow: {
        card: '0 18px 48px rgba(30, 41, 59, 0.14)',
      },
    },
  },
  plugins: [],
} satisfies Config;
