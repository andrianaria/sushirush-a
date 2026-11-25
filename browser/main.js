import { jsx as _jsx } from '../vendor/browser/jsx-runtime.js';
import { StrictMode } from '../vendor/browser/react.js';
import { createRoot } from '../vendor/browser/react-dom-client.js';
import App from './App.js';
createRoot(document.getElementById('root')).render(_jsx(StrictMode, { children: _jsx(App, {}) }));
