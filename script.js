// ===== DOM Elements =====
const pushBtn = document.getElementById('push-btn');
const pullBtn = document.getElementById('pull-btn');
const recomposeBtn = document.getElementById('recompose-btn');
const refreshContainersBtn = document.getElementById('refresh-containers-btn');
const clearLogsBtn = document.getElementById('clear-logs-btn');
const refreshAllBtn = document.getElementById('refresh-all-btn');
const saveGithubBtn = document.getElementById('save-github-btn');
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

// Tabs
const tabLinks = document.querySelectorAll('.sidebar li[data-tab]');
const tabContents = document.querySelectorAll('.tab-content');

// Status LEDs
const githubStatusLed = document.getElementById('github-status');
const serverStatusLed = document.getElementById('server-status');
const dockerStatusLed = document.getElementById('docker-status');
const containerBackendStatus = document.getElementById('container-backend-status');
const containerFrontendStatus = document.getElementById('container-frontend-status');

// Status bars
const gitStatusBar = document.getElementById('git-status');
const serverStatusBar = document.getElementById('server-status-bar');

// Stats elements
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

// Logs
const logs = document.getElementById('logs');
const terminal = document.getElementById('terminal');

// ===== State =====
let isConnected = false;
let config = {
    server: {
        host: 'fetchr.fr',
        port: 22,
        username: 'root',
        privateKeyPath: '~/.ssh/id_rsa'
    },
    stripe: {
        apiKey: ''
    },
    cloudflare: {
        apiToken: '',
        zoneId: ''
    }
};

// ===== Functions =====
function addLog(message, type = 'info') {
    const logLine = document.createElement('p');
    logLine.className = 'log-line';
    logLine.innerHTML = `[${new Date().toLocaleTimeString()}] <span class="log-${type}">${message}</span>`;
    logs.appendChild(logLine);
    logs.scrollTop = logs.scrollHeight;
}

function addTerminalLine(line, type = 'output') {
    const terminalLine = document.createElement('p');
    if (type === 'prompt') {
        terminalLine.className = 'terminal-prompt';
        terminalLine.innerHTML = `root@fetchr:~$ <span class="terminal-input">${line}</span>`;
    } else if (type === 'input') {
        terminalLine.className = 'terminal-prompt';
        terminalLine.innerHTML = `root@fetchr:~$ <span class="terminal-input" id="last-terminal-input">${line}</span>`;
    } else {
        terminalLine.className = 'terminal-output';
        terminalLine.textContent = line;
    }
    terminal.appendChild(terminalLine);
    terminal.scrollTop = terminal.scrollHeight;
}

function updateStatusLed(element, status) {
    element.className = `led led-${status}`;
}

function updateStatusBar(element, message, type = 'info') {
    element.innerHTML = `<span class="status-text ${type}">${message}</span>`;
}

function simulateAction(button, actionName, successMessage, errorMessage, delay = 2000) {
    const statusBar = button.closest('.card').querySelector('.status-bar');
    if (statusBar) {
        updateStatusBar(statusBar, `${actionName} en cours...`, 'info');
    }

    setTimeout(() => {
        if (isConnected) {
            if (statusBar) {
                updateStatusBar(statusBar, successMessage, 'success');
            }
            addLog(successMessage, 'success');
        } else {
            if (statusBar) {
                updateStatusBar(statusBar, errorMessage, 'error');
            }
            addLog(errorMessage, 'error');
            openConnectModal();
        }
    }, delay);
}

// ===== Fetch Stats from Backend =====
async function fetchAllStats() {
    if (!isConnected) return;

    try {
        const response = await fetch('http://localhost:3001/api/stats');
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
        const data = await response.json();

        // Update server stats
        if (data.server) {
            serverCpu.textContent = data.server.cpu || '--%';
            serverRam.textContent = data.server.ram || '--%';
            serverDisk.textContent = data.server.disk || '--%';
            serverUptime.textContent = data.server.uptime || '--';
        }

        // Update Stripe stats
        if (data.stripe) {
            stripeSales.textContent = data.stripe.totalSales || '--';
            stripeRevenue.textContent = data.stripe.totalRevenue || '-- €';
            stripeSubscriptions.textContent = data.stripe.activeSubscriptions || '--';
        }

        // Update Cloudflare stats
        if (data.cloudflare) {
            cloudflareVisits.textContent = data.cloudflare.uniqueVisitors || '--';
        }

        addLog('Stats mises à jour avec succès !', 'success');
    } catch (error) {
        addLog(`Erreur lors de la récupération des stats: ${error.message}`, 'error');
    }
}

// ===== Load Config =====
function loadConfig() {
    try {
        const savedConfig = localStorage.getItem('fetchr-server-manager-config');
        if (savedConfig) {
            config = JSON.parse(savedConfig);
            isConnected = true;
            updateStatusLed(githubStatusLed, 'green');
            updateStatusLed(serverStatusLed, 'green');
            updateStatusLed(dockerStatusLed, 'green');
            updateStatusLed(containerBackendStatus, 'green');
            updateStatusLed(containerFrontendStatus, 'green');
            addLog('Configuration chargée avec succès !', 'success');
            fetchAllStats();
        } else {
            openConnectModal();
        }
    } catch (error) {
        addLog(`Erreur lors du chargement de la configuration: ${error}`, 'error');
    }
}

// ===== Save Config =====
function saveConfig() {
    localStorage.setItem('fetchr-server-manager-config', JSON.stringify(config));
    addLog('Configuration enregistrée !', 'success');
}

// ===== Event Listeners =====
// Tabs
tabLinks.forEach(link => {
    link.addEventListener('click', () => {
        tabLinks.forEach(l => l.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        link.classList.add('active');
        const tabId = link.getAttribute('data-tab');
        const content = document.getElementById(`${tabId}-tab`);
        if (content) content.classList.add('active');
    });
});

// Git Actions
pushBtn.addEventListener('click', () => {
    const localPath = document.getElementById('local-path').value;
    const commitMsg = document.getElementById('commit-msg').value;
    const branch = document.getElementById('git-branch').value;

    if (!commitMsg) {
        updateStatusBar(gitStatusBar, 'Message de commit vide', 'error');
        addLog('Erreur: Message de commit vide', 'error');
        return;
    }

    simulateAction(
        pushBtn,
        'Push',
        `Push réussi sur ${branch}: "${commitMsg}"`,
        'Erreur: Non connecté'
    );
});

// Server Actions
pullBtn.addEventListener('click', () => {
    const serverIp = document.getElementById('server-ip').value;
    simulateAction(
        pullBtn,
        'Pull',
        `Pull réussi depuis ${serverIp}`,
        'Erreur: Non connecté'
    );
});

recomposeBtn.addEventListener('click', () => {
    const dockerPath = document.getElementById('docker-path').value;
    simulateAction(
        recomposeBtn,
        'Recomposition Docker',
        `Docker recomposé dans ${dockerPath}`,
        'Erreur: Non connecté'
    );
});

// Docker Actions
refreshContainersBtn.addEventListener('click', () => {
    updateStatusBar(document.querySelector('#docker-tab .status-bar'), 'Rafraîchissement en cours...', 'info');

    setTimeout(() => {
        const statuses = ['green', 'red'];
        updateStatusLed(containerBackendStatus, statuses[Math.floor(Math.random() * 2)]);
        updateStatusLed(containerFrontendStatus, statuses[Math.floor(Math.random() * 2)]);

        const activeCount = [0, 1, 2][Math.floor(Math.random() * 3)];
        activeContainers.textContent = `${activeCount}/2`;
        dockerCpu.textContent = `${Math.floor(Math.random() * 100)}%`;
        dockerRam.textContent = `${Math.floor(Math.random() * 1000)} MB`;

        updateStatusBar(document.querySelector('#docker-tab .status-bar'), 'Conteneurs mis à jour', 'success');
        addLog('Conteneurs Docker rafraîchis', 'success');
    }, 1500);
});

// Logs
clearLogsBtn.addEventListener('click', () => {
    logs.innerHTML = '';
    addLog('Logs effacés', 'info');
});

// Refresh All
refreshAllBtn.addEventListener('click', () => {
    addLog('Rafraîchissement de toutes les stats...', 'info');
    fetchAllStats();
});

// Terminal
terminalInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const command = terminalInput.value;
        if (command) {
            addTerminalLine(command, 'input');
            terminalInput.value = '';

            // Simulate command execution
            setTimeout(() => {
                if (command === 'ls -la') {
                    addTerminalLine('drwxr-xr-x  5 root root 4096 Jun 30 10:00 fetchr');
                    addTerminalLine('drwxr-xr-x  3 root root 4096 Jun 30 10:01 docker');
                } else if (command === 'docker ps') {
                    addTerminalLine('CONTAINER ID   IMAGE          COMMAND       CREATED      STATUS      PORTS     NAMES');
                    addTerminalLine('abc12345678   nginx:alpine   "nginx -g..."  2 days ago   Up 2 days   80/tcp    fetchr_frontend');
                    addTerminalLine('def98765432   python:3.12    "uvicorn..."   2 days ago   Up 2 days   8000/tcp  fetchr_backend');
                } else {
                    addTerminalLine(`Command not found: ${command}`);
                }
                addTerminalLine('', 'prompt');
            }, 500);
        }
    }
});

terminalSendBtn.addEventListener('click', () => {
    const command = terminalInput.value;
    if (command) {
        terminalInput.value = '';
        addTerminalLine(command, 'input');

        setTimeout(() => {
            addTerminalLine(`Exécuté: ${command}`, 'output');
            addTerminalLine('', 'prompt');
        }, 500);
    }
});

// Config
saveSshBtn.addEventListener('click', () => {
    const sshKeyPath = document.getElementById('ssh-key-path').value;
    if (sshKeyPath) {
        config.server.privateKeyPath = sshKeyPath;
        saveConfig();
        addLog('Chemin de la clé SSH enregistré !', 'success');
    } else {
        addLog('Erreur: Chemin de la clé SSH vide', 'error');
    }
});

saveStripeBtn.addEventListener('click', () => {
    const apiKey = document.getElementById('stripe-api-key').value;
    if (apiKey) {
        config.stripe.apiKey = apiKey;
        saveConfig();
        addLog('Clé API Stripe enregistrée !', 'success');
    } else {
        addLog('Erreur: Clé API Stripe vide', 'error');
    }
});

saveCloudflareBtn.addEventListener('click', () => {
    const apiToken = document.getElementById('cloudflare-api-token').value;
    const zoneId = document.getElementById('cloudflare-zone-id').value;
    if (apiToken && zoneId) {
        config.cloudflare.apiToken = apiToken;
        config.cloudflare.zoneId = zoneId;
        saveConfig();
        addLog('Configuration Cloudflare enregistrée !', 'success');
    } else {
        addLog('Erreur: Token ou Zone ID Cloudflare vide', 'error');
    }
});

// Connection Modal
function openConnectModal() {
    connectModal.style.display = 'block';
}

function closeConnectModal() {
    connectModal.style.display = 'none';
}

confirmConnectBtn.addEventListener('click', () => {
    const sshKeyPath = document.getElementById('modal-ssh-key-path').value;
    if (sshKeyPath) {
        config.server.privateKeyPath = sshKeyPath;
        isConnected = true;
        saveConfig();
        closeConnectModal();
        updateStatusLed(githubStatusLed, 'green');
        updateStatusLed(serverStatusLed, 'green');
        updateStatusLed(dockerStatusLed, 'green');
        updateStatusLed(containerBackendStatus, 'green');
        updateStatusLed(containerFrontendStatus, 'green');
        addLog('Connecté avec succès !', 'success');
        fetchAllStats();
    } else {
        addLog('Erreur: Chemin de la clé SSH requis', 'error');
    }
});

cancelConnectBtn.addEventListener('click', closeConnectModal);
closeModal.addEventListener('click', closeConnectModal);

// Logout
logoutBtn.addEventListener('click', () => {
    isConnected = false;
    localStorage.removeItem('fetchr-server-manager-config');
    updateStatusLed(githubStatusLed, 'red');
    updateStatusLed(serverStatusLed, 'red');
    updateStatusLed(dockerStatusLed, 'red');
    updateStatusLed(containerBackendStatus, 'red');
    updateStatusLed(containerFrontendStatus, 'red');
    addLog('Déconnecté', 'info');
    openConnectModal();
});

// Settings Button
settingsBtn.addEventListener('click', () => {
    tabLinks.forEach(l => l.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));

    const configTabLink = document.querySelector('.sidebar li[data-tab="config"]');
    if (configTabLink) {
        configTabLink.classList.add('active');
        const configTab = document.getElementById('config-tab');
        if (configTab) configTab.classList.add('active');
    }
});

// Close modal on outside click
window.addEventListener('click', (e) => {
    if (e.target === connectModal) {
        closeConnectModal();
    }
});

// ===== Initialization =====
// Add initial logs
addLog('Démarrage de Fetchr Server Manager...', 'info');

// Add initial terminal prompt
addTerminalLine('', 'prompt');

// Load config
loadConfig();

// Start auto-refresh
setInterval(() => {
    if (isConnected) {
        fetchAllStats();
    }
}, 30000); // Rafraîchir toutes les 30 secondes
