// app.js - Ponto de entrada da aplicação
import { initAuth } from './auth.js';
import { initUI, onLogin, onLogout } from './ui.js';
import { mostrarAviso } from './utils.js';

// Inicializar autenticação
initAuth(onLogin, onLogout, mostrarAviso);

// Inicializar interface
initUI();
