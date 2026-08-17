document.addEventListener('DOMContentLoaded', () => {
    const themeBtn = document.getElementById('theme-toggle');
    const html = document.documentElement;
    const contentArea = document.getElementById('content');
    const langSelect = document.getElementById('lang-selector');
    const sidebar = document.getElementById('sidebar');
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const pageTitle = document.getElementById('page-title');
    
    // --- تنظیمات تم ---
    let currentTheme = localStorage.getItem('theme') || 'dark';
    html.setAttribute('data-theme', currentTheme);
    
    themeBtn.addEventListener('click', () => {
        currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', currentTheme);
        html.setAttribute('data-theme', currentTheme);
    });

    // --- منوی موبایل ---
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    document.body.appendChild(overlay);

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

    // --- سیستم چند زبانه ---
    let currentLang = localStorage.getItem('lang') || 'en';
    
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

    // --- متغیرها و توابع کمکی ---
    let usersData = [];
    let nodesData = [];

    const formatBytes = (bytes) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatDate = (unix) => {
        if (!unix || unix === 0) return 'Unlimited / نامحدود';
        return new Date(unix * 1000).toLocaleDateString();
    };

    const fetchData = async () => {
        try {
            const [uRes, nRes] = await Promise.all([ fetch('/api/users'), fetch('/api/nodes') ]);
            usersData = await uRes.json() || [];
            nodesData = await nRes.json() || [];
        } catch (e) {
            console.error("API Error", e);
        }
    };

    window.copyText = (text, msg) => {
        navigator.clipboard.writeText(text).then(() => alert(msg)).catch(() => alert('Copy Failed!'));
    };

    // --- اکشن‌های مدیریتی یوزرها ---
    window.deleteUser = async (id) => {
        if(!confirm('Are you sure you want to delete this user? / آیا از حذف این کاربر مطمئن هستید؟')) return;
        await fetch(`/api/users?id=${id}`, { method: 'DELETE' });
        renderContent('users');
    };
    
    window.editUser = async (id, oldName, oldLimit, oldExpire) => {
        const name = prompt("Enter new name / نام جدید را وارد کنید:", oldName);
        if (!name) return;
        const limit = prompt("Enter new limit in GB (0 = Unlimited) / حجم جدید به گیگابایت (0 = نامحدود):", Math.floor(oldLimit / (1024**3)));
        const days = prompt("Enter valid days from today (0 = Unlimited) / تعداد روز اعتبار از امروز (0 = نامحدود):", "30");
        
        let expireTime = oldExpire;
        if (days !== null && parseInt(days) > 0) {
            expireTime = Math.floor(Date.now() / 1000) + (parseInt(days) * 86400);
        } else if (days !== null && parseInt(days) === 0) {
            expireTime = 0;
        }

        await fetch('/api/users', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, name, data_limit: Math.floor(parseFloat(limit||0) * 1024**3), expire_time: expireTime })
        });
        renderContent('users');
    };

    // --- اکشن‌های مدیریتی نودها ---
    window.deleteNode = async (id) => {
        if(!confirm('Are you sure you want to delete this node? / آیا از حذف این نود مطمئن هستید؟')) return;
        await fetch(`/api/nodes?id=${id}`, { method: 'DELETE' });
        renderContent('nodes');
    };

    window.editNode = async (id, oldName, oldAddr, oldCleanIP) => {
        const name = prompt("Enter new Node Name / نام جدید نود:", oldName);
        if (!name) return;
        const addr = prompt("Enter new Address (Domain) / دامنه یا آدرس جدید:", oldAddr);
        const cleanIP = prompt("Enter new Clean IP (Optional) / آی‌پی تمیز جدید (اختیاری):", oldCleanIP || "");
        
        await fetch('/api/nodes', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, name, address: addr, clean_ip: cleanIP })
        });
        renderContent('nodes');
    };

    // --- رندر کردن صفحات ---
    const renderContent = async (page) => {
        contentArea.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-muted);">Loading...</div>';
        await fetchData();

        let htmlContent = '';

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
                        <span class="card-value" style="color: var(--success);" data-i18n="status_online">Online</span>
                    </div>
                </div>
            `;
        } 
        else if (page === 'users') {
            htmlContent = `
                <div class="card" style="margin-bottom: 20px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center;">
                    <input type="text" id="u-name" placeholder="Name..." style="flex: 1; min-width: 150px;">
                    <input type="number" id="u-limit" placeholder="Limit GB (0=∞)" style="flex: 1; min-width: 120px;">
                    <input type="number" id="u-days" placeholder="Days Valid (0=∞)" style="flex: 1; min-width: 130px;">
                    <button id="btn-add-user" data-i18n="btn_add_user">+ Add User</button>
                </div>
                <div class="card" style="overflow-x: auto;">
                    <table>
                        <thead>
                            <tr>
                                <th data-i18n="table_name">Name</th>
                                <th data-i18n="table_usage">Usage / Limit</th>
                                <th>Expiry Date</th>
                                <th data-i18n="table_status">Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${usersData.map(u => `
                                <tr>
                                    <td style="font-weight:bold;">${u.name}</td>
                                    <td>${formatBytes(u.used_data)} / <span style="color:var(--text-muted);">${u.data_limit ? formatBytes(u.data_limit) : '∞'}</span></td>
                                    <td style="font-size:0.9rem;">${formatDate(u.expire_time)}</td>
                                    <td><span style="background: ${u.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}; color: ${u.status === 'active' ? 'var(--success)' : 'var(--danger)'}; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">${u.status}</span></td>
                                    <td style="display:flex; gap:8px; align-items:center;">
                                        <button onclick="copyText('${window.location.origin}/sub?id=${u.id}', 'Subscription Copied!')" style="padding:6px 12px; font-size:0.85rem;">Copy Sub</button>
                                        <button onclick="editUser('${u.id}', '${u.name}', ${u.data_limit}, ${u.expire_time})" style="padding:6px 12px; background:#3b82f6; font-size:0.85rem;">Edit</button>
                                        <button onclick="deleteUser('${u.id}')" class="btn-danger" style="padding:6px 12px; font-size:0.85rem;">Delete</button>
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
                <div class="card" style="margin-bottom: 20px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center;">
                    <input type="text" id="n-name" placeholder="Node Name" style="flex: 1; min-width: 150px;">
                    <input type="text" id="n-addr" placeholder="Domain (e.g. worker.dev)" style="flex: 1; min-width: 150px;">
                    <input type="text" id="n-clean" placeholder="Clean IP (Optional)" style="flex: 1; min-width: 150px;">
                    <select id="n-type" style="flex: 1; min-width: 150px;">
                        <option value="cloudflare">Cloudflare Worker</option>
                        <option value="railway">Railway Server</option>
                    </select>
                    <button id="btn-add-node" data-i18n="btn_add_node">+ Add Node</button>
                </div>
                <div class="card" style="overflow-x: auto;">
                    <table>
                        <thead>
                            <tr>
                                <th data-i18n="table_name">Name / Type</th>
                                <th>Address & Clean IP</th>
                                <th data-i18n="table_status">Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${nodesData.map(n => `
                                <tr>
                                    <td><strong>${n.name}</strong><br><span style="font-size:0.8rem; color:var(--primary);">${n.type.toUpperCase()}</span></td>
                                    <td>
                                        <span style="font-family:monospace;">${n.address}</span>
                                        ${n.clean_ip ? `<br><span style="font-size:0.8rem; color:var(--success);">Clean IP: ${n.clean_ip}</span>` : ''}
                                    </td>
                                    <td><span style="background: ${n.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}; color: ${n.status === 'active' ? 'var(--success)' : 'var(--danger)'}; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">${n.status}</span></td>
                                    <td style="display:flex; gap:8px; align-items:center;">
                                        <button onclick="copyText('${n.token}', 'Token Copied!')" style="padding:6px 12px; font-size:0.85rem; background:#475569;">Token</button>
                                        <button onclick="editNode('${n.id}', '${n.name}', '${n.address}', '${n.clean_ip}')" style="padding:6px 12px; background:#3b82f6; font-size:0.85rem;">Edit</button>
                                        <button onclick="deleteNode('${n.id}')" class="btn-danger" style="padding:6px 12px; font-size:0.85rem;">Delete</button>
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

    // --- کنترل کلیک دکمه‌های فرم ---
    contentArea.addEventListener('click', async (e) => {
        if (e.target.id === 'btn-add-user') {
            const name = document.getElementById('u-name').value;
            const limit = parseFloat(document.getElementById('u-limit').value || 0);
            const days = parseInt(document.getElementById('u-days').value || 0);
            if (!name) return alert('Name is required');
            
            let exp = 0;
            if (days > 0) exp = Math.floor(Date.now() / 1000) + (days * 86400);

            e.target.disabled = true;
            e.target.innerText = '...';
            await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, data_limit: limit * (1024**3), expire_time: exp })
            });
            renderContent('users');
        }
        
        if (e.target.id === 'btn-add-node') {
            const name = document.getElementById('n-name').value;
            const addr = document.getElementById('n-addr').value;
            const clean = document.getElementById('n-clean').value;
            const type = document.getElementById('n-type').value;
            if (!name || !addr) return alert('Node name and Address are required');
            
            e.target.disabled = true;
            e.target.innerText = '...';
            await fetch('/api/nodes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, type: type, address: addr, clean_ip: clean })
            });
            renderContent('nodes');
        }
    });

    // --- کنترل سایدبار ---
    const navItems = document.querySelectorAll('.nav-item');
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