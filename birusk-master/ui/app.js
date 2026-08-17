document.addEventListener('DOMContentLoaded', () => {
    // --- متغیرهای سراسری سیستم ---
    const themeBtn = document.getElementById('theme-toggle');
    const html = document.documentElement;
    const contentArea = document.getElementById('content');
    const langSelect = document.getElementById('lang-selector');
    const sidebar = document.getElementById('sidebar');
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const pageTitle = document.getElementById('page-title');
    
    let usersData = [];
    let nodesData = [];
    
    // ذخیره تنظیمات در لوکال استوریج (شامل تنظیمات MTProto تلگرام)
    let coreSettings = JSON.parse(localStorage.getItem('birusk_settings')) || {
        subDomain: '',
        defaultCleanIp: '',
        enableStats: true,
        mtprotoEnabled: false,
        mtprotoPort: '8443',
        mtprotoSecret: '',
        mtprotoTag: ''
    };

    // --- مدیریت تم (تاریک/روشن) ---
    let currentTheme = localStorage.getItem('theme') || 'dark';
    html.setAttribute('data-theme', currentTheme);
    
    themeBtn.addEventListener('click', () => {
        currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', currentTheme);
        html.setAttribute('data-theme', currentTheme);
    });

    // --- مدیریت منوی موبایل ---
    const overlay = document.querySelector('.overlay') || document.createElement('div');
    if (!document.querySelector('.overlay')) {
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

    // --- سیستم چند زبانه ---
    let currentLang = localStorage.getItem('lang') || 'en';
    
    const applyLang = (lang) => {
        langSelect.value = lang;
        html.setAttribute('lang', lang);
        html.setAttribute('dir', lang === 'fa' ? 'rtl' : 'ltr');
        
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

    // --- توابع کمکی ---
    const formatBytes = (bytes) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatDate = (unix) => {
        if (!unix || unix === 0) return 'Unlimited / نامحدود';
        return new Date(unix * 1000).toLocaleDateString(currentLang === 'fa' ? 'fa-IR' : 'en-US');
    };

    const calculateDaysLeft = (unix) => {
        if (!unix || unix === 0) return '∞';
        const diff = (unix * 1000) - Date.now();
        if (diff <= 0) return 'Expired';
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
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

    window.openModal = (id) => {
        document.getElementById(id).classList.add('open');
    };

    window.closeModal = (id) => {
        document.getElementById(id).classList.remove('open');
    };

    // --- ابزار تولید هوشمند Secret تلگرام ---
    window.generateMtprotoSecret = () => {
        const chars = '0123456789abcdef';
        let hex = '';
        for (let i = 0; i < 32; i++) {
            hex += chars[Math.floor(Math.random() * chars.length)];
        }
        const finalSecret = 'dd' + hex;
        document.getElementById('setting-mtproto-secret').value = finalSecret;
        const hintEl = document.getElementById('hint-secret');
        if (hintEl) hintEl.innerText = finalSecret;
    };

    window.updatePortHint = (val) => {
        const hintEl = document.getElementById('hint-port');
        if (hintEl) hintEl.innerText = val || '8443';
    };

    // --- منطق پیشرفته کاربران (Wizards) ---
    window.openUserWizard = (id = null) => {
        if (id) {
            const u = usersData.find(x => x.id === id);
            document.getElementById('form-user-id').value = u.id;
            document.getElementById('form-user-name').value = u.name;
            document.getElementById('form-user-limit').value = u.data_limit ? Math.floor(u.data_limit / (1024**3)) : 0;
            
            let daysLeft = 0;
            if (u.expire_time > 0) {
                const diff = (u.expire_time * 1000) - Date.now();
                daysLeft = diff > 0 ? Math.ceil(diff / (1000 * 60 * 60 * 24)) : 0;
            }
            document.getElementById('form-user-days').value = daysLeft;
            
            document.getElementById('form-user-vless').checked = (u.vless_enabled !== 0);
            document.getElementById('form-user-trojan').checked = (u.trojan_enabled !== 0);
            document.getElementById('form-user-remark').value = u.custom_remark || '';
            
            document.getElementById('user-modal-title').innerText = currentLang === 'fa' ? 'ویرایش کانفیگ و اشتراک' : 'Edit Subscription';
        } else {
            document.getElementById('form-user-id').value = '';
            document.getElementById('form-user-name').value = '';
            document.getElementById('form-user-limit').value = '0';
            document.getElementById('form-user-days').value = '30';
            
            document.getElementById('form-user-vless').checked = true;
            document.getElementById('form-user-trojan').checked = true;
            document.getElementById('form-user-remark').value = '';
            
            document.getElementById('user-modal-title').innerText = currentLang === 'fa' ? 'ایجاد اشتراک جدید' : 'Create Subscription';
        }
        openModal('user-modal');
    };

    window.submitUserForm = async () => {
        const id = document.getElementById('form-user-id').value;
        const name = document.getElementById('form-user-name').value;
        const limit = parseFloat(document.getElementById('form-user-limit').value || 0);
        const days = parseInt(document.getElementById('form-user-days').value || 0);
        const useVless = document.getElementById('form-user-vless').checked;
        const useTrojan = document.getElementById('form-user-trojan').checked;
        const remark = document.getElementById('form-user-remark').value;

        if (!name) return alert('Name is required!');
        
        let exp = 0;
        if (days > 0) exp = Math.floor(Date.now() / 1000) + (days * 86400);

        const payload = { 
            name: name, 
            data_limit: limit * (1024**3), 
            expire_time: exp,
            vless_enabled: useVless,
            trojan_enabled: useTrojan,
            custom_remark: remark
        };

        const btn = document.getElementById('btn-save-user');
        btn.disabled = true;
        btn.innerText = 'Deploying...';

        try {
            if (id) {
                payload.id = id;
                await fetch('/api/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            } else {
                await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            }
        } catch (e) {
            console.error(e);
        }

        btn.disabled = false;
        btn.innerText = 'Save & Deploy';
        closeModal('user-modal');
        renderContent('users');
    };

    window.deleteUser = async (id) => {
        if(!confirm(currentLang === 'fa' ? 'آیا از حذف این اشتراک اطمینان دارید؟' : 'Are you sure you want to delete this subscription?')) return;
        await fetch(`/api/users?id=${id}`, { method: 'DELETE' });
        renderContent('users');
    };

    // --- منطق پیشرفته نودها ---
    window.openNodeWizard = (id = null) => {
        if (id) {
            const n = nodesData.find(x => x.id === id);
            document.getElementById('form-node-id').value = n.id;
            document.getElementById('form-node-name').value = n.name;
            document.getElementById('form-node-addr').value = n.address;
            document.getElementById('form-node-type').value = n.type;
            document.getElementById('node-modal-title').innerText = currentLang === 'fa' ? 'ویرایش نود زیرساخت' : 'Edit Infrastructure Node';
        } else {
            document.getElementById('form-node-id').value = '';
            document.getElementById('form-node-name').value = '';
            document.getElementById('form-node-addr').value = '';
            document.getElementById('form-node-type').value = 'cloudflare';
            document.getElementById('node-modal-title').innerText = currentLang === 'fa' ? 'ثبت نود زیرساخت جدید' : 'Register New Edge Node';
        }
        openModal('node-modal');
    };

    window.submitNodeForm = async () => {
        const id = document.getElementById('form-node-id').value;
        const name = document.getElementById('form-node-name').value;
        const addr = document.getElementById('form-node-addr').value;
        const type = document.getElementById('form-node-type').value;

        if (!name || !addr) return alert('Name and Address are required!');

        const payload = { name: name, type: type, address: addr };
        
        const btn = document.getElementById('btn-save-node');
        btn.disabled = true;
        btn.innerText = 'Connecting...';

        try {
            if (id) {
                payload.id = id;
                await fetch('/api/nodes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            } else {
                await fetch('/api/nodes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            }
        } catch (e) {
            console.error(e);
        }

        btn.disabled = false;
        btn.innerText = 'Connect Node';
        closeModal('node-modal');
        
        alert(currentLang === 'fa' ? 'نود با موفقیت ثبت شد. توکن ارتباطی تولید گردید.' : 'Node registered successfully. Token generated.');
        renderContent('nodes');
    };

    window.deleteNode = async (id) => {
        if(!confirm(currentLang === 'fa' ? 'آیا از حذف این نود زیرساخت اطمینان دارید؟' : 'Are you sure you want to delete this node?')) return;
        await fetch(`/api/nodes?id=${id}`, { method: 'DELETE' });
        renderContent('nodes');
    };

    // --- تنظیمات هسته (Core Settings) ---
    window.saveSettings = () => {
        coreSettings.subDomain = document.getElementById('setting-domain').value;
        coreSettings.defaultCleanIp = document.getElementById('setting-cleanip').value;
        coreSettings.enableStats = document.getElementById('setting-stats').checked;
        
        // ذخیره تنظیمات تلگرام پروکسی
        coreSettings.mtprotoEnabled = document.getElementById('setting-mtproto-enable').checked;
        coreSettings.mtprotoPort = document.getElementById('setting-mtproto-port').value;
        coreSettings.mtprotoSecret = document.getElementById('setting-mtproto-secret').value;
        coreSettings.mtprotoTag = document.getElementById('setting-mtproto-tag').value;
        
        localStorage.setItem('birusk_settings', JSON.stringify(coreSettings));
        
        const btn = document.getElementById('btn-save-settings');
        btn.innerText = 'Saved Successfully! ✔️';
        btn.style.background = 'var(--success)';
        
        // فراخوانی API برای آپدیت تنظیمات در بک‌اند
        fetch('/api/settings', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(coreSettings) 
        }).catch(e => console.log("Settings API sync error", e));

        setTimeout(() => {
            btn.innerText = 'Save Core Configurations';
            btn.style.background = 'var(--primary)';
        }, 2000);
    };

    // --- موتور رندر صفحات (Rendering Engine) ---
    const renderContent = async (page) => {
        contentArea.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-muted);">Fetching Live Data...</div>';
        
        if (page !== 'settings') {
            await fetchData();
        }

        let htmlContent = '';

        if (page === 'dashboard') {
            const totalTraffic = usersData.reduce((acc, user) => acc + (user.used_data || 0), 0);
            const maxTrafficCap = usersData.reduce((acc, user) => acc + (user.data_limit || 0), 0);
            const activeNodes = nodesData.filter(n => n.status === 'active').length;
            const expiredUsers = usersData.filter(u => u.expire_time > 0 && (u.expire_time * 1000) < Date.now()).length;
            
            let networkPercent = 0;
            if (maxTrafficCap > 0) {
                networkPercent = Math.min(Math.round((totalTraffic / maxTrafficCap) * 100), 100);
            }

            htmlContent = `
                <div class="grid-cards" style="margin-bottom: 24px;">
                    <div class="card">
                        <span class="card-title" data-i18n="card_total_users">Total Subscriptions</span>
                        <span class="card-value">${usersData.length} <span style="font-size:1rem; color:var(--text-muted); font-weight:normal;">/ ${expiredUsers} Expired</span></span>
                    </div>
                    <div class="card">
                        <span class="card-title" data-i18n="card_active_nodes">Online Edge Nodes</span>
                        <span class="card-value">${activeNodes} <span style="font-size:1rem; color:var(--success); font-weight:normal;">● Active</span></span>
                    </div>
                </div>
                
                <div class="card">
                    <h3 style="margin-bottom: 16px; color: var(--primary);">Network Utilization Overview</h3>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="font-weight: bold;">Global Bandwidth</span>
                        <span style="color: var(--text-muted);">${formatBytes(totalTraffic)} ${maxTrafficCap > 0 ? '/ ' + formatBytes(maxTrafficCap) : ''}</span>
                    </div>
                    <div class="visual-bar-container">
                        <div class="visual-bar" style="width: ${networkPercent}%; ${networkPercent > 80 ? 'background: var(--danger);' : ''}"></div>
                    </div>
                    <div style="margin-top: 20px; color: var(--text-muted); font-size: 0.9rem;">
                        Real-time visualization of your distributed nodes' bandwidth consumption.
                    </div>
                </div>
            `;
        } 
        else if (page === 'users') {
            htmlContent = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="color: var(--text-main);">Subscription Management</h3>
                    <button onclick="openUserWizard()" data-i18n="btn_add_user">+ Create Client Sub</button>
                </div>
                <div class="card" style="padding: 0; overflow-x: auto;">
                    <table>
                        <thead>
                            <tr>
                                <th data-i18n="table_name">Client Identifier</th>
                                <th data-i18n="table_usage">Data Utilization</th>
                                <th>Validity (Days Left)</th>
                                <th data-i18n="table_status">Status</th>
                                <th>Configuration Control</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${usersData.map(u => {
                                let percent = 0;
                                if(u.data_limit > 0) percent = Math.min(Math.round((u.used_data / u.data_limit) * 100), 100);
                                const isExp = u.expire_time > 0 && (u.expire_time * 1000) < Date.now();
                                
                                const subBaseUrl = coreSettings.subDomain ? 
                                    (coreSettings.subDomain.startsWith('http') ? coreSettings.subDomain : 'https://' + coreSettings.subDomain) : 
                                    window.location.origin;
                                    
                                const subLink = `${subBaseUrl}/sub?id=${u.id}`;
                                
                                // منطق ساخت لینک داینامیک تلگرام پروکسی
                                let tgBtnHtml = '';
                                if (coreSettings.mtprotoEnabled && coreSettings.mtprotoPort && coreSettings.mtprotoSecret) {
                                    let tgServer = coreSettings.subDomain || window.location.hostname;
                                    tgServer = tgServer.replace(/^https?:\/\//, '').split('/')[0];
                                    let tgLink = `tg://proxy?server=${tgServer}&port=${coreSettings.mtprotoPort}&secret=${coreSettings.mtprotoSecret}`;
                                    tgBtnHtml = `<button onclick="copyText('${tgLink}', 'Telegram Proxy Link Copied!')" class="btn-telegram" style="padding:8px 12px; font-size:0.85rem; border-radius:8px;">✈️ TG Proxy</button>`;
                                }

                                return `
                                <tr>
                                    <td style="font-weight:bold; color: var(--primary);">${u.name}</td>
                                    <td style="min-width: 180px;">
                                        <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px;">
                                            <span>${formatBytes(u.used_data)}</span>
                                            <span style="color:var(--text-muted);">${u.data_limit ? formatBytes(u.data_limit) : '∞'}</span>
                                        </div>
                                        <div class="visual-bar-container" style="height:4px;">
                                            <div class="visual-bar" style="width: ${percent}%; ${percent > 85 ? 'background: var(--danger);' : ''}"></div>
                                        </div>
                                    </td>
                                    <td>
                                        <div style="font-weight:bold; color: ${isExp ? 'var(--danger)' : 'var(--text-main)'};">${calculateDaysLeft(u.expire_time)} Days</div>
                                        <div style="font-size:0.75rem; color:var(--text-muted);">${formatDate(u.expire_time)}</div>
                                    </td>
                                    <td>
                                        <span style="background: ${isExp ? 'rgba(244,63,94,0.1)' : 'rgba(16,185,129,0.1)'}; color: ${isExp ? 'var(--danger)' : 'var(--success)'}; padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: 600;">
                                            ${isExp ? 'Expired' : 'Active'}
                                        </span>
                                    </td>
                                    <td>
                                        <div style="display:flex; gap:8px;">
                                            ${tgBtnHtml}
                                            <button onclick="copyText('${subLink}', 'Subscription Link Copied!')" style="padding:8px 12px; font-size:0.85rem; border-radius:8px;">🔗 Sub</button>
                                            <button onclick="openUserWizard('${u.id}')" style="padding:8px 12px; background:var(--bg-card); color:var(--primary); border:1px solid var(--primary); font-size:0.85rem; border-radius:8px;">⚙️ Manage</button>
                                            <button onclick="deleteUser('${u.id}')" class="btn-danger" style="padding:8px 12px; font-size:0.85rem; border-radius:8px;">🗑</button>
                                        </div>
                                    </td>
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
        else if (page === 'nodes') {
            htmlContent = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="color: var(--text-main);">Infrastructure Routing Nodes</h3>
                    <button onclick="openNodeWizard()" data-i18n="btn_add_node">+ Register Edge Node</button>
                </div>
                <div class="card" style="padding: 0; overflow-x: auto;">
                    <table>
                        <thead>
                            <tr>
                                <th>Node Identity</th>
                                <th>Server Target / Connection</th>
                                <th>Deployment Type</th>
                                <th data-i18n="table_status">Status</th>
                                <th>API Access</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${nodesData.map(n => `
                                <tr>
                                    <td style="font-weight:bold; font-size:1.05rem;">${n.name}</td>
                                    <td><span style="font-family:monospace; background:rgba(255,255,255,0.05); padding:4px 8px; border-radius:6px; color:var(--text-muted);">${n.address}</span></td>
                                    <td>
                                        <span style="background: rgba(99,102,241,0.1); color: var(--primary); padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight:600;">
                                            ${n.type.toUpperCase()}
                                        </span>
                                    </td>
                                    <td>
                                        <span style="background: ${n.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}; color: ${n.status === 'active' ? 'var(--success)' : 'var(--danger)'}; padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: 600;">
                                            ● ${n.status === 'active' ? 'Operational' : 'Offline'}
                                        </span>
                                    </td>
                                    <td>
                                        <div style="display:flex; gap:8px;">
                                            <button onclick="copyText('${n.token}', 'Worker Token Copied to Clipboard!')" style="padding:8px 12px; background:var(--bg-card); color:var(--success); border:1px solid var(--success); font-size:0.85rem; border-radius:8px;">🔑 Get Token</button>
                                            <button onclick="openNodeWizard('${n.id}')" style="padding:8px 12px; background:var(--bg-card); color:var(--primary); border:1px solid var(--primary); font-size:0.85rem; border-radius:8px;">⚙️</button>
                                            <button onclick="deleteNode('${n.id}')" class="btn-danger" style="padding:8px 12px; font-size:0.85rem; border-radius:8px;">🗑</button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
        else if (page === 'settings') {
            let tgHost = coreSettings.subDomain || window.location.hostname;
            tgHost = tgHost.replace(/^https?:\/\//, '').split('/')[0];

            htmlContent = `
                <div style="max-width: 800px; margin: 0 auto;">
                    <div class="card">
                        <h3 style="margin-bottom: 24px; color: var(--primary); border-bottom: 1px solid var(--border); padding-bottom: 12px;">Global Core Settings</h3>
                        
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label style="font-weight:bold; margin-bottom:8px;">Subscription Link Domain / دامنه لینک‌های سابسکریپشن</label>
                            <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:8px;">اگر پنل ریلوی شما فیلتر شده است، دامنه ورکر کلادفلر خود را در اینجا وارد کنید تا لینک‌های سابسکریپشن بر اساس این دامنه برای کاربران تولید شوند.</p>
                            <input type="text" id="setting-domain" placeholder="e.g. sub.yourdomain.com" value="${coreSettings.subDomain || ''}">
                        </div>

                        <div class="form-group" style="margin-bottom: 20px;">
                            <label style="font-weight:bold; margin-bottom:8px;">Global Clean IP / آی‌پی تمیز پیش‌فرض برای نودها</label>
                            <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:8px;">اگر می‌خواهید کانفیگ‌ها به صورت خودکار با یک آی‌پی تمیز (Clean IP) ساخته شوند، آن را اینجا وارد کنید.</p>
                            <input type="text" id="setting-cleanip" placeholder="e.g. 104.17.142.23" value="${coreSettings.defaultCleanIp || ''}">
                        </div>

                        <div class="switch-group" style="margin-bottom: 10px;">
                            <div>
                                <div style="font-weight: 600;">Live Statistics Engine</div>
                                <div style="font-size: 0.8rem; color: var(--text-muted);">Enable real-time dashboard analytics and traffic visualization</div>
                            </div>
                            <label class="switch">
                                <input type="checkbox" id="setting-stats" ${coreSettings.enableStats ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                        
                        <h3 style="margin-top: 32px; margin-bottom: 16px; color: var(--telegram); border-bottom: 1px solid var(--border); padding-bottom: 12px;">Telegram MTProto Proxy</h3>
                        
                        <div class="switch-group" style="margin-bottom: 20px;">
                            <div>
                                <div style="font-weight: 600;">Enable Telegram Proxy</div>
                                <div style="font-size: 0.8rem; color: var(--text-muted);">Activate MTProto engine with Sponsor Channel</div>
                            </div>
                            <label class="switch">
                                <input type="checkbox" id="setting-mtproto-enable" ${coreSettings.mtprotoEnabled ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                        
                        <div class="form-row" style="margin-bottom: 20px;">
                            <div class="form-group">
                                <label style="font-weight:bold; margin-bottom:8px;">Proxy Port</label>
                                <input type="number" id="setting-mtproto-port" placeholder="e.g. 8443" value="${coreSettings.mtprotoPort || '8443'}" onkeyup="updatePortHint(this.value)">
                            </div>
                            <div class="form-group">
                                <label style="font-weight:bold; margin-bottom:8px;">Sponsor Tag (from Bot)</label>
                                <input type="text" id="setting-mtproto-tag" placeholder="Paste tag from @TelegramProxyBot" value="${coreSettings.mtprotoTag || ''}">
                            </div>
                        </div>
                        
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label style="font-weight:bold; margin-bottom:8px;">MTProto Secret</label>
                            <div style="display:flex; gap:12px;">
                                <input type="text" id="setting-mtproto-secret" placeholder="Click Auto Generate..." value="${coreSettings.mtprotoSecret || ''}" style="flex:1;">
                                <button onclick="generateMtprotoSecret()" class="btn-secondary" style="color:var(--telegram); border-color:var(--telegram); white-space:nowrap;">🔄 Auto Generate</button>
                            </div>
                        </div>

                        <div style="background: rgba(46, 170, 220, 0.05); border: 1px dashed var(--telegram); padding: 16px; border-radius: 12px; margin-bottom: 30px;">
                            <h4 style="color: var(--telegram); margin-bottom: 12px; display:flex; align-items:center; gap:8px;">🤖 @TelegramProxyBot Registration Info</h4>
                            <p style="font-size:0.9rem; margin-bottom: 12px; color:var(--text-main);">To register your proxy and get a Sponsor Tag, send these exact details to the bot:</p>
                            <ul style="list-style:none; font-family:monospace; color:var(--text-muted); font-size:0.95rem; line-height:1.8; background:var(--bg-base); padding:12px; border-radius:8px; border:1px solid var(--border);">
                                <li><strong style="color:var(--text-main); display:inline-block; width:70px;">IP/Host:</strong> ${tgHost}</li>
                                <li><strong style="color:var(--text-main); display:inline-block; width:70px;">Port:</strong> <span id="hint-port">${coreSettings.mtprotoPort || '8443'}</span></li>
                                <li><strong style="color:var(--text-main); display:inline-block; width:70px;">Secret:</strong> <span id="hint-secret">${coreSettings.mtprotoSecret || '(Click Auto Generate First)'}</span></li>
                            </ul>
                        </div>

                        <button id="btn-save-settings" onclick="saveSettings()" style="width:100%; font-size:1.1rem; padding:16px;">Save Core Configurations</button>
                    </div>
                </div>
            `;
        }

        contentArea.innerHTML = htmlContent;
        applyLang(currentLang);
    };

    // --- مدیریت نویگیشن ---
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

    // شروع رندر شدن داشبورد
    applyLang(currentLang);
    renderContent('dashboard');
});