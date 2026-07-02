const API_BASE = window.location.origin;

// ===== Auth =====
let authToken = localStorage.getItem('admin_token');

function getHeaders(extra = {}) {
    const headers = { 'Content-Type': 'application/json', ...extra };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    return headers;
}

async function authFetch(url, options = {}) {
    options.headers = getHeaders(options.headers || {});
    const res = await fetch(url, options);
    if (res.status === 401) {
        localStorage.removeItem('admin_token');
        authToken = null;
        showLoginScreen();
        throw new Error('Session expirée');
    }
    return res;
}

function showLoginScreen() {
    document.getElementById('login-overlay').style.display = 'flex';
    document.querySelector('.top-bar').style.display = 'none';
    document.querySelector('.app-layout').style.display = 'none';
}

function hideLoginScreen() {
    document.getElementById('login-overlay').style.display = 'none';
    document.querySelector('.top-bar').style.display = 'flex';
    document.querySelector('.app-layout').style.display = 'flex';
}

async function checkAuth() {
    if (!authToken) { showLoginScreen(); return; }
    try {
        const res = await fetch(`${API_BASE}/api/auth/check`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        document.getElementById('mode-badge').textContent = data.mode === 'server' ? 'VPS' : 'Desktop';
        hideLoginScreen();
    } catch {
        localStorage.removeItem('admin_token');
        authToken = null;
        showLoginScreen();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('login-username').value;
            const password = document.getElementById('login-password').value;
            const errorEl = document.getElementById('login-error');
            const btn = loginForm.querySelector('.login-btn');
            errorEl.textContent = '';

            btn.classList.add('loading');
            btn.innerHTML = '<i class="fas fa-spinner"></i> Connexion...';

            try {
                const res = await fetch(`${API_BASE}/api/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                if (!res.ok) {
                    const data = await res.json();
                    errorEl.textContent = data.error || 'Erreur de connexion';
                    btn.classList.remove('loading');
                    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Se connecter';
                    return;
                }
                const data = await res.json();
                authToken = data.token;
                localStorage.setItem('admin_token', authToken);
                document.getElementById('mode-badge').textContent = data.mode === 'server' ? 'VPS' : 'Desktop';

                btn.classList.remove('loading');
                btn.classList.add('success');
                btn.innerHTML = '<i class="fas fa-check"></i> Connecté';

                const overlay = document.getElementById('login-overlay');
                overlay.style.animation = 'loginFadeOut 0.3s ease-out forwards';
                setTimeout(() => {
                    overlay.style.animation = '';
                    hideLoginScreen();
                    fetchAllStats();
                    fetchDockerStatus();
                }, 300);
            } catch (err) {
                errorEl.textContent = 'Erreur réseau';
                btn.classList.remove('loading');
                btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Se connecter';
            }
        });
    }
    checkAuth();
});

// ===== DOM Elements =====
const pushBtn = document.getElementById('push-btn');
const pullBtn = document.getElementById('pull-btn');
const recomposeBtn = document.getElementById('recompose-btn');
const refreshContainersBtn = document.getElementById('refresh-containers-btn');
const clearLogsBtn = document.getElementById('clear-logs-btn');
const refreshAllBtn = document.getElementById('refresh-all-btn');
const saveSshBtn = document.getElementById('save-ssh-btn');
const saveStripeBtn = document.getElementById('save-stripe-btn');
const saveCloudflareBtn = document.getElementById('save-cloudflare-btn');
const logoutBtn = document.getElementById('logout-btn');
const confirmConnectBtn = document.getElementById('confirm-connect-btn');
const cancelConnectBtn = document.getElementById('cancel-connect-btn');
const connectModal = document.getElementById('connect-modal');
const closeModal = document.querySelector('.modal .close');
const terminalInput = document.getElementById('terminal-input');
const terminalSendBtn = document.getElementById('terminal-send-btn');
const settingsBtn = document.getElementById('settings-btn');
const startAllBtn = document.getElementById('start-all-btn');
const restartAllBtn = document.getElementById('restart-all-btn');
const stopAllBtn = document.getElementById('stop-all-btn');

const tabLinks = document.querySelectorAll('.sidebar li[data-tab]');
const tabContents = document.querySelectorAll('.tab-content');

const githubStatusLed = document.getElementById('github-status');
const serverStatusLed = document.getElementById('server-status');
const dockerStatusLed = document.getElementById('docker-status');
const containerBackendStatus = document.getElementById('container-backend-status');
const containerCaddyStatus = document.getElementById('container-caddy-status');

const gitStatusBar = document.getElementById('git-status');
const serverStatusBar = document.getElementById('server-status-bar');

const serverCpu = document.getElementById('server-cpu');
const serverRam = document.getElementById('server-ram');
const serverDisk = document.getElementById('server-disk');
const serverUptime = document.getElementById('server-uptime');
const stripeSales = document.getElementById('stripe-sales');
const stripeRevenue = document.getElementById('stripe-revenue');
const stripeSubscriptions = document.getElementById('stripe-subscriptions');
const cloudflareVisits = document.getElementById('cloudflare-visits');
const activeContainers = document.getElementById('active-containers');
const dockerCpu = document.getElementById('docker-cpu');
const dockerRam = document.getElementById('docker-ram');

const logs = document.getElementById('logs');
const terminal = document.getElementById('terminal');

// ===== Utility Functions =====
function addLog(message, type = 'info') {
    const logLine = document.createElement('p');
    logLine.className = 'log-line';
    logLine.innerHTML = `[${new Date().toLocaleTimeString()}] <span class="log-${type}">${message}</span>`;
    logs.appendChild(logLine);
    logs.scrollTop = logs.scrollHeight;
}

function addTerminalLine(line, type = 'output') {
    const el = document.createElement('p');
    if (type === 'prompt') {
        el.className = 'terminal-prompt';
        el.innerHTML = `ubuntu@fetchr:~$ <span class="terminal-input">${line}</span>`;
    } else if (type === 'input') {
        el.className = 'terminal-prompt';
        el.innerHTML = `ubuntu@fetchr:~$ <span class="terminal-input">${line}</span>`;
    } else {
        el.className = 'terminal-output';
        el.textContent = line;
    }
    terminal.appendChild(el);
    terminal.scrollTop = terminal.scrollHeight;
}

function updateStatusLed(element, status) {
    if (element) element.className = `led led-${status}`;
}

function updateStatusBar(element, message, type = 'info') {
    if (element) element.innerHTML = `<span class="status-text ${type}">${message}</span>`;
}

// ===== API: Stats =====
async function fetchAllStats() {
    try {
        const response = await authFetch(`${API_BASE}/api/stats`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data.server) {
            serverCpu.textContent = data.server.cpu !== '--' ? data.server.cpu + '%' : '--%';
            serverRam.textContent = data.server.ram || '--%';
            serverDisk.textContent = data.server.disk || '--%';
            serverUptime.textContent = data.server.uptime || '--';
            updateStatusLed(serverStatusLed, 'green');
            updateStatusBar(serverStatusBar, `Connecté — ${data.server.uptime}`, 'success');
        }

        if (data.stripe) {
            stripeSales.textContent = data.stripe.totalSales || '--';
            stripeRevenue.textContent = data.stripe.totalRevenue || '-- €';
            stripeSubscriptions.textContent = data.stripe.activeSubscriptions || '--';
        }

        if (data.cloudflare) {
            cloudflareVisits.textContent = data.cloudflare.uniqueVisitors || '--';
        }

        addLog('Statistiques mises à jour', 'success');
        checkGitSync();
    } catch (error) {
        addLog(`Erreur stats: ${error.message}`, 'error');
        updateStatusLed(serverStatusLed, 'red');
        updateStatusBar(serverStatusBar, 'Erreur de connexion', 'error');
    }
}

// ===== API: Git Sync Check =====
async function checkGitSync() {
    try {
        const response = await authFetch(`${API_BASE}/api/git/sync-status`);
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (data.synced) {
            updateStatusLed(githubStatusLed, 'green');
        } else {
            updateStatusLed(githubStatusLed, 'orange');
            if (data.behind > 0) {
                addLog(`Git: ${data.behind} commit(s) en retard sur origin/master`, 'warning');
            }
        }
    } catch {
        updateStatusLed(githubStatusLed, 'green');
    }
}

// ===== API: Docker =====
async function fetchDockerStatus() {
    try {
        const response = await authFetch(`${API_BASE}/api/docker`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'status' })
        });
        const data = await response.json();

        if (data.output) {
            const lines = data.output.split('\n').filter(l => l.trim());
            const backendUp = lines.some(l => l.includes('backend') && (l.includes('Up') || l.includes('running')));
            const caddyUp = lines.some(l => l.includes('caddy') && (l.includes('Up') || l.includes('running')));
            const runningCount = (backendUp ? 1 : 0) + (caddyUp ? 1 : 0);

            updateStatusLed(containerBackendStatus, backendUp ? 'green' : 'red');
            updateStatusLed(containerCaddyStatus, caddyUp ? 'green' : 'red');
            updateStatusLed(dockerStatusLed, runningCount > 0 ? 'green' : 'red');
            activeContainers.textContent = `${runningCount}/2`;

            addLog(`Docker: ${runningCount}/2 conteneurs actifs`, 'success');
        }
    } catch (error) {
        addLog(`Erreur Docker status: ${error.message}`, 'error');
        updateStatusLed(dockerStatusLed, 'red');
    }
}

async function fetchDockerStats() {
    try {
        const response = await authFetch(`${API_BASE}/api/docker/stats`);
        const data = await response.json();

        if (data.containers && data.containers.length > 0) {
            const totalCpu = data.containers.reduce((sum, c) => sum + parseFloat(c.cpu) || 0, 0);
            const totalMem = data.containers.map(c => c.mem).join(' / ');
            dockerCpu.textContent = totalCpu.toFixed(1) + '%';
            dockerRam.textContent = totalMem || '0 MB';
        }
    } catch (error) {
        // silently fail
    }
}

async function execDockerAction(action) {
    const composePath = document.getElementById('docker-path').value;
    addLog(`Docker: ${action}...`, 'info');
    try {
        const response = await authFetch(`${API_BASE}/api/docker`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, composePath })
        });
        const data = await response.json();
        if (data.error) {
            addLog(`Docker ${action}: ${data.error}`, 'error');
        } else {
            addLog(`Docker ${action}: OK`, 'success');
            if (data.output) addLog(data.output, 'info');
        }
        setTimeout(() => { fetchDockerStatus(); fetchDockerStats(); }, 3000);
    } catch (error) {
        addLog(`Erreur Docker: ${error.message}`, 'error');
    }
}

// Restart/logs pour un conteneur individuel
async function restartContainer(service) {
    addLog(`Redémarrage de ${service}...`, 'info');
    try {
        const response = await authFetch(`${API_BASE}/api/ssh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: `cd /home/ubuntu/fetchr && docker compose restart ${service}` })
        });
        const data = await response.json();
        addLog(`${service} redémarré`, 'success');
        setTimeout(fetchDockerStatus, 2000);
    } catch (error) {
        addLog(`Erreur restart ${service}: ${error.message}`, 'error');
    }
}

async function viewLogs(service) {
    addLog(`Récupération logs ${service}...`, 'info');
    try {
        const response = await authFetch(`${API_BASE}/api/ssh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: `cd /home/ubuntu/fetchr && docker compose logs --tail=30 ${service}` })
        });
        const data = await response.json();
        if (data.output) {
            // Switch to terminal tab and show logs
            tabLinks.forEach(l => l.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            document.querySelector('[data-tab="terminal"]').classList.add('active');
            document.getElementById('terminal-tab').classList.add('active');

            addTerminalLine(`--- Logs ${service} (30 dernières lignes) ---`, 'output');
            data.output.split('\n').forEach(line => addTerminalLine(line, 'output'));
            addTerminalLine('', 'prompt');
        }
    } catch (error) {
        addLog(`Erreur logs ${service}: ${error.message}`, 'error');
    }
}

// ===== API: Git =====
async function execGitAction(action, message, branch, source) {
    const sourceLabel = source === 'local' ? 'Local' : 'Serveur';
    addLog(`Git ${action} (${sourceLabel})...`, 'info');
    updateStatusBar(gitStatusBar, `${action} en cours (${sourceLabel})...`, 'info');
    try {
        const response = await authFetch(`${API_BASE}/api/git`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, message, branch, source })
        });
        const data = await response.json();
        if (data.error) {
            addLog(`Git ${action}: ${data.error}`, 'error');
            updateStatusBar(gitStatusBar, data.error, 'error');
        } else {
            addLog(`Git ${action} (${sourceLabel}) réussi`, 'success');
            updateStatusBar(gitStatusBar, `${action} réussi !`, 'success');
            if (data.output) addLog(data.output, 'info');
        }
    } catch (error) {
        addLog(`Erreur Git: ${error.message}`, 'error');
        updateStatusBar(gitStatusBar, 'Erreur de connexion', 'error');
    }
}

async function fetchGitHistory() {
    try {
        const response = await authFetch(`${API_BASE}/api/git/history`);
        const data = await response.json();
        const gitHistory = document.getElementById('git-history');
        gitHistory.innerHTML = '';

        if (data.commits && data.commits.length > 0) {
            data.commits.forEach(commit => {
                const div = document.createElement('div');
                div.className = 'commit';
                div.innerHTML = `
                    <div class="commit-hash">${commit.hash}</div>
                    <div class="commit-msg">${commit.msg}</div>
                    <div class="commit-meta">${commit.author} &bull; ${commit.date}</div>
                `;
                gitHistory.appendChild(div);
            });
            addLog(`Historique Git: ${data.commits.length} commits chargés`, 'success');
        }
    } catch (error) {
        addLog(`Erreur historique Git: ${error.message}`, 'error');
    }
}

// ===== API: Terminal SSH =====
async function execSSHCommand(command) {
    try {
        const response = await authFetch(`${API_BASE}/api/ssh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
        });
        const data = await response.json();
        if (data.error) {
            addTerminalLine(`Erreur: ${data.error}`, 'output');
        } else if (data.output) {
            data.output.split('\n').forEach(line => addTerminalLine(line, 'output'));
        }
    } catch (error) {
        addTerminalLine(`Erreur de connexion: ${error.message}`, 'output');
    }
    addTerminalLine('', 'prompt');
}

// ===== Event Listeners =====

// Tabs
tabLinks.forEach(link => {
    link.addEventListener('click', () => {
        tabLinks.forEach(l => l.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        link.classList.add('active');
        const tabId = link.getAttribute('data-tab');
        document.getElementById(`${tabId}-tab`).classList.add('active');

        if (tabId === 'git') fetchGitHistory();
        if (tabId === 'docker') { fetchDockerStatus(); fetchDockerStats(); }
        if (tabId === 'transfers') { fetchDiskUsage(); fetchFiles(); fetchTransferWatch(); fetchAuthLog(); }
    });
});

// Git
pushBtn.addEventListener('click', () => {
    const commitMsg = document.getElementById('commit-msg').value.trim();
    const branch = document.getElementById('git-branch').value;
    const source = document.getElementById('git-source').value;
    if (!commitMsg) {
        updateStatusBar(gitStatusBar, 'Message de commit vide !', 'error');
        addLog('Erreur: Message de commit vide', 'error');
        return;
    }
    execGitAction('push', commitMsg, branch, source);
});

const pullServerBtn = document.getElementById('pull-server-btn');
pullServerBtn.addEventListener('click', () => execGitAction('pull', null, null, 'server'));
pullBtn.addEventListener('click', () => execGitAction('pull', null, null, 'server'));
recomposeBtn.addEventListener('click', () => execDockerAction('recompose'));

// Docker
startAllBtn.addEventListener('click', () => execDockerAction('start-all'));
restartAllBtn.addEventListener('click', () => execDockerAction('restart-all'));
stopAllBtn.addEventListener('click', () => execDockerAction('stop-all'));
refreshContainersBtn.addEventListener('click', () => { fetchDockerStatus(); fetchDockerStats(); });

// Logs
clearLogsBtn.addEventListener('click', () => {
    logs.innerHTML = '';
    addLog('Logs effacés', 'info');
});

// Refresh All
refreshAllBtn.addEventListener('click', () => {
    fetchAllStats();
    fetchDockerStatus();
    fetchDockerStats();
});

// Terminal
terminalInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const cmd = terminalInput.value.trim();
        if (cmd) {
            addTerminalLine(cmd, 'input');
            terminalInput.value = '';
            execSSHCommand(cmd);
        }
    }
});

terminalSendBtn.addEventListener('click', () => {
    const cmd = terminalInput.value.trim();
    if (cmd) {
        addTerminalLine(cmd, 'input');
        terminalInput.value = '';
        execSSHCommand(cmd);
    }
});

// Config
saveSshBtn.addEventListener('click', () => addLog('Configuration SSH enregistrée', 'success'));
saveStripeBtn.addEventListener('click', () => addLog('Clé Stripe enregistrée', 'success'));
saveCloudflareBtn.addEventListener('click', () => addLog('Configuration Cloudflare enregistrée', 'success'));

// Settings
settingsBtn.addEventListener('click', () => {
    tabLinks.forEach(l => l.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    document.querySelector('[data-tab="config"]').classList.add('active');
    document.getElementById('config-tab').classList.add('active');
});

// Modal
confirmConnectBtn.addEventListener('click', () => {
    connectModal.style.display = 'none';
    fetchAllStats();
    fetchDockerStatus();
});
cancelConnectBtn.addEventListener('click', () => connectModal.style.display = 'none');
closeModal.addEventListener('click', () => connectModal.style.display = 'none');
window.addEventListener('click', (e) => { if (e.target === connectModal) connectModal.style.display = 'none'; });

// Logout
logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('admin_token');
    authToken = null;
    showLoginScreen();
});

// ===== Deploy =====
document.getElementById('deploy-btn').addEventListener('click', async () => {
    const btn = document.getElementById('deploy-btn');
    const output = document.getElementById('deploy-output');
    const msg = document.getElementById('deploy-msg').value.trim();

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Déploiement en cours...';
    output.style.display = 'block';
    output.innerHTML = '<span style="color:#6366f1;">⏳ Lancement du déploiement...</span>\n';

    try {
        const res = await authFetch(`${API_BASE}/api/deploy`, {
            method: 'POST',
            body: JSON.stringify({ message: msg || undefined })
        });
        const data = await res.json();

        output.innerHTML = '';
        const icons = { ok: '✅', skipped: '⏭️', error: '❌' };
        const labels = { commit: 'Commit', push: 'Push', pull: 'Pull serveur', restart: 'Restart service', install: 'Install deps' };

        data.steps.forEach(s => {
            const icon = icons[s.status] || '❓';
            const label = labels[s.step] || s.step;
            output.innerHTML += `${icon} <strong>${label}</strong>: ${s.output || s.status}\n`;
        });

        if (data.success) {
            output.innerHTML += '\n<span style="color:#22c55e;">🎉 Déploiement terminé avec succès !</span>';
            addLog('Déploiement complet réussi', 'success');
        } else {
            output.innerHTML += '\n<span style="color:#ef4444;">⚠️ Déploiement échoué à une étape.</span>';
            addLog('Déploiement échoué', 'error');
        }
    } catch (err) {
        output.innerHTML = `<span style="color:#ef4444;">❌ Erreur: ${err.message}</span>`;
        addLog(`Erreur déploiement: ${err.message}`, 'error');
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-rocket"></i> Déployer maintenant';
    fetchAllStats();
    fetchDockerStatus();
});

// ===== Change Password =====
document.getElementById('change-password-btn').addEventListener('click', async () => {
    const current = document.getElementById('current-password').value;
    const newPwd = document.getElementById('new-password').value;
    const confirm = document.getElementById('confirm-new-password').value;
    const msg = document.getElementById('password-message');

    msg.style.display = 'none';

    if (!current || !newPwd || !confirm) {
        msg.style.display = 'block';
        msg.style.color = '#ef4444';
        msg.textContent = 'Remplis tous les champs.';
        return;
    }
    if (newPwd !== confirm) {
        msg.style.display = 'block';
        msg.style.color = '#ef4444';
        msg.textContent = 'Les mots de passe ne correspondent pas.';
        return;
    }
    if (newPwd.length < 6) {
        msg.style.display = 'block';
        msg.style.color = '#ef4444';
        msg.textContent = 'Minimum 6 caractères.';
        return;
    }

    try {
        const res = await authFetch(`${API_BASE}/api/auth/change-password`, {
            method: 'POST',
            body: JSON.stringify({ currentPassword: current, newPassword: newPwd })
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Erreur');
        }
        msg.style.display = 'block';
        msg.style.color = '#22c55e';
        msg.textContent = 'Mot de passe changé avec succès !';
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-new-password').value = '';
    } catch (err) {
        msg.style.display = 'block';
        msg.style.color = '#ef4444';
        msg.textContent = err.message;
    }
});

// ===== API: Transfers =====

async function fetchDiskUsage() {
    try {
        const res = await authFetch(`${API_BASE}/api/transfers/disk`);
        if (!res.ok) return;
        const data = await res.json();
        const percent = data.percent || 0;
        const bar = document.getElementById('disk-bar');
        bar.style.width = percent + '%';
        bar.className = 'disk-bar' + (percent > 90 ? ' danger' : percent > 75 ? ' warning' : '');

        const formatSize = (bytes) => {
            if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
            if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
            return (bytes / 1e3).toFixed(1) + ' KB';
        };
        document.getElementById('disk-used').textContent = formatSize(data.used);
        document.getElementById('disk-total').textContent = formatSize(data.total);
        document.getElementById('disk-free').textContent = formatSize(data.free);
    } catch (e) {}
}

let currentFilePath = '/home/ubuntu/transfer';

async function fetchFiles(dir) {
    currentFilePath = dir || currentFilePath;
    document.getElementById('file-current-path').textContent = currentFilePath;
    const body = document.getElementById('file-list-body');
    body.innerHTML = '<p style="color:var(--text-muted);padding:15px;text-align:center;">Chargement...</p>';

    try {
        const res = await authFetch(`${API_BASE}/api/transfers/files?path=${encodeURIComponent(currentFilePath)}`);
        if (!res.ok) throw new Error('Erreur');
        const data = await res.json();
        body.innerHTML = '';

        if (data.files.length === 0) {
            body.innerHTML = '<p style="color:var(--text-muted);padding:15px;text-align:center;">Dossier vide</p>';
            return;
        }

        const sorted = data.files.sort((a, b) => {
            if (a.isDir && !b.isDir) return -1;
            if (!a.isDir && b.isDir) return 1;
            return a.name.localeCompare(b.name);
        });

        sorted.forEach(file => {
            const div = document.createElement('div');
            div.className = 'file-item';
            const icon = file.isDir ? 'fa-folder' : 'fa-file';
            const size = file.isDir ? '--' : formatFileSize(file.size);
            div.innerHTML = `
                <span class="file-item-name"><i class="fas ${icon}"></i> ${file.name}</span>
                <span class="file-item-size">${size}</span>
                <span class="file-item-date">${file.date}</span>
            `;
            if (file.isDir) {
                div.addEventListener('click', () => {
                    fetchFiles(currentFilePath + '/' + file.name);
                });
            }
            body.appendChild(div);
        });
    } catch (e) {
        body.innerHTML = '<p style="color:var(--danger);padding:15px;text-align:center;">Erreur de chargement</p>';
    }
}

function formatFileSize(bytes) {
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
    if (bytes >= 1e3) return (bytes / 1e3).toFixed(1) + ' KB';
    return bytes + ' B';
}

document.getElementById('file-root-select').addEventListener('change', (e) => {
    fetchFiles(e.target.value);
});

document.getElementById('file-up-btn').addEventListener('click', () => {
    const parent = currentFilePath.split('/').slice(0, -1).join('/') || '/';
    const root = document.getElementById('file-root-select').value;
    if (parent.length >= root.length) {
        fetchFiles(parent);
    }
});

document.getElementById('file-refresh-btn').addEventListener('click', () => {
    fetchFiles(currentFilePath);
});

// Transfer watch
let watchInterval = null;

async function fetchTransferWatch() {
    const log = document.getElementById('transfer-watch-log');
    try {
        const res = await authFetch(`${API_BASE}/api/transfers/watch`);
        if (!res.ok) return;
        const data = await res.json();
        log.innerHTML = '';
        if (data.files.length === 0) {
            log.innerHTML = '<p class="log-line"><span class="log-info">Aucun fichier modifié dans la dernière heure</span></p>';
        } else {
            data.files.forEach(f => {
                const p = document.createElement('p');
                p.className = 'log-line';
                p.innerHTML = `<span class="log-success">[${f.date}]</span> ${f.path} <span class="log-info">(${f.size})</span>`;
                log.appendChild(p);
            });
        }
    } catch (e) {}
}

async function fetchAuthLog() {
    const log = document.getElementById('transfer-auth-log');
    try {
        const res = await authFetch(`${API_BASE}/api/transfers/auth-log`);
        if (!res.ok) return;
        const data = await res.json();
        log.innerHTML = '';
        if (data.lines.length === 0) {
            log.innerHTML = '<p class="log-line"><span class="log-info">Aucune connexion récente</span></p>';
        } else {
            data.lines.forEach(line => {
                const p = document.createElement('p');
                p.className = 'log-line';
                const isAccepted = line.toLowerCase().includes('accepted') || line.toLowerCase().includes('opened');
                p.innerHTML = `<span class="log-${isAccepted ? 'success' : 'info'}">${line}</span>`;
                log.appendChild(p);
            });
            log.scrollTop = log.scrollHeight;
        }
    } catch (e) {}
}

document.getElementById('transfer-watch-toggle').addEventListener('click', () => {
    if (watchInterval) {
        clearInterval(watchInterval);
        watchInterval = null;
        document.getElementById('transfer-watch-toggle').style.color = '';
        addLog('Watch transfert désactivé', 'info');
    } else {
        fetchTransferWatch();
        watchInterval = setInterval(fetchTransferWatch, 3000);
        document.getElementById('transfer-watch-toggle').style.color = 'var(--success)';
        addLog('Watch transfert activé (refresh 3s)', 'success');
    }
});

document.getElementById('transfer-clear-btn').addEventListener('click', () => {
    document.getElementById('transfer-watch-log').innerHTML = '<p class="log-line"><span class="log-info">Logs effacés</span></p>';
    document.getElementById('transfer-auth-log').innerHTML = '<p class="log-line"><span class="log-info">Logs effacés</span></p>';
});

// Transfer sub-tabs
document.querySelectorAll('.transfer-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.transfer-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.getAttribute('data-transfer-tab');
        document.getElementById('transfer-watch-log').style.display = target === 'watch' ? '' : 'none';
        document.getElementById('transfer-auth-log').style.display = target === 'auth' ? '' : 'none';
        if (target === 'auth') fetchAuthLog();
    });
});

// ===== API: Fetchr Health (Cookies) =====
async function checkCookieStatus() {
    try {
        const response = await authFetch(`${API_BASE}/api/fetchr/health`);
        if (!response.ok) return;
        const data = await response.json();
        const cookieLed = document.getElementById('cookie-status');
        if (!cookieLed) return;

        if (data.status === 'unreachable') {
            updateStatusLed(cookieLed, 'red');
            addLog('Backend injoignable — impossible de vérifier les cookies', 'error');
        } else if (data.cookies_expired) {
            updateStatusLed(cookieLed, 'orange');
            addLog('⚠️ Cookies YouTube expirés ! Lance refresh-cookies.sh', 'warning');
        } else {
            updateStatusLed(cookieLed, 'green');
        }
    } catch {
        // silent
    }
}

// ===== Initialization =====
addLog('Démarrage de Fetchr Server Manager...', 'info');
addTerminalLine('', 'prompt');

fetchAllStats();
fetchDockerStatus();
fetchDockerStats();
checkCookieStatus();

setInterval(() => {
    fetchAllStats();
    fetchDockerStatus();
    fetchDockerStats();
    checkCookieStatus();
}, 30000);
