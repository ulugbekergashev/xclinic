import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Electron bundle'ni file:// orqali ochadi — BrowserRouter u yerda ishlamaydi
// (sahifa yangilanishi/chuqur havolalar "file not found" beradi), shuning uchun
// HashRouter. PWA service-worker olib tashlangan: desktop ilovada u faqat
// eskirgan kesh muammosini keltiradi.
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
