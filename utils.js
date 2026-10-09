// utils.js - Funções utilitárias
export const fmtMoeda = (v) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

export const esc = (v) => String(v ?? '').replace(/[&<>"'`]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));

export const REGRAS_SENHA = [
    { id: 'tamanho', texto: 'Mínimo de 10 caracteres', ok: (s) => s.length >= 10 },
    { id: 'maiuscula', texto: 'Uma letra maiúscula', ok: (s) => /[A-Z]/.test(s) },
    { id: 'numero', texto: 'Um número', ok: (s) => /\d/.test(s) },
    { id: 'especial', texto: 'Um caractere especial (!@#$%&*+-.)', ok: (s) => /[!@#$%&*+\-.]/.test(s) }
];

export const senhaValida = (senha) => REGRAS_SENHA.every((r) => r.ok(senha));

export const requisitosFaltantes = (senha) => REGRAS_SENHA.filter((r) => !r.ok(senha)).map((r) => r.texto);

export const parseMoeda = (s) => {
    if (typeof s === 'number') return s;
    if (s == null) return 0;
    
    let limpo = String(s).trim();
    
    // Se tem vírgula e ponto, determinar qual é o separador decimal
    // Baseado na posição do último separador
    if (limpo.includes(',') && limpo.includes('.')) {
        const ultimoVirgula = limpo.lastIndexOf(',');
        const ultimoPonto = limpo.lastIndexOf('.');
        
        if (ultimoVirgula > ultimoPonto) {
            // Formato brasileiro: 1.234,56
            limpo = limpo.replace(/\./g, '').replace(',', '.');
        } else {
            // Formato internacional: 1,234.56
            limpo = limpo.replace(/,/g, '');
        }
    } else if (limpo.includes(',')) {
        // Só vírgula - formato brasileiro
        limpo = limpo.replace(',', '.');
    }
    // Se só tem ponto, deixar como está (formato internacional)
    
    limpo = limpo.replace(/[^\d.-]/g, '');
    return parseFloat(limpo) || 0;
};

export const validarData = (dataStr) => {
    const regex = /^(\d{2})\/(\d{2})(?:\/(\d{4}))?$/;
    const match = regex.exec(dataStr);
    if (!match) return false;

    const dia = Number(match[1]);
    const mes = Number(match[2]);
    const ano = match[3] ? Number(match[3]) : new Date().getFullYear();
    const data = new Date(ano, mes - 1, dia);

    return data.getFullYear() === ano && data.getMonth() === mes - 1 && data.getDate() === dia;
};

export const validarValor = (valor) => {
    const num = parseMoeda(valor);
    return !isNaN(num) && num >= 0;
};

export const mostrarErro = (mensagem) => {
    mostrarNotificacao(mensagem, 'erro', 'ERRO');
};

export const mostrarSucesso = (mensagem) => {
    mostrarNotificacao(mensagem, 'sucesso', 'SUCESSO');
};

export const mostrarAviso = (mensagem) => {
    mostrarNotificacao(mensagem, 'aviso', 'AVISO');
};

export const mostrarNotificacao = (mensagem, tipo = 'sucesso', titulo = '', duracao = 8000) => {
    const container = document.getElementById('notificacaoContainer');
    if (!container) return;

    const notificacao = document.createElement('div');
    notificacao.className = `notificacao notificacao-${tipo}`;
    
    let icone = '✓';
    if (tipo === 'erro') icone = '✕';
    if (tipo === 'aviso') icone = '⚠';

    const tituloHtml = titulo ? `<div class="notificacao-titulo">${esc(titulo)}</div>` : '';
    
    notificacao.innerHTML = `
        <div class="notificacao-icone">${icone}</div>
        <div class="notificacao-conteudo">
            ${tituloHtml}
            <div class="notificacao-mensagem">${esc(mensagem)}</div>
        </div>
        <button class="notificacao-fechar">×</button>
    `;

    container.appendChild(notificacao);

    notificacao.querySelector('.notificacao-fechar').addEventListener('click', () => {
        fecharNotificacao(notificacao);
    });

    if (duracao > 0) {
        setTimeout(() => {
            fecharNotificacao(notificacao);
        }, duracao);
    }
};

const fecharNotificacao = (notificacao) => {
    notificacao.classList.add('saindo');
    setTimeout(() => {
        notificacao.remove();
    }, 300);
};

export const parseCSV = (csvText) => {
    const linhas = csvText.split(/\r?\n/).filter(l => l.trim());
    if (linhas.length < 2) return [];
    
    // Parse header
    const cabecalhos = linhas[0].split(';').map(h => 
        h.trim().replace(/\ufeff/g, '').replace(/^"|"$/g, '')
    );
    
    // Parse data rows
    const dados = linhas.slice(1).map(linha => {
        // Handle quoted values with semicolons inside
        const valores = [];
        let valor = '';
        let dentro_aspas = false;
        
        for (let i = 0; i < linha.length; i++) {
            const char = linha[i];
            
            if (char === '"') {
                dentro_aspas = !dentro_aspas;
            } else if (char === ';' && !dentro_aspas) {
                valores.push(valor.trim().replace(/^"|"$/g, ''));
                valor = '';
            } else {
                valor += char;
            }
        }
        valores.push(valor.trim().replace(/^"|"$/g, ''));
        
        const obj = {};
        cabecalhos.forEach((h, i) => obj[h] = valores[i] || '');
        return obj;
    });
    return dados;
};