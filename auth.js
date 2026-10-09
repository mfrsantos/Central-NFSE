// auth.js - Gerenciamento de autenticação
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut, onAuthStateChanged, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { firebaseConfig } from './config.js';
import { senhaValida, requisitosFaltantes } from './utils.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.languageCode = 'pt-BR';

const IDLE_LIMIT_MS = 15 * 60 * 1000;
const SESSAO_KEY = 'sessao_ativa';
const DOMINIO_PERMITIDO = '@vaccinar.com.br';
const emailPermitido = (email) => String(email || '').trim().toLowerCase().endsWith(DOMINIO_PERMITIDO);
const MSG_EMAIL_NEGADO = `Use o e-mail corporativo (${DOMINIO_PERMITIDO})`;
let idleTimer = null;
let registrando = false;

const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => signOut(auth), IDLE_LIMIT_MS);
};

const IDLE_EVENTS = ['click', 'keydown', 'mousemove', 'touchstart'];

const ehCorporativo = (email) => String(email || '').toLowerCase().endsWith(DOMINIO_PERMITIDO);

// Retorna uma mensagem se o acesso deve ser barrado; null caso contrário
const liberarAcesso = async (user) => {
    if (!ehCorporativo(user.email)) return null;
    if (!user.emailVerified) {
        await sendEmailVerification(user).catch((err) => console.warn('Falha ao enviar verificação:', err));
        return 'Confirme seu e-mail pelo link enviado (verifique também o spam) e entre novamente.';
    }
    // As regras do banco só aceitam esta gravação para e-mail corporativo verificado
    await set(ref(getDatabase(app), `usuarios_autorizados/${user.uid}`), true)
        .catch((err) => console.warn('Autorização automática negada:', err));
    return null;
};

export const initAuth = async (onLogin, onLogout, onAviso) => {
    // Evita login automático a partir de sessão persistida de outra execução
    if (!sessionStorage.getItem(SESSAO_KEY)) await signOut(auth);
    onAuthStateChanged(auth, async (user) => {
        if (registrando) return;
        if (user) {
            const bloqueio = await liberarAcesso(user);
            if (bloqueio) {
                sessionStorage.removeItem(SESSAO_KEY);
                await signOut(auth);
                onAviso(bloqueio);
                return;
            }
            IDLE_EVENTS.forEach((e) => window.addEventListener(e, resetIdle, { passive: true }));
            resetIdle();
            onLogin();
        } else {
            IDLE_EVENTS.forEach((e) => window.removeEventListener(e, resetIdle));
            clearTimeout(idleTimer);
            onLogout();
        }
    });
};

export const login = async (email, senha) => {
    try {
        await setPersistence(auth, browserSessionPersistence);
        await signInWithEmailAndPassword(auth, email, senha);
        sessionStorage.setItem(SESSAO_KEY, '1');
    } catch (error) {
        throw new Error('Credenciais inválidas');
    }
};

export const logout = async () => {
    sessionStorage.removeItem(SESSAO_KEY);
    await signOut(auth);
};

export const redefinirSenha = async (email) => {
    const e = String(email).trim().toLowerCase();
    if (!e) throw new Error('Informe seu e-mail');
    if (!emailPermitido(e)) throw new Error(MSG_EMAIL_NEGADO);
    try {
        await sendPasswordResetEmail(auth, e);
    } catch (error) {
        if (error.code === 'auth/invalid-email') throw new Error('E-mail inválido');
        if (error.code === 'auth/too-many-requests') throw new Error('Muitas tentativas. Aguarde alguns minutos');
        // Demais erros são ocultados para não revelar quais e-mails existem
        console.warn('Redefinição de senha:', error.code);
    }
};

export const registrar = async (email, senha) => {
    const e = String(email).trim().toLowerCase();
    if (!emailPermitido(e)) throw new Error(MSG_EMAIL_NEGADO);
    if (!senhaValida(senha)) throw new Error(`A senha não atende aos requisitos. Falta: ${requisitosFaltantes(senha).join('; ')}`);
    try {
        registrando = true;
        await setPersistence(auth, browserSessionPersistence);
        await createUserWithEmailAndPassword(auth, e, senha);
        await sendEmailVerification(auth.currentUser);
        // Registro do UID para facilitar a liberação de acesso pelo administrador
        await set(ref(getDatabase(app), `usuarios/${auth.currentUser.uid}`), { email: e, criadoEm: Date.now() })
            .catch((err) => console.warn('Registro do usuário no banco falhou:', err));
        await signOut(auth);
    } catch (error) {
        await signOut(auth).catch(() => {});
        console.error('Erro no cadastro:', error);
        if (error.code === 'auth/email-already-in-use') throw new Error('E-mail já cadastrado');
        if (error.code === 'auth/weak-password') throw new Error('Senha muito fraca');
        if (error.code === 'auth/password-does-not-meet-requirements') throw new Error('A senha não atende à política de segurança (10+ caracteres, maiúscula, número e caractere especial)');
        if (error.code === 'auth/invalid-email') throw new Error('E-mail inválido');
        if (error.code === 'auth/operation-not-allowed') throw new Error('Cadastro desativado no Firebase (habilite E-mail/Senha)');
        throw new Error(`Não foi possível criar o usuário (${error.code || 'erro desconhecido'})`);
    } finally {
        registrando = false;
    }
};