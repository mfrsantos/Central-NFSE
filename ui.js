// ui.js - Funções de interface
import { esc, fmtMoeda, REGRAS_SENHA, senhaValida, requisitosFaltantes, mostrarErro, mostrarSucesso, mostrarAviso, parseCSV, parseMoeda, validarValor, validarData } from './utils.js';
import { carregarDados, salvarItem, atualizarItem, removerItem, obterItem, verificarPedidoExistente } from './data.js';
import { listaMeses, emails, deParaFilial } from './config.js';
import { login, logout, registrar, redefinirSenha } from './auth.js';

let dadosCarregados = {};
const THEME_STORAGE_KEY = 'erp_vaccinar_theme';
const MANUAL_HISTORY_KEY = 'erp_vaccinar_manual_history';
const MANUAL_HISTORY_LIMIT = 50;
const SUPPLIER_RELATION_LIMIT = 500;

const camposComHistorico = [
    { inputId: 'mCodFor', listId: 'historicoCodFor', historyKey: 'codFor' },
    { inputId: 'mFornecedor', listId: 'historicoFornecedores', historyKey: 'fornecedor' },
    { inputId: 'mCC', listId: 'historicoCC', historyKey: 'cc' }
];

const obterHistoricoManual = () => {
    try {
        const historico = JSON.parse(localStorage.getItem(MANUAL_HISTORY_KEY) || '{}');
        return historico && typeof historico === 'object' ? historico : {};
    } catch (error) {
        return {};
    }
};

const normalizarTexto = (valor) => String(valor || '').trim().toLocaleLowerCase('pt-BR');

const normalizarNomeFornecedor = (valor) => {
    const nome = String(valor || '').trim();
    return normalizarTexto(nome) === 'telefonica cloud'
        ? 'TELEFONICA CLOUD E TECNOLOGIA'
        : nome;
};

const normalizarCodigoFornecedor = (valor) => {
    const codigo = String(valor || '').trim().match(/^(\d{6})(?:\s*-\s*.*)?$/);
    return codigo ? codigo[1] : '';
};

const obterRelacoesFornecedorCodigo = () => {
    const historico = obterHistoricoManual();
    const relacoes = (historico.fornecedorCodigos || [])
        .map((relacao) => ({
            fornecedor: normalizarNomeFornecedor(relacao.fornecedor),
            fornecedorNormalizado: normalizarTexto(normalizarNomeFornecedor(relacao.fornecedor)),
            codFor: normalizarCodigoFornecedor(relacao.codFor)
        }))
        .filter((relacao) => relacao.fornecedorNormalizado && relacao.codFor);

    const nomesMaisCompletosPorCodigo = new Map();
    relacoes.forEach((relacao) => {
        const nomes = nomesMaisCompletosPorCodigo.get(relacao.codFor) || [];
        const maiorNome = nomes.length ? Math.max(...nomes.map((nome) => nome.length)) : 0;
        if (relacao.fornecedor.length > maiorNome) {
            nomesMaisCompletosPorCodigo.set(relacao.codFor, [relacao.fornecedor]);
        } else if (relacao.fornecedor.length === maiorNome && !nomes.some((nome) => normalizarTexto(nome) === relacao.fornecedorNormalizado)) {
            nomesMaisCompletosPorCodigo.set(relacao.codFor, [...nomes, relacao.fornecedor]);
        }
    });

    return [...nomesMaisCompletosPorCodigo.entries()].flatMap(([codFor, fornecedores]) =>
        fornecedores.map((fornecedor) => ({
            fornecedor,
            fornecedorNormalizado: normalizarTexto(fornecedor),
            codFor
        }))
    );
};

const preencherLista = (lista, valores) => {
    lista.replaceChildren();
    [...new Set(valores)].forEach((valor) => {
        const opcao = document.createElement('option');
        opcao.value = valor;
        lista.appendChild(opcao);
    });
};

const preencherListaCodigos = (lista, relacoes) => {
    lista.replaceChildren();
    const codigos = new Set();
    relacoes.forEach((relacao) => {
        if (codigos.has(relacao.codFor)) return;
        codigos.add(relacao.codFor);
        const opcao = document.createElement('option');
        opcao.value = `${relacao.codFor} - ${relacao.fornecedor}`;
        lista.appendChild(opcao);
    });
};

const atualizarSugestoesHistorico = () => {
    const historico = obterHistoricoManual();

    camposComHistorico.forEach(({ listId, historyKey }) => {
        const lista = document.getElementById(listId);
        if (!lista) return;

        if (historyKey === 'codFor' || historyKey === 'fornecedor') return;

        preencherLista(lista, historico[historyKey] || []);
    });

    atualizarCodigosDoFornecedor(document.getElementById('mFornecedor')?.value || '');
    atualizarFornecedoresDoCodigo(document.getElementById('mCodFor')?.value || '');
};

const atualizarCodigosDoFornecedor = (nomeFornecedor) => {
    const inputCodigo = document.getElementById('mCodFor');
    const listaCodigos = document.getElementById('historicoCodFor');
    if (!inputCodigo || !listaCodigos) return;

    const fornecedorNormalizado = normalizarTexto(nomeFornecedor);
    const relacoes = obterRelacoesFornecedorCodigo();
    const relacoesCorrespondentes = relacoes
        .filter((relacao) => !fornecedorNormalizado || relacao.fornecedorNormalizado.startsWith(fornecedorNormalizado))
        .filter((relacao, indice, lista) => lista.findIndex((item) => item.codFor === relacao.codFor) === indice);
    const codigos = relacoesCorrespondentes.map((relacao) => relacao.codFor);
    preencherListaCodigos(listaCodigos, relacoesCorrespondentes);

    if (codigos.length === 1) {
        inputCodigo.value = codigos[0];
    } else if (codigos.length > 1 && !codigos.includes(normalizarCodigoFornecedor(inputCodigo.value))) {
        inputCodigo.value = '';
    }
};

const atualizarFornecedoresDoCodigo = (codigoFornecedor) => {
    const inputFornecedor = document.getElementById('mFornecedor');
    const listaFornecedores = document.getElementById('historicoFornecedores');
    if (!inputFornecedor || !listaFornecedores) return;

    const codigoNormalizado = normalizarCodigoFornecedor(codigoFornecedor)
        || String(codigoFornecedor || '').trim();
    const relacoes = obterRelacoesFornecedorCodigo();
    const fornecedores = relacoes
        .filter((relacao) => !codigoNormalizado || relacao.codFor.startsWith(codigoNormalizado))
        .map((relacao) => relacao.fornecedor);
    preencherLista(listaFornecedores, fornecedores);

    if (!/^\d{6}$/.test(codigoNormalizado)) return;

    const fornecedoresNormalizados = [...new Set(fornecedores.map(normalizarTexto))];
    if (fornecedoresNormalizados.length === 1) {
        inputFornecedor.value = fornecedores.find((fornecedor) => normalizarTexto(fornecedor) === fornecedoresNormalizados[0]);
    } else if (fornecedoresNormalizados.length > 1 && !fornecedoresNormalizados.includes(normalizarTexto(inputFornecedor.value))) {
        inputFornecedor.value = '';
    }
};

const salvarNoHistoricoManual = (item) => {
    const historico = obterHistoricoManual();

    camposComHistorico.forEach(({ historyKey }) => {
        const valor = historyKey === 'fornecedor'
            ? normalizarNomeFornecedor(item[historyKey])
            : String(item[historyKey] || '').trim();
        if (!valor) return;

        const valoresAtuais = historico[historyKey] || [];
        const valoresAtualizados = [
            valor,
            ...valoresAtuais.filter((itemSalvo) => itemSalvo.toLowerCase() !== valor.toLowerCase())
        ];
        historico[historyKey] = valoresAtualizados.slice(0, MANUAL_HISTORY_LIMIT);
    });

    if (item.fornecedor && item.codFor) {
        const relacoesAtuais = historico.fornecedorCodigos || [];
        const codigoFornecedor = normalizarCodigoFornecedor(item.codFor);
        if (codigoFornecedor) {
            const relacaoAtual = { fornecedor: normalizarNomeFornecedor(item.fornecedor), codFor: codigoFornecedor };
            historico.fornecedorCodigos = [
                relacaoAtual,
                ...relacoesAtuais.filter((relacao) => !(
                    normalizarTexto(relacao.fornecedor) === normalizarTexto(item.fornecedor)
                    && normalizarCodigoFornecedor(relacao.codFor) === codigoFornecedor
                ))
            ].slice(0, SUPPLIER_RELATION_LIMIT);
        }
    }

    localStorage.setItem(MANUAL_HISTORY_KEY, JSON.stringify(historico));
    atualizarSugestoesHistorico();
    atualizarCodigosDoFornecedor(document.getElementById('mFornecedor')?.value || '');
};

const importarRelacoesDosDados = (dados) => {
    const itens = dados && typeof dados === 'object' ? Object.values(dados) : [];
    const relacoes = itens
        .filter((item) => item && item.fornecedor && item.codFor)
        .map((item) => ({ fornecedor: normalizarNomeFornecedor(item.fornecedor), codFor: normalizarCodigoFornecedor(item.codFor) }))
        .filter((item) => item.codFor);
    if (!relacoes.length) return;

    const historico = obterHistoricoManual();
    const relacoesAtuais = historico.fornecedorCodigos || [];
    const todasRelacoes = [...relacoes, ...relacoesAtuais];
    historico.fornecedorCodigos = todasRelacoes.filter((relacao, indice, lista) => lista.findIndex((item) => (
        normalizarTexto(item.fornecedor) === normalizarTexto(relacao.fornecedor)
        && normalizarTexto(item.codFor) === normalizarTexto(relacao.codFor)
    )) === indice).slice(0, SUPPLIER_RELATION_LIMIT);
    localStorage.setItem(MANUAL_HISTORY_KEY, JSON.stringify(historico));
    atualizarSugestoesHistorico();
    atualizarCodigosDoFornecedor(document.getElementById('mFornecedor')?.value || '');
};

const atualizarLabelBotaoTema = (tema) => {
    const botaoTema = document.getElementById('btnThemeToggle');
    if (!botaoTema) return;

    botaoTema.innerHTML = tema === 'dark'
        ? '<i class="fas fa-sun"></i> Modo claro'
        : '<i class="fas fa-moon"></i> Modo escuro';
};

const aplicarTema = (tema) => {
    document.documentElement.setAttribute('data-theme', tema);
    atualizarLabelBotaoTema(tema);
};

const inicializarTema = () => {
    const temaSalvo = localStorage.getItem(THEME_STORAGE_KEY);
    const temaInicial = temaSalvo === 'dark' ? 'dark' : 'light';
    aplicarTema(temaInicial);
};

const alternarTema = () => {
    const temaAtual = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const proximoTema = temaAtual === 'dark' ? 'light' : 'dark';

    aplicarTema(proximoTema);
    localStorage.setItem(THEME_STORAGE_KEY, proximoTema);
};

const getMesAtualSistema = () => {
    const now = new Date();
    return listaMeses[now.getMonth()];
};

const setFiltroMesAtual = () => {
    const filtro = document.getElementById('mesFiltro');
    if (!filtro) return;
    const mesAtual = getMesAtualSistema();
    if (listaMeses.includes(mesAtual)) {
        filtro.value = mesAtual;
    }
};

export const initUI = () => {
    inicializarTema();
    setFiltroMesAtual();
    atualizarSugestoesHistorico();

    // Event listeners
    document.getElementById('btnLogin').addEventListener('click', handleLogin);
    document.getElementById('btnCadastrar').addEventListener('click', abrirModalCadastro);
    document.getElementById('btnEsqueciSenha').addEventListener('click', abrirModalRedefinir);
    document.getElementById('btnRedEnviar').addEventListener('click', handleEsqueciSenha);
    document.getElementById('btnRedCancelar').addEventListener('click', fecharModalRedefinir);
    document.getElementById('btnCadConfirmar').addEventListener('click', handleCadastrar);
    document.getElementById('btnCadCancelar').addEventListener('click', fecharModalCadastro);
    document.getElementById('cadSenha').addEventListener('input', atualizarRegrasSenha);
    atualizarRegrasSenha();
    document.getElementById('btnLogout').addEventListener('click', handleLogout);
    document.getElementById('btnThemeToggle').addEventListener('click', alternarTema);
    document.getElementById('btnSalvarManual').addEventListener('click', handleSalvarManual);
    document.getElementById('mFornecedor').addEventListener('input', (event) => {
        if (!event.target.value.trim()) {
            document.getElementById('mCodFor').value = '';
        }
        atualizarCodigosDoFornecedor(event.target.value);
    });
    document.getElementById('mCodFor').addEventListener('input', (event) => {
        const codigo = normalizarCodigoFornecedor(event.target.value);
        if (!event.target.value.trim()) {
            document.getElementById('mFornecedor').value = '';
        }
        if (codigo && event.target.value !== codigo) {
            event.target.value = codigo;
        }
        atualizarFornecedoresDoCodigo(codigo || event.target.value);
    });
    document.getElementById('csvInput').addEventListener('change', handleCSVImport);
    document.getElementById('btnCleanup').addEventListener('click', handleCleanupImport);
    document.getElementById('mesFiltro').addEventListener('change', renderizarDados);
    document.getElementById('filtroLocal').addEventListener('change', renderizarDados);
    document.getElementById('inputBusca').addEventListener('input', renderizarDados);
};

let cancelarDados = null;

export const onLogin = () => {
    cancelarDados = carregarDados(setDados, async () => {
        if (!cancelarDados) return;
        mostrarAviso('Usuário sem acesso liberado. Solicite a liberação à TI informando seu e-mail.');
        await handleLogout();
    });
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('appContent').style.display = 'block';
    showLoading();
    renderizarDados();
    hideLoading();
};

export const onLogout = () => {
    if (cancelarDados) cancelarDados();
    cancelarDados = null;
    dadosCarregados = {};
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPass').value = '';
    document.getElementById('loginOverlay').style.display = 'flex';
    document.getElementById('appContent').style.display = 'none';
};

const handleLogin = async () => {
    const email = document.getElementById('loginEmail').value;
    const senha = document.getElementById('loginPass').value;
    try {
        await login(email, senha);
    } catch (error) {
        mostrarErro(error.message);
    }
};

const atualizarRegrasSenha = () => {
    const senha = document.getElementById('cadSenha').value;
    const lista = document.getElementById('regrasSenha');
    lista.innerHTML = '';
    REGRAS_SENHA.forEach((regra) => {
        const li = document.createElement('li');
        li.textContent = regra.texto;
        if (regra.ok(senha)) li.classList.add('ok');
        lista.appendChild(li);
    });
};

const abrirModalCadastro = () => {
    document.getElementById('cadEmail').value = document.getElementById('loginEmail').value;
    document.getElementById('cadSenha').value = '';
    document.getElementById('cadSenha2').value = '';
    atualizarRegrasSenha();
    document.getElementById('cadastroOverlay').style.display = 'flex';
    document.getElementById('cadEmail').focus();
};

const fecharModalCadastro = () => {
    document.getElementById('cadastroOverlay').style.display = 'none';
};

const abrirModalRedefinir = () => {
    document.getElementById('redEmail').value = document.getElementById('loginEmail').value;
    document.getElementById('redefinirOverlay').style.display = 'flex';
    document.getElementById('redEmail').focus();
};

const fecharModalRedefinir = () => {
    document.getElementById('redefinirOverlay').style.display = 'none';
};

const handleEsqueciSenha = async () => {
    const email = document.getElementById('redEmail').value;
    try {
        await redefinirSenha(email);
        fecharModalRedefinir();
        mostrarSucesso('Se o e-mail estiver cadastrado, enviamos um link para redefinir a senha. Verifique também o spam.');
    } catch (error) {
        mostrarErro(error.message);
    }
};

const handleCadastrar = async () => {
    const email = document.getElementById('cadEmail').value;
    const senha = document.getElementById('cadSenha').value;
    if (senha !== document.getElementById('cadSenha2').value) {
        mostrarErro('As senhas não conferem');
        return;
    }
    if (!senhaValida(senha)) {
        mostrarAviso(`A senha não atende aos requisitos. Falta: ${requisitosFaltantes(senha).join('; ')}`);
        return;
    }
    try {
        await registrar(email, senha);
        fecharModalCadastro();
        mostrarSucesso('Cadastro realizado. Enviamos um link de confirmação ao seu e-mail; confirme-o e depois faça login.');
    } catch (error) {
        mostrarErro(error.message);
    }
};

const handleLogout = async () => {
    try {
        await logout();
    } catch (error) {
        mostrarErro('Erro ao fazer logout');
    }
};

const handleSalvarManual = async () => {
    const item = {
        tipo: document.getElementById('mTipo').value,
        local: document.getElementById('mLocal').value,
        pedido: document.getElementById('mPedido').value,
        codFor: normalizarCodigoFornecedor(document.getElementById('mCodFor').value),
        fornecedor: document.getElementById('mFornecedor').value.toUpperCase(),
        cc: document.getElementById('mCC').value,
        valor: parseMoeda(document.getElementById('mValor').value),
        vencimento: document.getElementById('mVenc').value,
        pagamento: document.getElementById('mPagamento').value,
        status: "Pendente",
        mes: document.getElementById('mesFiltro').value
    };

    // Validação básica
    if (!item.fornecedor) {
        mostrarErro('Fornecedor é obrigatório');
        return;
    }
    if (item.codFor && !normalizarCodigoFornecedor(item.codFor)) {
        mostrarErro('O código do fornecedor deve ter exatamente 6 números');
        return;
    }
    if (!validarValor(item.valor)) {
        mostrarErro('Valor inválido');
        return;
    }
    if (item.vencimento && !validarData(item.vencimento)) {
        mostrarErro('Data de vencimento inválida (formato DD/MM)');
        return;
    }

    try {
        await salvarItem(item);
        salvarNoHistoricoManual(item);
        mostrarSucesso('Item salvo com sucesso');
        // Limpar campos
        ["mPedido", "mCodFor", "mFornecedor", "mCC", "mValor", "mVenc"].forEach(id => document.getElementById(id).value = "");
    } catch (error) {
        mostrarErro(error.message);
    }
};

const handleCSVImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const csvText = e.target.result;
            const dados = parseCSV(csvText);
            const mesAtual = document.getElementById('mesFiltro').value;

            console.log('=== INICIANDO IMPORTAÇÃO CSV ===');
            console.log(`Total de linhas: ${dados.length}`);
            console.log(`Mês selecionado: ${mesAtual}`);
            console.log('Primeiras linhas:', dados.slice(0, 2));

            let processados = 0;
            let ignorados = 0;
            let erros = [];
            let pedidosProcessados = {}; // Rastrear pedidos nesta importação
            let pedidosDuplicados = []; // Rastrear duplicatas

            for (let idx = 0; idx < dados.length; idx++) {
                const linha = dados[idx];
                
                try {
                    // Extrair apenas os campos especificados do novo modelo CSV
                    const codigoFilial = (linha.Filial || '').trim();
                    const nomeFilial = deParaFilial[codigoFilial];
                    const pedido = (linha['Nº PC'] || linha['NC PC'] || linha['Numero PC'] || '').trim();
                    const codFor = (linha['Cod. Fornecedor'] || linha['CodFornecedor'] || '').trim();
                    const fornecedor = (linha.Fornecedor || '').trim().toUpperCase();
                    const cc = (linha['C. Custos'] || linha['C.Custos'] || linha['C. de custos'] || '').trim();
                    const valor = parseMoeda(linha.Valor);

                    console.log(`\nLinha ${idx + 1}:`, {
                        codigoFilial,
                        nomeFilial,
                        pedido,
                        codFor,
                        fornecedor: fornecedor.substring(0, 30),
                        cc,
                        valor,
                        linhaRaw: linha
                    });

                    // Validar campos obrigatórios
                    if (!codigoFilial) {
                        erros.push(`Linha ${idx + 1}: Filial vazia`);
                        ignorados++;
                        continue;
                    }

                    if (!nomeFilial) {
                        erros.push(`Linha ${idx + 1}: Filial desconhecida (${codigoFilial}) - Verifique o código`);
                        ignorados++;
                        continue;
                    }

                    if (!pedido) {
                        erros.push(`Linha ${idx + 1}: Nº PC vazio`);
                        ignorados++;
                        continue;
                    }

                    if (!codFor) {
                        erros.push(`Linha ${idx + 1}: Cod. Fornecedor vazio (PC: ${pedido})`);
                        ignorados++;
                        continue;
                    }

                    if (!fornecedor) {
                        erros.push(`Linha ${idx + 1}: Fornecedor vazio (PC: ${pedido})`);
                        ignorados++;
                        continue;
                    }

                    if (!valor || isNaN(valor) || valor <= 0) {
                        erros.push(`Linha ${idx + 1}: Valor inválido (${linha.Valor}) para PC ${pedido}`);
                        ignorados++;
                        continue;
                    }

                    if (!cc) {
                        erros.push(`Linha ${idx + 1}: Centro de Custos vazio (PC: ${pedido})`);
                        ignorados++;
                        continue;
                    }

                    // ===== VERIFICAÇÃO DE DUPLICAÇÃO =====
                    // Verificar se o pedido já existe no Firebase
                    const pedidoExistente = await verificarPedidoExistente(pedido, mesAtual);
                    
                    if (pedidoExistente) {
                        // Se o pedido existe, verificar se é do mesmo fornecedor
                        if (pedidoExistente.fornecedor !== fornecedor) {
                            erros.push(`Linha ${idx + 1}: Pedido ${pedido} já existe com fornecedor diferente (${pedidoExistente.fornecedor}) - não é permitido múltiplos fornecedores para o mesmo pedido`);
                            ignorados++;
                            continue;
                        } else {
                            // Mesmo pedido, mesmo fornecedor = duplicata
                            erros.push(`Linha ${idx + 1}: Pedido ${pedido} do fornecedor ${fornecedor} já foi importado - duplicata ignorada`);
                            ignorados++;
                            pedidosDuplicados.push({ pedido, fornecedor });
                            continue;
                        }
                    }

                    // Verificar se o pedido já foi processado nesta importação
                    if (pedidosProcessados[pedido]) {
                        // Se foi processado, verificar se é do mesmo fornecedor
                        if (pedidosProcessados[pedido] !== fornecedor) {
                            erros.push(`Linha ${idx + 1}: Pedido ${pedido} aparece múltiplas vezes neste arquivo com fornecedores diferentes - não é permitido`);
                            ignorados++;
                            continue;
                        } else {
                            // Mesmo pedido, mesmo fornecedor = duplicata neste arquivo
                            erros.push(`Linha ${idx + 1}: Pedido ${pedido} aparece múltiplas vezes neste arquivo - duplicata ignorada`);
                            ignorados++;
                            pedidosDuplicados.push({ pedido, fornecedor });
                            continue;
                        }
                    }

                    // Registrar o pedido como processado
                    pedidosProcessados[pedido] = fornecedor;

                    // Criar novo item com os campos da importação
                    const item = {
                        tipo: "SERVICO",  // Padrão para importação CSV
                        local: nomeFilial,
                        pedido: pedido,
                        codFor: codFor,
                        fornecedor: fornecedor,
                        cc: cc,
                        valor: valor,
                        vencimento: "",
                        pagamento: "BOLETO",
                        status: "Pendente",
                        mes: mesAtual,
                        dataImportacao: new Date().toISOString()
                    };

                    // Salvar item
                    await salvarItem(item);
                    processados++;
                    console.log(`✓ Linha ${idx + 1} processada com sucesso`);

                } catch (error) {
                    const msg = `Linha ${idx + 1}: Erro - ${error.message}`;
                    erros.push(msg);
                    ignorados++;
                    console.error(msg, linha, error);
                }
            }

            console.log('\n=== RESUMO DA IMPORTAÇÃO ===');
            console.log(`✓ Processados: ${processados}`);
            console.log(`✗ Ignorados: ${ignorados}`);
            console.log(`Duplicatas detectadas: ${pedidosDuplicados.length}`);
            console.log(`Erros: `, erros);

            // Exibir resultados
            let mensagem = `RESUMO DA IMPORTAÇÃO:\n\n✓ ${processados} lançamentos importados com sucesso`;
            
            if (pedidosDuplicados.length > 0) {
                mensagem += `\n⚠️ ${pedidosDuplicados.length} pedidos duplicados foram ignorados (já existentes)`;
            }

            if (ignorados > 0) {
                mensagem += `\n✗ ${ignorados} linhas ignoradas`;
                if (erros.length > 0) {
                    mensagem += '\n\nMotivos dos erros:';
                    erros.slice(0, 5).forEach(err => mensagem += '\n• ' + err);
                    if (erros.length > 5) {
                        mensagem += `\n... e mais ${erros.length - 5} erros (veja console para detalhes completos)`;
                    }
                }
            }

            if (processados > 0) {
                mostrarSucesso(mensagem);
            } else if (ignorados > 0) {
                mostrarAviso(mensagem);
            } else {
                mostrarSucesso(mensagem);
            }

            // Limpar o input de arquivo para permitir reimportar o mesmo arquivo sem recarregar a página
            const csvInput = document.getElementById('csvInput');
            if (csvInput) csvInput.value = '';

        } catch (error) {
            console.error('Erro geral na importação:', error);
            mostrarErro(`Erro ao processar arquivo: ${error.message}`);
            const csvInput = document.getElementById('csvInput');
            if (csvInput) csvInput.value = '';
        }
    };
    reader.readAsText(file);
};

const handleCleanupImport = async () => {
    const mesAtual = document.getElementById('mesFiltro').value;

    abrirConfirmacao(
        'ATENÇÃO',
        `Você está prestes a DELETAR TODOS os lançamentos de ${mesAtual}.\n\nEsta ação não pode ser desfeita!`,
        async () => {
            // Deletar TODOS os itens do mês selecionado
            const itensParaRemover = Object.entries(dadosCarregados)
                .map(([id, item]) => ({ id, ...item }))
                .filter(item => item.mes === mesAtual);

            if (itensParaRemover.length === 0) {
                mostrarErro(`Nenhum lançamento encontrado para ${mesAtual}.`);
                return;
            }

            let removidos = 0;
            let erros = 0;
            
            console.log(`Iniciando limpeza de ${itensParaRemover.length} registros para ${mesAtual}`);
            
            for (const item of itensParaRemover) {
                try {
                    await removerItem(item.id);
                    removidos++;
                } catch (error) {
                    erros++;
                    console.error('Erro ao remover item:', item.id, error);
                }
            }

            let mensagem = `✓ ${removidos} lançamentos removidos de ${mesAtual}`;
            if (erros > 0) {
                mensagem += `\n⚠️ ${erros} erros durante a limpeza`;
            }
            
            console.log(`Limpeza concluída: ${removidos} removidos, ${erros} erros`);
            mostrarSucesso(mensagem);
            
            // Recarregar dados
            renderizarDados();
        },
        'EXCLUIR',
        'CANCELAR'
    );
};

const getGrupoExibicao = (item) => {
    if (item.status === 'Enviado ao CSC') return 3;
    if (item.pedido && String(item.pedido).trim() !== '') return 1;
    return 2;
};

const getTextoGrupo = (group) => {
    if (group === 1) return 'Notas com Nº PC';
    if (group === 2) return 'Notas Pendentes';
    return 'Notas enviadas ao CSC';
};

const criarLinhaGrupo = (texto, colSpan = 10) => {
    const tr = document.createElement('tr');
    tr.className = 'table-group-row';
    tr.innerHTML = `<td colspan="${colSpan}">${esc(texto)}</td>`;
    return tr;
};

export const renderizarDados = () => {
    if (!dadosCarregados) return;

    const mesAtu = document.getElementById('mesFiltro').value;
    const localF = document.getElementById('filtroLocal').value;
    const busca = document.getElementById('inputBusca').value.toLowerCase();

    const itens = Object.keys(dadosCarregados).map(id => ({ id, ...dadosCarregados[id] }))
        .filter(i => {
            const termo = String((i.pedido || "") + (i.fornecedor || "") + (i.codFor || "")).toLowerCase();
            return i.mes === mesAtu && (localF === "TODOS" || i.local === localF) && termo.includes(busca);
        })
        .sort((a, b) => {
            const ga = getGrupoExibicao(a);
            const gb = getGrupoExibicao(b);
            if (ga !== gb) return ga - gb;
            if (ga === 1) {
                return String(a.pedido || '').localeCompare(String(b.pedido || ''), undefined, { numeric: true, sensitivity: 'base' }) || String(a.fornecedor || '').localeCompare(String(b.fornecedor || ''), undefined, { sensitivity: 'base' });
            }
            return String(a.fornecedor || '').localeCompare(String(b.fornecedor || ''), undefined, { sensitivity: 'base' });
        });

    const tServ = document.getElementById('tabelaServico');
    const tProd = document.getElementById('tabelaProduto');
    tServ.innerHTML = ""; tProd.innerHTML = "";

    const servicos = itens.filter(item => item.tipo === "SERVICO");
    const produtos = itens.filter(item => item.tipo === "PRODUTO");

    let pVal = 0, eVal = 0, pCount = 0, eCount = 0;
    let pCountServico = 0, pCountProduto = 0;

    const renderGrupo = (lista, container) => {
        let ultimoGrupo = null;
        lista.forEach(item => {
            const grupo = getGrupoExibicao(item);
            if (grupo !== ultimoGrupo) {
                container.appendChild(criarLinhaGrupo(getTextoGrupo(grupo), 10));
                ultimoGrupo = grupo;
            }

            const isEnv = item.status === "Enviado ao CSC";
            if (!isEnv) {
                pVal += item.valor;
                pCount++;
                if (item.tipo === "SERVICO") {
                    pCountServico++;
                } else if (item.tipo === "PRODUTO") {
                    pCountProduto++;
                }
            } else {
                eVal += item.valor;
                eCount++;
            }
            const tr = document.createElement('tr');
            tr.classList.add(`row-grupo-${grupo}`);
            if (isEnv) tr.classList.add('row-enviada');

            const tdPedido = `<td class="col-pedido"><input type="text" value="${esc(item.pedido)}" class="input-tabela" onblur="atualizarCampo('${esc(item.id)}', 'pedido', this.value)"></td>`;
            const tdValor = `<td class="col-valor">R$ <input type="text" value="${fmtMoeda(item.valor)}" class="input-tabela col-valor" onblur="atualizarCampo('${esc(item.id)}', 'valor', this.value)"></td>`;

            const tdPagamento = `<td>
                    <select class="input-tabela" onchange="atualizarCampo('${esc(item.id)}', 'pagamento', this.value)">
                        <option value="BOLETO" ${item.pagamento === 'DEPOSITO' ? '' : 'selected'}>Boleto</option>
                        <option value="DEPOSITO" ${item.pagamento === 'DEPOSITO' ? 'selected' : ''}>Deposito</option>
                    </select>
                </td>`;

            const htmlBase = `
                <td>${esc(item.local)}</td>
                ${tdPedido}
                <td class="col-codfor">${esc(item.codFor)}</td>
                <td>${esc(item.fornecedor)}</td>
                <td class="col-cc">${esc(item.cc)}</td>
                ${tdValor}
                <td class="col-venc"><input type="text" value="${esc(item.vencimento)}" class="input-tabela" onblur="atualizarCampo('${esc(item.id)}', 'vencimento', this.value)"></td>
                ${tdPagamento}
                <td><span class="status-badge ${isEnv ? 'status-enviado' : 'status-pendente'}">${esc(item.status)}</span></td>`;

            const acoes = `<td>
                <button onclick="abrirModalItem('${esc(item.id)}')" class="btn-acao">
                    <i class="fas ${item.tipo === 'SERVICO' ? 'fa-paper-plane' : 'fa-copy'}"></i>
                </button>
                <button onclick="removerItemUI('${esc(item.id)}')" class="btn-acao-del"><i class="fas fa-trash"></i></button>
            </td>`;

            tr.innerHTML = htmlBase + acoes;
            container.appendChild(tr);
        });
    };

    renderGrupo(servicos, tServ);
    renderGrupo(produtos, tProd);

    document.getElementById('totalPendente').innerText = "R$ " + fmtMoeda(pVal);
    document.getElementById('totalEnviado').innerText = "R$ " + fmtMoeda(eVal);
    document.getElementById('countPendente').innerHTML = `Total: ${pCount} notas<br>Serviço: ${pCountServico}<br>Produto: ${pCountProduto}`;
    document.getElementById('countEnviado').innerText = eCount + " notas";



    // Botão aprovação
    document.getElementById('btnAprovacao').onclick = () => {
        const alto = itens.filter(i => i.valor >= 10000 && i.status === "Pendente");
        if (alto.length === 0) return mostrarErro("Nenhuma nota > 10k pendente.");
        
        let corpoEmail = "Juliana, tudo bem?\n\nSegue abaixo os pedidos aguardando aprovação:\n\n";
        
        alto.forEach(i => {
            corpoEmail += `${i.local} - Pedido: ${i.pedido || ''} - Fornecedor: ${i.codFor || ''} - ${i.fornecedor} - Valor: R$ ${fmtMoeda(i.valor)} - C/C: ${i.cc || ''} - Venc.: ${i.vencimento || ''}.\n`;
        });

        window.location.href = `mailto:${emails.aprovacao}?cc=${emails.ccAprovacao}&subject=Pedidos aguardando aprovação&body=${encodeURIComponent(corpoEmail)}`;
    };
};

export const setDados = (dados) => {
    dadosCarregados = dados;
    importarRelacoesDosDados(dados);
    renderizarDados();
};

// Funções globais para onblur e onclick
window.atualizarCampo = async (id, campo, valor) => {
    try {
        const valorFinal = (campo === 'valor') ? parseMoeda(valor) : valor;
        await atualizarItem(id, campo, valorFinal);
    } catch (error) {
        mostrarErro(error.message);
    }
};

window.abrirModalItem = async (id) => {
    try {
        const item = await obterItem(id);
        const corpoEmail = gerarTextoEmail(item);
        const assunto = `Enc. ${item.local} - Pedido: ${item.pedido || ''} - Fornecedor: ${item.codFor || ''} - ${item.fornecedor} - Valor: R$ ${fmtMoeda(item.valor)} - C/C: ${item.cc || ''} - Venc.: ${item.vencimento || ''}`;

        if (item.tipo === 'SERVICO') {
            abrirModal("Tratar Serviço", corpoEmail, [
                { txt: "ENVIAR E-MAIL", cl: "btn-primary-modal", fn: () => {
                    window.location.href = `mailto:${emails.servicos}?cc=${emails.ccServicos}&subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpoEmail)}`;
                    atualizarItem(id, 'status', 'Enviado ao CSC');
                    fecharModal();
                }},
                { txt: "MARCAR COMO ENVIADO", cl: "btn-secondary-modal", fn: () => {
                    atualizarItem(id, 'status', 'Enviado ao CSC');
                    fecharModal();
                }}
            ]);
        } else {
            const textoCopia = corpoEmail;
            abrirModal("Copiar Dados Produto", textoCopia, [
                { txt: "COPIAR E MARCAR", cl: "btn-primary-modal", fn: () => {
                    navigator.clipboard.writeText(textoCopia).then(() => {
                        mostrarSucesso("Mensagem copiada!");
                        atualizarItem(id, 'status', 'Enviado ao CSC');
                        fecharModal();
                    });
                }}
            ]);
        }
    } catch (error) {
        mostrarErro(error.message);
    }
};

window.removerItemUI = async (id) => {
    abrirConfirmacao(
        'EXCLUIR ITEM',
        'Deseja realmente excluir este item?',
        async () => {
            try {
                await removerItem(id);
                mostrarSucesso("Item removido");
            } catch (error) {
                mostrarErro(error.message);
            }
        },
        'EXCLUIR',
        'CANCELAR'
    );
};

const gerarTextoEmail = (c) => {
    const vFmt = fmtMoeda(c.valor);
    return `Bom dia! \n\nSegue Para Lançamento: \n${c.local} - Pedido: ${c.pedido || ''} - Fornecedor: ${c.codFor || ''} - ${c.fornecedor} - Valor: R$ ${vFmt} - C/C: ${c.cc || ''} - Venc.: ${c.vencimento || ''} \n\nPagamento via: ${c.pagamento}.`;
};

const abrirModal = (t, p, btns) => {
    document.getElementById('modalTitle').innerText = t; 
    document.getElementById('modalPreview').innerText = p;
    const c = document.getElementById('modalActions'); c.innerHTML = "";
    btns.forEach(b => {
        const el = document.createElement('button'); el.innerText = b.txt; el.className = `modal-btn ${b.cl}`; el.onclick = b.fn; c.appendChild(el);
    });
    const bc = document.createElement('button'); bc.innerText = "CANCELAR"; bc.className = "modal-btn btn-secondary-modal"; bc.onclick = fecharModal; c.appendChild(bc);
    document.getElementById('modalApp').style.display = 'flex';
};

const fecharModal = () => {
    document.getElementById('modalApp').style.display = 'none';
};

const abrirConfirmacao = (titulo, mensagem, fnConfirmar, textoConfirmar = 'OK', textoCancelar = 'CANCELAR') => {
    abrirModal(titulo, mensagem, [
        { txt: textoConfirmar, cl: 'btn-primary-modal', fn: async () => {
            await fnConfirmar();
            fecharModal();
        }}
    ]);
};

const showLoading = () => {
    document.getElementById('loadingIndicator').style.display = 'block';
};

const hideLoading = () => {
    document.getElementById('loadingIndicator').style.display = 'none';
};
