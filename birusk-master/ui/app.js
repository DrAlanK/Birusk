document.addEventListener('DOMContentLoaded', () => {
    const themeBtn = document.getElementById('theme-toggle');
    const sunIcon = document.querySelector('.sun-icon');
    const moonIcon = document.querySelector('.moon-icon');
    const html = document.documentElement;
    const contentArea = document.getElementById('content');
    const langSelect = document.getElementById('lang-selector');
    
    let currentTheme = localStorage.getItem('theme') || 'dark';
    let currentLang = localStorage.getItem('lang') || 'en';
    
    let usersData = [];
    let nodesData = [];

    const applyTheme = (theme) => {
        html.setAttribute('data-theme', theme);
        if (theme === 'dark') {
            sunIcon.style.display = 'block';
            moonIcon.style.display = 'none';
        } else {
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'block';
        }
    };
    
    applyTheme(currentTheme);
    
    themeBtn.addEventListener('click', () => {
        currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', currentTheme);
        applyTheme(currentTheme);
    });

    const applyLang = (lang) => {
        langSelect.value = lang;
        html.setAttribute('lang', lang);
        html.setAttribute('dir', (lang === 'fa' || lang === 'ku') ? 'rtl' : 'ltr');
        
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[lang] && translations[lang][key]) {
                el.textContent = translations[lang][key];
            } else if (translations[lang] && translations[lang][key] && el.placeholder !== undefined) {
                el.placeholder = translations[lang][key];
            }
        });
    };

    langSelect.addEventListener('change', (e) => {
        currentLang = e.target.value;
        localStorage.setItem('lang', currentLang);
        applyLang(currentLang);
        const activePage = document.querySelector('.nav-item.active').dataset.page;
        if(activePage) renderContent(activePage);
    });

    const sidebar = document.getElementById('sidebar');
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const overlay = document.querySelector('.overlay') || document.createElement('div');
    if(!document.querySelector('.overlay')) {
        overlay.className = 'overlay';
        document.body.appendChild(overlay);
    }

    const toggleMenu = () => {
        sidebar.classList.toggle('open');
        if (sidebar.classList.contains('open')) {
            overlay.style.display = 'block';
            setTimeout(() => overlay.style.opacity = '1', 10);
        } else {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.style.display = 'none', 300);
        }
    };

    mobileBtn.addEventListener('click', toggleMenu);
    overlay.addEventListener('click', toggleMenu);

    const formatBytes = (bytes) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const fetchData = async () => {
        try {
            const [uRes, nRes] = await Promise.all([
                fetch('/api/users'),
                fetch('/api/nodes')
            ]);
            usersData = await uRes.json() || [];
            nodesData = await nRes.json() || [];
        } catch (e) {
            console.error("API Error", e);
        }
    };

    const renderContent = async (page) => {
        contentArea.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-muted);">...</div>';
        await fetchData();

        let htmlContent = '';
        const t = translations[currentLang];

        if (page === 'dashboard') {
            const totalTraffic = usersData.reduce((acc, user) => acc + (user.used_data || 0), 0);
            const activeNodes = nodesData.filter(n => n.status === 'active').length;

            htmlContent = `
                <div class="grid-cards">
                    <div class="card">
                        <span class="card-title" data-i18n="card_total_users">${t.card_total_users}</span>
                        <span class="card-value">${usersData.length}</span>
                    </div>
                    <div class="card">
                        <span class="card-title" data-i18n="card_active_nodes">${t.card_active_nodes}</span>
                        <span class="card-value">${activeNodes}</span>
                    </div>
                    <div class="card">
                        <span class="card-title" data-i18n="card_network_traffic">${t.card_network_traffic}</span>
                        <span class="card-value">${formatBytes(totalTraffic)}</span>
                    </div>
                    <div class="card">
                        <span class="card-title" data-i18n="card_system_status">${t.card_system_status}</span>
                        <span class="card-value" style="color: #10b981;" data-i18n="status_online">${t.status_online}</span>
                    </div>
                </div>
            `;
        } 
        else if (page === 'users') {
            htmlContent = `
                <div class="card" style="margin-bottom: 20px; display: flex; flex-direction: row; gap: 12px; align-items: center;">
                    <input type="text" id="new-user-name" placeholder="Name..." style="padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-base); color: var(--text-main); flex: 1;">
                    <input type="number" id="new-user-limit" placeholder="Limit (GB)... 0=Unlimited" style="padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-base); color: var(--text-main); flex: 1;">
                    <button id="btn-create-user" style="padding: 10px 20px; border-radius: 8px; background: var(--primary); color: white; border: none; cursor: pointer; font-weight: 600;" data-i18n="btn_add_user">${t.btn_add_user}</button>
                </div>
                <div class="card" style="overflow-x: auto;">
                    <table style="width: 100%; text-align: left; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 1px solid var(--border);">
                                <th style="padding: 12px;" data-i18n="table_name">${t.table_name}</th>
                                <th style="padding: 12px;">UUID</th>
                                <th style="padding: 12px;" data-i18n="table_status">${t.table_status}</th>
                                <th style="padding: 12px;" data-i18n="table_usage">${t.table_usage}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${usersData.map(u => `
                                <tr style="border-bottom: 1px solid var(--border);">
                                    <td style="padding: 12px;">${u.name}</td>
                                    <td style="padding: 12px; font-family: monospace; font-size: 0.85rem; color: var(--text-muted);">${u.id}</td>
                                    <td style="padding: 12px;">
                                        <span style="background: ${u.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}; color: ${u.status === 'active' ? '#10b981' : '#ef4444'}; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">${u.status}</span>
                                    </td>
                                    <td style="padding: 12px;">${formatBytes(u.used_data)} / ${u.data_limit > 0 ? formatBytes(u.data_limit) : '∞'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
        else if (page === 'nodes') {
            htmlContent = `
                <div class="card" style="margin-bottom: 20px; display: flex; flex-direction: row; gap: 12px; align-items: center;">
                    <input type="text" id="new-node-name" placeholder="Node Name (e.g. CF-Worker-1)..." style="padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-base); color: var(--text-main); flex: 1;">
                    <select id="new-node-type" style="padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-base); color: var(--text-main);">
                        <option value="cloudflare">Cloudflare Worker</option>
                        <option value="railway">Railway Node</option>
                    </select>
                    <button id="btn-create-node" style="padding: 10px 20px; border-radius: 8px; background: var(--primary); color: white; border: none; cursor: pointer; font-weight: 600;" data-i18n="btn_add_node">${t.btn_add_node}</button>
                </div>
                <div class="card" style="overflow-x: auto;">
                    <table style="width: 100%; text-align: left; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 1px solid var(--border);">
                                <th style="padding: 12px;" data-i18n="table_name">${t.table_name}</th>
                                <th style="padding: 12px;">Type</th>
                                <th style="padding: 12px;">Token (Keep Secret)</th>
                                <th style="padding: 12px;" data-i18n="table_status">${t.table_status}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${nodesData.map(n => `
                                <tr style="border-bottom: 1px solid var(--border);">
                                    <td style="padding: 12px;">${n.name}</td>
                                    <td style="padding: 12px;">
                                        <span style="background: rgba(99,102,241,0.1); color: var(--primary); padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">${n.type.toUpperCase()}</span>
                                    </td>
                                    <td style="padding: 12px; font-family: monospace; font-size: 0.85rem; color: var(--text-muted); cursor: pointer;" onclick="navigator.clipboard.writeText('${n.token}'); alert('Token copied!');">
                                        ${n.token.substring(0, 8)}... (Click to copy)
                                    </td>
                                    <td style="padding: 12px;">
                                        <span style="background: ${n.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}; color: ${n.status === 'active' ? '#10b981' : '#ef4444'}; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">${n.status}</span>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        contentArea.innerHTML = htmlContent;
        applyLang(currentLang);
    };

    contentArea.addEventListener('click', async (e) => {
        if (e.target.id === 'btn-create-user') {
            const name = document.getElementById('new-user-name').value;
            const limitGb = parseFloat(document.getElementById('new-user-limit').value || 0);
            if (!name) return alert('Name is required');
            
            e.target.disabled = true;
            await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, data_limit: Math.floor(limitGb * 1024 * 1024 * 1024) })
            });
            renderContent('users');
        }
        
        if (e.target.id === 'btn-create-node') {
            const name = document.getElementById('new-node-name').value;
            const type = document.getElementById('new-node-type').value;
            if (!name) return alert('Node name is required');
            
            e.target.disabled = true;
            await fetch('/api/nodes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, type: type })
            });
            renderContent('nodes');
        }
    });

    const navItems = document.querySelectorAll('.nav-item');
    const pageTitle = document.getElementById('page-title');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            const page = item.dataset.page;
            const titleKey = 'nav_' + page;
            
            pageTitle.setAttribute('data-i18n', titleKey);
            if (translations[currentLang] && translations[currentLang][titleKey]) {
                pageTitle.textContent = translations[currentLang][titleKey];
            }
            
            renderContent(page);
            
            if (window.innerWidth <= 768) {
                toggleMenu();
            }
        });
    });

    applyLang(currentLang);
    renderContent('dashboard');
});