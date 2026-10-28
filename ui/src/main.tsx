import { createRoot } from 'react-dom/client';
import App from './App';
import './theme/tokens.css';
import './theme/app.css';

// The desktop shell's one-time hand-over from Emdi opens this page on Emdi's origin: answer with its storage, show nothing.
if (location.hash === '#export-storage') {
  const entries: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    entries[k] = localStorage.getItem(k) ?? '';
  }
  window.folio?.exportStorage?.(entries);
} else createRoot(document.getElementById('root')!).render(<App />);
