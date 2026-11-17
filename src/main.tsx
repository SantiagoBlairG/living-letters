import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/figtree';
import '@fontsource/archivo-black/400.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/space-mono/700.css';
import '@fontsource/caveat/700.css';
import './styles.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
