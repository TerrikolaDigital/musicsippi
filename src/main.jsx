import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { MODO_LOCAL } from './config/modo.js';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Diagnóstico del organizador (Task 1 del plan 2026-10-15): solo en el build móvil.
if (MODO_LOCAL) {
  window.__medirOrganizador = (opciones) => import('./organizador/medir.js').then((m) => m.medirOrganizador(opciones));
}

// Habilita "Instalar app" en el navegador (ver public/sw.js: no cachea nada,
// solo registra un controlador para que el manifest cuente como instalable).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
