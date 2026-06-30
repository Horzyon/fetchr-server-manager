const API_BASE = 'http://localhost:3001';

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
        const response = await fetch(`${API_BASE}/api/stats`);
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

        updateStatusLed(githubStatusLed, 'green');
        addLog('Statistiques mises à jour', 'success');
    } catch (error) {
        addLog(`Erreur stats: ${error.message}`, 'error');
        updateStatusLed(serverStatusLed, 'red');
        updateStatusBar(serverStatusBar, 'Erreur de connexion', 'error');
    }
}

// ===== API: Docker =====
async function fetchDockerStatus() {
    try {
        const response = await fetch(`${API_BASE}/api/docker`, {
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
        const response = await fetch(`${API_BASE}/api/docker/stats`);
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
        const response = await fetch(`${API_BASE}/api/docker`, {
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
        const response = await fetch(`${API_BASE}/api/ssh`, {
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
        const response = await fetch(`${API_BASE}/api/ssh`, {
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
async function execGitAction(action, message, branch) {
    addLog(`Git ${action}...`, 'info');
    updateStatusBar(gitStatusBar, `${action} en cours...`, 'info');
    try {
        const response = await fetch(`${API_BASE}/api/git`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, message, branch })
        });
        const data = await response.json();
        if (data.error) {
            addLog(`Git ${action}: ${data.error}`, 'error');
            updateStatusBar(gitStatusBar, data.error, 'error');
        } else {
            addLog(`Git ${action} réussi`, 'success');
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
        const response = await fetch(`${API_BASE}/api/git/history`);
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
        const response = await fetch(`${API_BASE}/api/ssh`, {
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
    });
});

// Git
pushBtn.addEventListener('click', () => {
    const commitMsg = document.getElementById('commit-msg').value.trim();
    const branch = document.getElementById('git-branch').value;
    if (!commitMsg) {
        updateStatusBar(gitStatusBar, 'Message de commit vide !', 'error');
        addLog('Erreur: Message de commit vide', 'error');
        return;
    }
    execGitAction('push', commitMsg, branch);
});

pullBtn.addEventListener('click', () => execGitAction('pull'));
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
    updateStatusLed(githubStatusLed, 'red');
    updateStatusLed(serverStatusLed, 'red');
    updateStatusLed(dockerStatusLed, 'red');
    updateStatusLed(containerBackendStatus, 'red');
    updateStatusLed(containerCaddyStatus, 'red');
    serverCpu.textContent = '--%';
    serverRam.textContent = '--%';
    serverDisk.textContent = '--%';
    serverUptime.textContent = '--';
    activeContainers.textContent = '0/2';
    addLog('Déconnecté', 'info');
    updateStatusBar(serverStatusBar, 'Déconnecté', 'error');
});

// ===== Initialization =====
addLog('Démarrage de Fetchr Server Manager...', 'info');
addTerminalLine('', 'prompt');

fetchAllStats();
fetchDockerStatus();
fetchDockerStats();

setInterval(() => {
    fetchAllStats();
    fetchDockerStatus();
    fetchDockerStats();
}, 30000);
