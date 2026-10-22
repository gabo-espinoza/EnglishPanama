import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';
import { applyReloadPolicy } from './api/sessionPolicy.js';

// Recargar la página cierra la sesión: se aplica ANTES de montar el router, que lee la ubicación al crearse.
applyReloadPolicy();

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </React.StrictMode>
);
