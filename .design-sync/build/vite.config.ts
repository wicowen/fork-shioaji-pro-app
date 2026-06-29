// Library build of the curated design system for claude.ai/design.
// Reuses the app's own vanilla-extract + react toolchain so the compiled CSS
// (theme classes + component styles) is byte-identical to production, then
// redirects the live data layer to canned mocks. Output: ds-dist/entry.js
// (ESM, react external) + ds-dist/style.css — fed to the design-sync converter.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const dir = fileURLToPath(new URL('.', import.meta.url));
const repo = resolve(dir, '../..');
const src = resolve(repo, 'src');
const mocks = resolve(dir, 'mocks');

// Live data-layer modules -> canned mocks. Matched by path suffix so it
// catches both `../lib/x` relative imports (from components) and `@/lib/x`
// alias imports — the real code uses both spellings.
const MOCKS: Record<string, string> = {
    'hooks/use-stream': resolve(mocks, 'use-stream.ts'),
    'lib/api': resolve(mocks, 'api.ts'),
    'lib/shioaji': resolve(mocks, 'shioaji.ts'),
    'lib/stream': resolve(mocks, 'stream.ts'),
    'lib/price-sync': resolve(mocks, 'price-sync.ts'),
    'lib/sector-sync': resolve(mocks, 'sector-sync.ts'),
    'lib/contracts-cache': resolve(mocks, 'contracts-cache.ts'),
    'lib/stock-index': resolve(mocks, 'stock-index.ts'),
};

function dataMockPlugin(): Plugin {
    return {
        name: 'ds-data-mocks',
        enforce: 'pre',
        resolveId(source) {
            for (const [key, target] of Object.entries(MOCKS)) {
                if (source === '@/' + key || source.endsWith('/' + key)) return target;
            }
            return null;
        },
    };
}

export default defineConfig({
    configFile: false,
    plugins: [dataMockPlugin(), vanillaExtractPlugin(), react()],
    define: {
        'process.env': {},
        __STATSIG_CLIENT_KEY__: JSON.stringify(''),
    },
    resolve: {
        alias: {
            '@modules': resolve(src, 'modules-stub/index.ts'),
            '@': src,
        },
    },
    build: {
        outDir: resolve(repo, 'ds-dist'),
        emptyOutDir: true,
        cssCodeSplit: false,
        minify: false,
        lib: {
            entry: resolve(dir, 'entry.tsx'),
            formats: ['es'],
            fileName: () => 'entry.js',
        },
        rollupOptions: {
            external: [
                'react',
                'react-dom',
                'react/jsx-runtime',
                'react/jsx-dev-runtime',
                'react-dom/client',
            ],
        },
    },
});
