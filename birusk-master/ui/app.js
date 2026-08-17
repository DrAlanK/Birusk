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

    // تابع جدید برای کپی کردن لینک سابسکریپشن
    window.copySub = (id) => {
        const subLink = `${window.location.origin}/sub?id=${id}`;
        navigator.clipboard.writeText(subLink).then(() => {
            alert('Subscription link copied successfully!\nPaste it in v2rayNG, Streisand, V2rayN, etc.');
        }).catch(err => {
            alert('Failed to copy! Check console.');
        });
    };

    // تابع جدید برای کپی کردن توکن نود
    window.copyToken = (token) => {
        navigator.clipboard.writeText(token).then(() => {
            alert('Node Token copied! Use it in Cloudflare Worker.');
        });
    };

    const renderContent = async (page) => {
        contentArea.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-muted);">...</div>';
        await fetchData();

        let htmlContent = '';
        const t = translations[currentLang] || translations['en'];

        if (page === 'dashboard') {
            const totalTraffic = usersData.reduce((acc, user) => acc + (user.used_data || 0), 0);
            const activeNodes = nodesData.filter(n => n.status === 'active').length;

            htmlContent = `
                <div class="grid-cards">
                    <div class="card">
                        <span class="card-title" data-i18n="card_total_users">Total Users</span>
                        <span class="card-value">${usersData.length}</span>
                    </div>
                    <div class="card">
                        <span class="card-title" data-i18n="card_active_nodes">Active Nodes</span>
                        <span class="card-value">${activeNodes}</span>
                    </div>
                    <div class="card">
                        <span class="card-title" data-i18n="card_network_traffic">Network Traffic</span>
                        <span class="card-value">${formatBytes(totalTraffic)}</span>
                    </div>
                    <div class="card">
                        <span class="card-title" data-i18n="card_system_status">System Status</span>
                        <span class="card-value" style="color: #10b981;" data-i18n="status_online">Online</span>
                    </div>
                </div>
            `;
        } 
        else if (page === 'users') {
            htmlContent = `
                <div class="card" style="margin-bottom: 20px; display: flex; flex-direction: row; flex-wrap: wrap; gap: 12px; align-items: center;">
                    <input type="text" id="new-user-name" placeholder="Name..." style="padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-base); color: var(--text-main); flex: 1; min-width: 150px;">
                    <input type="number" id="new-user-limit" placeholder="Limit (GB)... 0=Unlimited" style="padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-base); color: var(--text-main); flex: 1; min-width: 150px;">
                    <button id="btn-create-user" style="padding: 10px 20px; border-radius: 8px; background: var(--primary); color: white; border: none; cursor: pointer; font-weight: 600;" data-i18n="btn_add_user">Add User</button>
                </div>
                <div class="card" style="overflow-x: auto;">
                    <table style="width: 100%; text-align: left; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 1px solid var(--border);">
                                <th style="padding: 12px;" data-i18n="table_name">Name</th>
                                <th style="padding: 12px;">UUID</th>
                                <th style="padding: 12px;" data-i18n="table_status">Status</th>
                                <th style="padding: 12px;" data-i18n="table_usage">Usage</th>
                                <th style="padding: 12px;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${usersData.map(u => `
                                <tr style="border-bottom: 1px solid var(--border);">
                                    <td style="padding: 12px; font-weight: bold;">${u.name}</td>
                                    <td style="padding: 12px; font-family: monospace; font-size: 0.85rem; color: var(--text-muted);">${u.id}</td>
                                    <td style="padding: 12px;">
                                        <span style="background: ${u.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}; color: ${u.status === 'active' ? '#10b981' : '#ef4444'}; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">${u.status}</span>
                                    </td>
                                    <td style="padding: 12px;">${formatBytes(u.used_data)} / ${u.data_limit > 0 ? formatBytes(u.data_limit) : '∞'}</td>
                                    <td style="padding: 12px;">
                                        <button onclick="copySub('${u.id}')" style="padding: 6px 12px; border-radius: 6px; background: #6366f1; color: white; border: none; cursor: pointer; font-weight: bold; font-size: 0.85rem;">Copy Sub</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
        else if (page === 'nodes') {
            htmlContent = `
                <div class="card" style="margin-bottom: 20px; display: flex; flex-direction: row; flex-wrap: wrap; gap: 12px; align-items: center;">
                    <input type="text" id="new-node-name" placeholder="Node Name..." style="padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-base); color: var(--text-main); flex: 1; min-width: 150px;">
                    <input type="text" id="new-node-address" placeholder="Domain or IP (e.g. worker.dev)" style="padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-base); color: var(--text-main); flex: 1; min-width: 150px;">
                    <select id="new-node-type" style="padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-base); color: var(--text-main);">
                        <option value="cloudflare">Cloudflare Worker</option>
                        <option value="railway">Railway Node</option>
                    </select>
                    <button id="btn-create-node" style="padding: 10px 20px; border-radius: 8px; background: var(--primary); color: white; border: none; cursor: pointer; font-weight: 600;" data-i18n="btn_add_node">Add Node</button>
                </div>
                <div class="card" style="overflow-x: auto;">
                    <table style="width: 100%; text-align: left; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 1px solid var(--border);">
                                <th style="padding: 12px;" data-i18n="table_name">Name</th>
                                <th style="padding: 12px;">Type</th>
                                <th style="padding: 12px;">Address</th>
                                <th style="padding: 12px;">Token (Keep Secret)</th>
                                <th style="padding: 12px;" data-i18n="table_status">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${nodesData.map(n => `
                                <tr style="border-bottom: 1px solid var(--border);">
                                    <td style="padding: 12px; font-weight: bold;">${n.name}</td>
                                    <td style="padding: 12px;">
                                        <span style="background: rgba(99,102,241,0.1); color: var(--primary); padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">${n.type.toUpperCase()}</span>
                                    </td>
                                    <td style="padding: 12px; font-family: monospace;">${n.address}</td>
                                    <td style="padding: 12px;">
                                        <button onclick="copyToken('${n.token}')" style="padding: 4px 8px; border-radius: 4px; background: #374151; color: white; border: none; cursor: pointer; font-size: 0.8rem;">Copy Token</button>
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
            e.target.innerText = '...';
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
            const address = document.getElementById('new-node-address').value;
            
            if (!name || !address) return alert('Node name and Address are required');
            
            e.target.disabled = true;
            e.target.innerText = '...';
            await fetch('/api/nodes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, type: type, address: address })
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