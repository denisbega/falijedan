import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Ukloni splash kad se aplikacija iscrta
requestAnimationFrame(() => {
  window.setTimeout(() => {
    const splash = document.getElementById('splash');
    if (!splash) return;
    splash.classList.add('is-hidden');
    window.setTimeout(() => splash.remove(), 500);
  }, 350);
});

// PWA: service worker samo u produkciji (u dev režimu bi smetao HMR-u)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
