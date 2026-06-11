// src/main.tsx

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { bootstrap } from './lib/boot';
import { initTheme } from './lib/theme-store';
import { startTriggerEngine } from './lib/trigger-engine';

initTheme();
startTriggerEngine();
bootstrap();

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
