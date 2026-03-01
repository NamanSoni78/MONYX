import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        background: '#0d0718',
        panel: '#1a0f2e',
        accent: '#7b3fe4',
      },
    },
  },
  plugins: [],
};
export default config;
