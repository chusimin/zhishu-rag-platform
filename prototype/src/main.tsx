import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import '@xyflow/react/dist/style.css';
import './styles.css';
import { App } from './App';
import { AnnotateProvider, ToastProvider } from './components/ui';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AnnotateProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AnnotateProvider>
    </HashRouter>
  </StrictMode>,
);
