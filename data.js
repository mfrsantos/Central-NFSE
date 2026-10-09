// data.js - Operações de dados com Firebase
import { getDatabase, ref, push, onValue, remove, update, get, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { firebaseConfig } from './config.js';

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const contasRef = ref(db, 'contas');

// Falha na auditoria não desfaz a operação já concluída
const registrarAuditoria = async (acao, contaId, detalhe) => {
    try {
        const user = getAuth(app).currentUser;
        if (!user) return;
        await push(ref(db, 'auditoria'), {
            ts: serverTimestamp(),
            uid: user.uid,
            email: user.email || '',
            acao,
            contaId,
            detalhe: String(detalhe || '').slice(0, 500)
        });
    } catch (error) {
        console.warn('Falha ao registrar auditoria:', error);
    }
};

const resumirItem = (item) => item
    ? `${item.tipo || ''} | pedido ${item.pedido || '-'} | ${item.fornecedor || '-'} | valor ${item.valor ?? '-'} | ${item.mes || '-'}`
    : '';

export const carregarDados = (callback, onError) => {
    return onValue(contasRef, (snap) => {
        const data = snap.val();
        callback(data);
    }, (error) => {
        console.error("Erro ao carregar dados:", error);
        if (onError) onError(error);
    });
};

export const salvarItem = async (item) => {
    let novoId = null;
    try {
        novoId = (await push(contasRef, item)).key;
    } catch (error) {
        throw new Error('Erro ao salvar item');
    }
    await registrarAuditoria('CRIAR', novoId, resumirItem(item));
};

export const atualizarItem = async (id, campo, valor) => {
    try {
        const dataRef = ref(db, `contas/${id}`);
        const dados = (typeof campo === 'object' && campo !== null) ? campo : { [campo]: valor };
        await update(dataRef, dados);
    } catch (error) {
        throw new Error('Erro ao atualizar item');
    }
    await registrarAuditoria('ATUALIZAR', id, JSON.stringify(dados));
};

export const removerItem = async (id) => {
    let anterior = null;
    try {
        anterior = (await get(ref(db, `contas/${id}`))).val();
        await remove(ref(db, `contas/${id}`));
    } catch (error) {
        throw new Error('Erro ao remover item');
    }
    await registrarAuditoria('EXCLUIR', id, resumirItem(anterior));
};

export const obterItem = async (id) => {
    try {
        const snap = await get(ref(db, `contas/${id}`));
        return snap.val();
    } catch (error) {
        throw new Error('Erro ao obter item');
    }
};

export const verificarPedidoExistente = async (pedido, mes) => {
    try {
        const snap = await get(contasRef);
        const dados = snap.val();
        
        if (!dados) return null;
        
        // Procurar por um item com o mesmo pedido e mês
        for (const [id, item] of Object.entries(dados)) {
            if (item.pedido === pedido && item.mes === mes) {
                return item; // Retorna o item encontrado
            }
        }
        
        return null; // Nenhum item encontrado
    } catch (error) {
        throw new Error('Erro ao verificar pedido existente');
    }
};