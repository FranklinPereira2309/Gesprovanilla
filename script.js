
const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// === CONFIGURAÇÃO DO BANCO DE DADOS LOCAL ===
const userDataPath = ipcRenderer.sendSync('get-user-data-path');
const DB_FILE = path.join(userDataPath, 'database.json');

const db = {
    init: () => {
        try {
            if (!fs.existsSync(userDataPath)) {
                fs.mkdirSync(userDataPath, { recursive: true });
            }
            if (!fs.existsSync(DB_FILE)) {
                const initialData = { products: [], sales: [], users: [], quotes: [] };
                fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
            } else {
                const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
                if (!data.quotes) {
                    data.quotes = [];
                    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
                }
            }
        } catch (error) {
            console.error('Erro ao inicializar banco:', error);
        }
    },
    read: () => {
        try {
            const content = fs.readFileSync(DB_FILE, 'utf8');
            return JSON.parse(content);
        } catch (e) {
            return { products: [], sales: [], users: [], quotes: [] };
        }
    },
    save: (data) => {
        try {
            fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
            return true;
        } catch (e) {
            return false;
        }
    },
    getTable: (table) => {
        const data = db.read();
        return data[table] || [];
    },
    updateTable: (table, newData) => {
        const fullDb = db.read();
        fullDb[table] = newData;
        return db.save(fullDb);
    }
};

db.init();

// === ESTADO DO APLICATIVO ===
const state = {
    currentUser: JSON.parse(localStorage.getItem('active_user') || 'null'),
    activeTab: 'dashboard',
    products: [],
    sales: [],
    quotes: [],
    isRegistering: false,
    currentCart: [],
    currentQuoteItems: []
};

// === INICIALIZAÇÃO UI ===
document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    initNavigation();
    initForms();
    initGlobalExit();
    
    // Splash Screen Handler
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if(splash) {
            splash.classList.add('splash-fade-out');
            setTimeout(() => {
                splash.style.display = 'none';
            }, 800);
        }
    }, 2800);

    render();
});

function render() {
    const content = document.getElementById('content-area');
    const mainApp = document.getElementById('main-app');
    const loginScreen = document.getElementById('login-screen');

    if (!state.currentUser) {
        loginScreen.classList.remove('hidden');
        mainApp.classList.add('hidden');
        return;
    }

    loginScreen.classList.add('hidden');
    mainApp.classList.remove('hidden');
    
    document.getElementById('user-name').innerText = state.currentUser.name;
    document.getElementById('user-avatar').innerText = state.currentUser.name[0].toUpperCase();

    state.products = db.getTable('products');
    state.sales = db.getTable('sales');
    state.quotes = db.getTable('quotes');

    switch (state.activeTab) {
        case 'dashboard': renderDashboard(content); break;
        case 'inventory': renderInventory(content); break;
        case 'sales': renderSales(content); break;
        case 'quotes': renderQuotes(content); break;
    }
}

function initGlobalExit() {
    const quitAppAction = (e) => {
        e.preventDefault();
        if (confirm('Deseja realmente encerrar a aplicação GestorPro?')) {
            ipcRenderer.send('quit-app');
        }
    };
    document.getElementById('exit-login-btn').onclick = quitAppAction;
    document.getElementById('exit-app-btn').onclick = quitAppAction;
}

function initNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.activeTab = btn.dataset.tab;
            render();
        };
    });
}

function renderDashboard(container) {
    const revenue = state.sales.reduce((acc, s) => acc + s.totalPrice, 0);
    const stockVal = state.products.reduce((acc, p) => acc + (p.buyPrice * p.quantity), 0);
    const lowStockItems = state.products.filter(p => p.quantity <= 5);

    container.innerHTML = `
        <div class="space-y-4 animate-fade-in">
            <header>
                <h2 class="text-3xl font-black text-gray-800 tracking-tight">Painel de Controle</h2>
                <p class="text-gray-500 font-medium text-sm">Visão geral do negócio</p>
            </header>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                ${createStatCard('Vendas Realizadas', `R$ ${revenue.toFixed(2)}`, '💰', 'text-green-600')}
                ${createStatCard('Total de Produtos', state.products.length, '📦', 'text-blue-600')}
                ${createStatCard('Valor do Estoque Atual', `R$ ${stockVal.toFixed(2)}`, '🏛️', 'text-gray-700')}
                <div onclick="showCriticalItems()" class="glass win-shadow p-5 rounded-[2rem] border border-white transition-all hover:scale-[1.02] cursor-pointer hover:bg-amber-50">
                    <div class="text-2xl mb-1">⚠️</div>
                    <div class="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-tight">Itens Críticos</div>
                    <div class="text-2xl font-black text-amber-500">${lowStockItems.length}</div>
                </div>
            </div>
            <div class="grid grid-cols-1 gap-6">
                <div class="glass win-shadow p-6 rounded-[2rem] border border-white w-full overflow-hidden">
                    <h3 class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Análise de Quantidades em Estoque</h3>
                    <div class="h-60"><canvas id="chartStock"></canvas></div>
                </div>
            </div>
        </div>
    `;
    setTimeout(initCharts, 50);
}

function createStatCard(label, value, icon, colorClass) {
    return `
        <div class="glass win-shadow p-5 rounded-[2rem] border border-white transition-transform hover:scale-[1.02]">
            <div class="text-2xl mb-1">${icon}</div>
            <div class="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-tight">${label}</div>
            <div class="text-xl font-black ${colorClass}">${value}</div>
        </div>
    `;
}

function renderQuotes(container) {
    container.innerHTML = `
        <div class="space-y-6 animate-fade-in">
            <div class="flex justify-between items-end">
                <div>
                    <h2 class="text-3xl font-black text-gray-800 tracking-tight">Propostas e Orçamentos</h2>
                    <p class="text-gray-500 font-medium text-sm">Gerencie suas cotações de forma organizada e simétrica.</p>
                </div>
                <button id="btn-new-quote" class="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all">Novo Orçamento</button>
            </div>

            <div class="glass win-shadow rounded-[2rem] border border-white overflow-hidden">
                <table class="w-full text-left table-fixed border-collapse">
                    <thead class="bg-gray-50/50 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                        <tr>
                            <th class="px-5 py-5 w-[15%]">Data/Hora</th>
                            <th class="px-4 py-5 w-[25%]">Cliente</th>
                            <th class="px-4 py-5 text-center w-[20%]">Contato</th>
                            <th class="px-2 py-5 text-center w-[10%]">Itens</th>
                            <th class="px-4 py-5 text-right w-[12%]">Total</th>
                            <th class="px-5 py-5 text-right w-[18%]">Ações</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                        ${[...state.quotes].reverse().map(q => `
                            <tr class="hover:bg-white/40 transition-colors group">
                                <td class="px-5 py-4">
                                    <div class="text-[10px] text-gray-500 font-bold">${new Date(q.createdAt).toLocaleDateString('pt-BR')}</div>
                                    <div class="text-[9px] text-gray-400 font-black uppercase tracking-tight">${new Date(q.createdAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}</div>
                                </td>
                                <td class="px-4 py-4">
                                    <div class="text-[11px] font-bold text-gray-800 truncate" title="${q.customer || 'Consumidor'}">${q.customer || 'Consumidor'}</div>
                                </td>
                                <td class="px-4 py-4 text-center">
                                    <div class="text-[9px] font-bold text-gray-500 uppercase truncate">${q.customerPhone || '-'}</div>
                                    <div class="text-[8px] text-gray-400 truncate">${q.customerEmail || ''}</div>
                                </td>
                                <td class="px-2 py-4 text-center">
                                    <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-[10px] font-black text-gray-500">${q.items.length}</span>
                                </td>
                                <td class="px-4 py-4 font-black text-blue-600 text-xs text-right whitespace-nowrap">
                                    R$ ${q.totalPrice.toFixed(2)}
                                </td>
                                <td class="px-5 py-4 text-right">
                                    <div class="flex justify-end gap-3">
                                        <button onclick="printQuote('${q.id}')" class="text-blue-600 font-black text-[9px] uppercase hover:underline">Imprimir</button>
                                        <button onclick="editQuote('${q.id}')" class="text-gray-600 font-black text-[9px] uppercase hover:underline">Editar</button>
                                        <button onclick="deleteQuote('${q.id}')" class="text-red-400 font-black text-[9px] uppercase hover:underline">Excluir</button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ${state.quotes.length === 0 ? '<div class="p-20 text-center text-gray-400 italic text-sm">Nenhum orçamento salvo.</div>' : ''}
            </div>
        </div>
    `;

    document.getElementById('btn-new-quote').onclick = () => {
        state.currentQuoteItems = [];
        document.getElementById('quote-id').value = '';
        document.getElementById('q-customer').value = '';
        document.getElementById('q-email').value = '';
        document.getElementById('q-phone').value = '';
        document.getElementById('q-validity').value = '7';
        updateQuoteCartUI();
        const select = document.getElementById('q-product');
        select.innerHTML = '<option value="">Selecione um produto...</option>' + 
            state.products.map(p => `<option value="${p.id}">${p.description} - R$ ${p.sellPrice.toFixed(2)}</option>`).join('');
        document.getElementById('quote-modal').classList.remove('hidden');
    };
}

function initQuoteForms() {
    const btnAdd = document.getElementById('btn-add-to-quote');
    if(btnAdd) {
        btnAdd.onclick = () => {
            const prodId = document.getElementById('q-product').value;
            const qty = parseInt(document.getElementById('q-qty').value);
            if (!prodId || qty < 1) return;
            const prod = state.products.find(p => p.id === prodId);
            state.currentQuoteItems.push({
                id: prodId,
                description: prod.description,
                quantity: qty,
                price: prod.sellPrice,
                total: prod.sellPrice * qty
            });
            updateQuoteCartUI();
        };
    }

    const btnSave = document.getElementById('btn-save-quote');
    if(btnSave) {
        btnSave.onclick = () => {
            if (state.currentQuoteItems.length === 0) return alert('Adicione pelo menos um item à proposta.');
            const id = document.getElementById('quote-id').value;
            const quote = {
                id: id || Date.now().toString(),
                customer: document.getElementById('q-customer').value,
                customerEmail: document.getElementById('q-email').value,
                customerPhone: document.getElementById('q-phone').value,
                items: [...state.currentQuoteItems],
                totalPrice: state.currentQuoteItems.reduce((acc, i) => acc + i.total, 0),
                validity: document.getElementById('q-validity').value,
                createdAt: id ? state.quotes.find(q => q.id === id).createdAt : new Date().toISOString()
            };
            let quotes = db.getTable('quotes');
            if (id) quotes = quotes.map(q => q.id === id ? quote : q);
            else quotes.push(quote);
            db.updateTable('quotes', quotes);
            document.getElementById('quote-modal').classList.add('hidden');
            render();
        };
    }
}

function updateQuoteCartUI() {
    const list = document.getElementById('quote-items-list');
    if (!list) return;
    if (state.currentQuoteItems.length === 0) {
        list.innerHTML = '<div class="text-center py-10 text-gray-300 italic">Lista de itens vazia</div>';
        document.getElementById('quote-total-display').innerText = `R$ 0,00`;
        return;
    }

    list.innerHTML = state.currentQuoteItems.map((item, index) => `
        <div class="flex flex-col border-b border-gray-100 pb-2 mb-2 group">
            <div class="flex justify-between items-start">
                <div class="flex flex-col">
                    <span class="font-bold text-gray-800 uppercase">${item.description}</span>
                    <span class="text-[9px] text-gray-400 font-bold">${item.quantity} UN x R$ ${item.price.toFixed(2)}</span>
                </div>
                <div class="flex flex-col items-end">
                    <span class="font-black text-gray-900">R$ ${item.total.toFixed(2)}</span>
                    <button onclick="removeFromQuote(${index})" class="text-red-400 hover:text-red-600 text-[8px] font-black uppercase tracking-tighter mt-1 opacity-0 group-hover:opacity-100 transition-opacity">Remover</button>
                </div>
            </div>
        </div>
    `).join('');
    
    const total = state.currentQuoteItems.reduce((acc, i) => acc + i.total, 0);
    document.getElementById('quote-total-display').innerText = `R$ ${total.toFixed(2)}`;
}

window.removeFromQuote = (index) => {
    state.currentQuoteItems.splice(index, 1);
    updateQuoteCartUI();
};

window.editQuote = (id) => {
    const q = state.quotes.find(x => x.id === id);
    if (!q) return;
    state.currentQuoteItems = [...q.items];
    document.getElementById('quote-id').value = q.id;
    document.getElementById('q-customer').value = q.customer || '';
    document.getElementById('q-email').value = q.customerEmail || '';
    document.getElementById('q-phone').value = q.customerPhone || '';
    document.getElementById('q-validity').value = q.validity || '7';
    updateQuoteCartUI();
    const select = document.getElementById('q-product');
    select.innerHTML = '<option value="">Selecione um produto...</option>' + 
        state.products.map(p => `<option value="${p.id}">${p.description} - R$ ${p.sellPrice.toFixed(2)}</option>`).join('');
    document.getElementById('quote-modal').classList.remove('hidden');
};

window.deleteQuote = (id) => {
    if (confirm('Excluir este orçamento definitivamente?')) {
        db.updateTable('quotes', state.quotes.filter(q => q.id !== id));
        render();
    }
};

window.printQuote = (id) => {
    const q = state.quotes.find(x => x.id === id);
    if (!q) return;
    const printArea = document.getElementById('print-area');
    const dateStr = new Date(q.createdAt).toLocaleDateString();
    
    let html = `
        <div style="font-family: 'Inter', sans-serif; padding: 40px; color: #1a1a1a;">
            <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px;">
                <div>
                    <h1 style="margin: 0; color: #2563eb; font-weight: 900;">GESTORPRO</h1>
                    <p style="margin: 0; font-size: 10px; font-weight: 800; color: #64748b;">ORÇAMENTO LOCAL</p>
                </div>
                <div style="text-align: right;">
                    <p style="margin: 0; font-weight: 900;">Nº ${q.id.slice(-6)}</p>
                    <p style="margin: 0; font-size: 10px; color: #64748b;">Data: ${dateStr}</p>
                </div>
            </div>
            <div style="margin-bottom: 30px;">
                <p style="margin: 0; font-size: 10px; font-weight: 900; color: #2563eb; text-transform: uppercase;">Cliente</p>
                <p style="margin: 0; font-size: 16px; font-weight: 800;">${q.customer || 'Consumidor Final'}</p>
            </div>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                <thead style="border-bottom: 1px solid #e2e8f0;">
                    <tr>
                        <th style="text-align: left; padding: 10px 0; font-size: 10px;">DESCRIÇÃO</th>
                        <th style="text-align: center; padding: 10px 0; font-size: 10px;">QTD</th>
                        <th style="text-align: right; padding: 10px 0; font-size: 10px;">TOTAL</th>
                    </tr>
                </thead>
                <tbody>
                    ${q.items.map(i => `
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 10px 0; font-size: 11px; font-weight: 700;">${i.description}</td>
                            <td style="text-align: center; padding: 10px 0; font-size: 11px;">${i.quantity}</td>
                            <td style="text-align: right; padding: 10px 0; font-size: 11px; font-weight: 900;">R$ ${i.total.toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <div style="display: flex; justify-content: flex-end;">
                <div style="background: #2563eb; color: white; padding: 20px; border-radius: 12px; min-width: 200px; text-align: right;">
                    <p style="margin: 0; font-size: 10px; opacity: 0.8; font-weight: 800;">TOTAL ESTIMADO</p>
                    <p style="margin: 0; font-size: 24px; font-weight: 900;">R$ ${q.totalPrice.toFixed(2)}</p>
                </div>
            </div>
        </div>
    `;
    printArea.innerHTML = html;
    window.print();
};

function initForms() {
    initQuoteForms();
    const calc = () => {
        const buy = parseFloat(document.getElementById('p-buy').value) || 0;
        const margin = parseFloat(document.getElementById('p-margin').value) || 0;
        const sell = buy * (1 + margin/100);
        const sellDisplay = document.getElementById('p-sell-display');
        if(sellDisplay) sellDisplay.innerText = `R$ ${sell.toFixed(2)}`;
    };
    
    const pBuy = document.getElementById('p-buy');
    const pMargin = document.getElementById('p-margin');
    if(pBuy) pBuy.oninput = calc;
    if(pMargin) pMargin.oninput = calc;

    document.querySelectorAll('.close-modal').forEach(b => b.onclick = () => {
        document.querySelectorAll('.fixed.inset-0.z-\\[6000\\]').forEach(m => m.classList.add('hidden'));
    });

    const pForm = document.getElementById('product-form');
    if(pForm) {
        pForm.onsubmit = (e) => {
            e.preventDefault();
            const id = document.getElementById('product-id').value;
            const buy = parseFloat(document.getElementById('p-buy').value);
            const margin = parseFloat(document.getElementById('p-margin').value);
            const product = {
                id: id || Date.now().toString(),
                description: document.getElementById('p-desc').value,
                category: document.getElementById('p-cat').value,
                quantity: parseInt(document.getElementById('p-qty').value),
                buyPrice: buy,
                margin: margin,
                sellPrice: buy * (1 + margin/100)
            };
            let prods = db.getTable('products');
            if (id) prods = prods.map(p => p.id === id ? product : p);
            else prods.push(product);
            db.updateTable('products', prods);
            document.getElementById('product-modal').classList.add('hidden');
            render();
        };
    }

    const btnAddCart = document.getElementById('btn-add-to-cart');
    if(btnAddCart) {
        btnAddCart.onclick = () => {
            const prodId = document.getElementById('s-product').value;
            const qty = parseInt(document.getElementById('s-qty').value);
            if (!prodId || qty < 1) return alert('Selecione um produto');
            const prod = state.products.find(p => p.id === prodId);
            if (prod.quantity < qty) return alert('Estoque insuficiente');
            state.currentCart.push({ id: prodId, description: prod.description, quantity: qty, price: prod.sellPrice, total: prod.sellPrice * qty });
            updateCartUI();
        };
    }

    const saleForm = document.getElementById('sale-form');
    if(saleForm) {
        saleForm.onsubmit = (e) => {
            e.preventDefault();
            if (state.currentCart.length === 0) return;
            const sales = db.getTable('sales');
            const prods = db.getTable('products');
            state.currentCart.forEach(item => {
                const p = prods.find(x => x.id === item.id);
                if (p) p.quantity -= item.quantity;
            });
            sales.push({ id: Date.now(), items: [...state.currentCart], totalPrice: state.currentCart.reduce((acc, i) => acc + i.total, 0), paymentMethod: document.getElementById('s-pay').value, createdAt: new Date().toISOString() });
            db.updateTable('sales', sales);
            db.updateTable('products', prods);
            document.getElementById('sale-modal').classList.add('hidden');
            render();
        };
    }
}

function initAuth() {
    const authForm = document.getElementById('auth-form');
    const toggleBtn = document.getElementById('toggle-auth');
    if(toggleBtn) {
        toggleBtn.onclick = () => {
            state.isRegistering = !state.isRegistering;
            const nameField = document.getElementById('name-field');
            nameField.classList.toggle('hidden', !state.isRegistering);
            document.getElementById('login-subtitle').innerText = state.isRegistering ? 'Criar nova conta admin' : 'Bem-vindo de volta';
            authForm.querySelector('button[type="submit"]').innerText = state.isRegistering ? 'Cadastrar e Entrar' : 'Entrar';
        };
    }
    if(authForm) {
        authForm.onsubmit = (e) => {
            e.preventDefault();
            const email = document.getElementById('auth-email').value.trim();
            const pass = document.getElementById('auth-password').value;
            const users = db.getTable('users');
            if (state.isRegistering) {
                const name = document.getElementById('auth-name').value.trim();
                const newUser = { id: Date.now(), name, email, pass };
                users.push(newUser);
                db.updateTable('users', users);
                state.currentUser = newUser;
            } else {
                const user = users.find(u => u.email === email && u.pass === pass);
                if (!user) return alert('Credenciais inválidas');
                state.currentUser = user;
            }
            localStorage.setItem('active_user', JSON.stringify(state.currentUser));
            render();
        };
    }
    const logoutBtn = document.getElementById('logout-btn');
    if(logoutBtn) {
        logoutBtn.onclick = () => {
            localStorage.removeItem('active_user');
            state.currentUser = null;
            render();
        };
    }
}

function updateCartUI() {
    const list = document.getElementById('cart-items-list');
    if(!list) return;
    list.innerHTML = state.currentCart.map((item, index) => `
        <div class="flex flex-col border-b border-gray-100 pb-1 mb-1">
            <div class="flex justify-between font-bold"><span>${item.description.toUpperCase()}</span><span>R$ ${item.total.toFixed(2)}</span></div>
            <div class="flex justify-between text-gray-400"><span>${item.quantity} un x R$ ${item.price.toFixed(2)}</span><button onclick="removeFromCart(${index})" class="text-red-400 text-[8px]">Remover</button></div>
        </div>
    `).join('');
    const totalDisplay = document.getElementById('cart-total-display');
    if(totalDisplay) totalDisplay.innerText = `R$ ${state.currentCart.reduce((acc, i) => acc + i.total, 0).toFixed(2)}`;
}

window.removeFromCart = (index) => {
    state.currentCart.splice(index, 1);
    updateCartUI();
};

function initCharts() {
    const canvas = document.getElementById('chartStock');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dataSlice = state.products.sort((a,b) => b.quantity - a.quantity).slice(0, 10);
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dataSlice.map(p => p.description.substring(0, 8) + '...'),
            datasets: [{ data: dataSlice.map(p => p.quantity), backgroundColor: '#2563eb', borderRadius: 8 }]
        },
        options: { 
            maintainAspectRatio: false, 
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, grid: { display: false } }, x: { grid: { display: false } } }
        }
    });
}

function renderInventory(container) {
    container.innerHTML = `
        <div class="space-y-6 animate-fade-in">
            <div class="flex justify-between items-end">
                <div>
                    <h2 class="text-3xl font-black text-gray-800 tracking-tight">Estoque de Produtos</h2>
                    <p class="text-gray-500 font-medium">Controle total de mercadorias.</p>
                </div>
                <button id="btn-add-product" class="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all">Novo Produto</button>
            </div>
            <div class="glass win-shadow rounded-[2rem] border border-white overflow-hidden">
                <table class="w-full text-left">
                    <thead class="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        <tr>
                            <th class="px-8 py-5">Descrição</th>
                            <th class="px-6 py-5">Categoria</th>
                            <th class="px-6 py-5 text-center">Qtd</th>
                            <th class="px-6 py-5">Preço Venda</th>
                            <th class="px-8 py-5 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                        ${state.products.map(p => `
                            <tr class="hover:bg-white/40 transition-colors group">
                                <td class="px-8 py-4 font-bold text-gray-800">${p.description}</td>
                                <td class="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-tight">${p.category}</td>
                                <td class="px-6 py-4 text-center">
                                    <span class="px-3 py-1 rounded-full text-[10px] font-black ${p.quantity <= 5 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}">${p.quantity}</span>
                                </td>
                                <td class="px-6 py-4 font-black text-blue-600">R$ ${p.sellPrice.toFixed(2)}</td>
                                <td class="px-8 py-4 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onclick="editProduct('${p.id}')" class="text-blue-600 font-black text-[10px] mr-4 uppercase hover:underline">Editar</button>
                                    <button onclick="deleteProduct('${p.id}')" class="text-red-400 font-black text-[10px] uppercase hover:underline">Excluir</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    const btnAddProd = document.getElementById('btn-add-product');
    if(btnAddProd) {
        btnAddProd.onclick = () => {
            document.getElementById('product-form').reset();
            document.getElementById('product-id').value = '';
            document.getElementById('modal-title').innerText = 'Novo Produto';
            document.getElementById('p-sell-display').innerText = 'R$ 0,00';
            document.getElementById('product-modal').classList.remove('hidden');
        };
    }
}

window.editProduct = (id) => {
    const p = state.products.find(x => x.id === id);
    document.getElementById('product-id').value = p.id;
    document.getElementById('p-desc').value = p.description;
    document.getElementById('p-cat').value = p.category;
    document.getElementById('p-qty').value = p.quantity;
    document.getElementById('p-buy').value = p.buyPrice;
    document.getElementById('p-margin').value = p.margin;
    document.getElementById('p-sell-display').innerText = `R$ ${p.sellPrice.toFixed(2)}`;
    document.getElementById('modal-title').innerText = 'Editar Produto';
    document.getElementById('product-modal').classList.remove('hidden');
};

window.deleteProduct = (id) => {
    if (confirm('Deseja excluir este produto?')) {
        db.updateTable('products', state.products.filter(p => p.id !== id));
        render();
    }
};

function renderSales(container) {
    container.innerHTML = `
        <div class="space-y-6 animate-fade-in">
            <div class="flex justify-between items-end">
                <div>
                    <h2 class="text-3xl font-black text-gray-800 tracking-tight">Histórico de Vendas</h2>
                    <p class="text-gray-500 font-medium">Registro de saídas e faturamento.</p>
                </div>
                <div class="flex gap-3">
                    <button id="btn-new-sale" class="bg-green-600 text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-green-100 hover:bg-green-700 transition-all">Ponto de Venda</button>
                </div>
            </div>
            <div class="glass win-shadow rounded-[2rem] border border-white overflow-hidden">
                <table class="w-full text-left">
                    <thead class="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        <tr>
                            <th class="px-8 py-5">ID / Data</th>
                            <th class="px-6 py-5">Pagamento</th>
                            <th class="px-6 py-5 text-center">Itens</th>
                            <th class="px-6 py-5">Valor Total</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                        ${[...state.sales].reverse().map(s => `
                            <tr class="hover:bg-white/40 transition-colors">
                                <td class="px-8 py-4">
                                    <div class="text-[10px] font-black text-gray-400 uppercase">#${s.id}</div>
                                    <div class="font-bold text-gray-800 text-xs">${new Date(s.createdAt).toLocaleString()}</div>
                                </td>
                                <td class="px-6 py-4">
                                    <span class="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[9px] font-black uppercase">${s.paymentMethod}</span>
                                </td>
                                <td class="px-6 py-4 text-center text-[10px] font-black text-gray-400">${s.items.length}</td>
                                <td class="px-6 py-4 font-black text-green-600">R$ ${s.totalPrice.toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    const btnNewSale = document.getElementById('btn-new-sale');
    if(btnNewSale) {
        btnNewSale.onclick = () => {
            state.currentCart = [];
            updateCartUI();
            const select = document.getElementById('s-product');
            select.innerHTML = '<option value="">Selecione...</option>' + 
                state.products.filter(p => p.quantity > 0).map(p => `<option value="${p.id}">${p.description} - R$ ${p.sellPrice.toFixed(2)}</option>`).join('');
            document.getElementById('sale-modal').classList.remove('hidden');
        };
    }
}

function showCriticalItems() {
    const list = document.getElementById('critical-items-list');
    const critical = state.products.filter(p => p.quantity <= 5);
    list.innerHTML = critical.map(p => `
        <tr>
            <td class="px-6 py-4 font-bold text-gray-800">${p.description}</td>
            <td class="px-6 py-4 text-center font-black text-red-500">${p.quantity}</td>
        </tr>
    `).join('');
    document.getElementById('critical-modal').classList.remove('hidden');
}
