const express = require('express');
const { NodeSSH } = require('node-ssh');
const stripe = require('stripe');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const execAsync = util.promisify(exec);

const app = express();
const PORT = process.env.PORT || 3001;

// MODE: "server" = runs ON the VPS (local commands), "remote" = desktop app (SSH)
const MODE = process.env.ADMIN_MODE || 'remote';
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const FETCHR_PATH = MODE === 'server' ? '/home/ubuntu/fetchr' : '/home/horzyon/Projets/video-downloader';
const VPS_FETCHR_PATH = '/home/ubuntu/fetchr';

app.use(express.json());
app.use(express.static(__dirname));

// Load config
let config;
try {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
        config = require(configPath);
        console.log(`[${MODE}] Configuration loaded`);
    } else {
        config = {
            server: { host: '152.228.137.122', port: 22, username: 'ubuntu', privateKeyPath: '~/.ssh/id_ed25519' },
            stripe: { apiKey: '' },
            cloudflare: { apiToken: '', zoneId: '' }
        };
    }
} catch (error) {
    console.error('Config error:', error);
    config = {
        server: { host: '152.228.137.122', port: 22, username: 'ubuntu', privateKeyPath: '~/.ssh/id_ed25519' },
        stripe: { apiKey: '' },
        cloudflare: { apiToken: '', zoneId: '' }
    };
}

// Auth config - load or generate on first run
const AUTH_FILE = path.join(__dirname, '.auth.json');
let authConfig;

function loadOrCreateAuth() {
    if (fs.existsSync(AUTH_FILE)) {
        authConfig = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    } else {
        const defaultPassword = crypto.randomBytes(16).toString('hex');
        authConfig = {
            username: 'admin',
            passwordHash: bcrypt.hashSync(defaultPassword, 10),
        };
        fs.writeFileSync(AUTH_FILE, JSON.stringify(authConfig, null, 2));
        console.log('========================================');
        console.log('  ADMIN CREDENTIALS (first run only)');
        console.log(`  Username: admin`);
        console.log(`  Password: ${defaultPassword}`);
        console.log('  Change with: POST /api/auth/change-password');
        console.log('========================================');
    }
}

loadOrCreateAuth();

// Stripe init
let stripeClient;
if (config.stripe.apiKey) {
    stripeClient = stripe(config.stripe.apiKey);
}

// --- Auth middleware ---

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token requis' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch {
        return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
}

// --- Auth endpoints ---

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username et password requis' });
    }
    if (username !== authConfig.username || !bcrypt.compareSync(password, authConfig.passwordHash)) {
        return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    const token = jwt.sign({ username, mode: MODE }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, mode: MODE });
});

app.post('/api/auth/change-password', authMiddleware, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Mots de passe requis' });
    }
    if (!bcrypt.compareSync(currentPassword, authConfig.passwordHash)) {
        return res.status(403).json({ error: 'Mot de passe actuel incorrect' });
    }
    authConfig.passwordHash = bcrypt.hashSync(newPassword, 10);
    fs.writeFileSync(AUTH_FILE, JSON.stringify(authConfig, null, 2));
    res.json({ success: true });
});

app.get('/api/auth/check', authMiddleware, (req, res) => {
    res.json({ valid: true, mode: MODE, username: req.user.username });
});

// --- Command execution (mode-aware) ---

async function runCommand(command) {
    if (MODE === 'server') {
        const { stdout, stderr } = await execAsync(command);
        return stdout.trim() || stderr.trim();
    } else {
        const ssh = await connectToServer();
        try {
            const result = await ssh.execCommand(command);
            return result.stdout.trim() || result.stderr.trim();
        } finally {
            ssh.dispose();
        }
    }
}

async function connectToServer() {
    const ssh = new NodeSSH();
    const keyPath = config.server.privateKeyPath.replace('~', os.homedir());
    await ssh.connect({
        host: config.server.host,
        port: config.server.port,
        username: config.server.username,
        privateKey: fs.readFileSync(keyPath, 'utf8')
    });
    return ssh;
}

// --- Info endpoint (no auth, for client detection) ---

app.get('/api/info', (req, res) => {
    res.json({ mode: MODE, version: '2.0.0' });
});

// --- All other endpoints require auth ---

app.get('/api/stats', authMiddleware, async (req, res) => {
    try {
        const [serverStats, stripeStats, cloudflareStats] = await Promise.all([
            getServerStats(),
            getStripeStats(),
            getCloudflareStats()
        ]);
        res.json({ server: serverStats, stripe: stripeStats, cloudflare: cloudflareStats });
    } catch (error) {
        res.status(500).json({ error: 'Impossible de récupérer les statistiques', details: error.message });
    }
});

app.post('/api/ssh', authMiddleware, async (req, res) => {
    const { command } = req.body;
    if (!command) return res.status(400).json({ error: 'Commande manquante' });

    try {
        const result = await runCommand(command);
        res.json({ output: result || '', error: null });
    } catch (error) {
        res.status(500).json({ output: '', error: error.message });
    }
});

app.post('/api/git', authMiddleware, async (req, res) => {
    const { action, message, branch, source } = req.body;
    if (!action) return res.status(400).json({ error: 'Action manquante' });

    try {
        if (MODE === 'remote' && source === 'local') {
            // Desktop mode: local git operations
            let command;
            switch (action) {
                case 'push':
                    if (!message) return res.status(400).json({ error: 'Message de commit manquant' });
                    command = `cd "${FETCHR_PATH}" && git add . && (git diff --cached --quiet && echo "Rien à commiter, push direct" && git push origin ${branch || 'master'} || (git commit -m "${message.replace(/"/g, '\\"')}" && git push origin ${branch || 'master'}))`;
                    break;
                case 'pull':
                    command = `cd "${FETCHR_PATH}" && git pull`;
                    break;
                default:
                    return res.status(400).json({ error: 'Action non valide' });
            }
            const { stdout, stderr } = await execAsync(command);
            res.json({ output: stdout || stderr || 'OK', error: null });
        } else {
            // Server mode OR remote server operations
            const gitPath = MODE === 'server' ? FETCHR_PATH : '/home/ubuntu/fetchr';
            let command;
            switch (action) {
                case 'push':
                    if (!message) return res.status(400).json({ error: 'Message de commit manquant' });
                    command = `cd ${gitPath} && git add . && git commit -m "${message.replace(/"/g, '\\"')}" && git push origin ${branch || 'master'}`;
                    break;
                case 'pull':
                    command = `cd ${gitPath} && git pull`;
                    break;
                default:
                    return res.status(400).json({ error: 'Action non valide' });
            }
            const result = await runCommand(command);
            res.json({ output: result || '', error: null });
        }
    } catch (error) {
        res.status(500).json({ output: '', error: error.message });
    }
});

app.post('/api/docker', authMiddleware, async (req, res) => {
    const { action, composePath } = req.body;
    if (!action) return res.status(400).json({ error: 'Action manquante' });

    try {
        const dockerPath = composePath || (MODE === 'server' ? FETCHR_PATH : VPS_FETCHR_PATH);
        const composeFile = '-f docker-compose.prod.yml';
        let command;
        switch (action) {
            case 'pull':
                command = `cd ${dockerPath} && git pull`;
                break;
            case 'recompose':
                command = `cd ${dockerPath} && docker compose ${composeFile} up --build -d`;
                break;
            case 'start-all':
                command = `cd ${dockerPath} && docker compose ${composeFile} start`;
                break;
            case 'restart-all':
                command = `cd ${dockerPath} && docker compose ${composeFile} restart`;
                break;
            case 'stop-all':
                command = `cd ${dockerPath} && docker compose ${composeFile} stop`;
                break;
            case 'status':
                command = `cd ${dockerPath} && docker compose ${composeFile} ps`;
                break;
            default:
                return res.status(400).json({ error: 'Action non valide' });
        }
        const result = await runCommand(command);
        res.json({ output: result || '', error: null });
    } catch (error) {
        res.status(500).json({ output: '', error: error.message });
    }
});

app.get('/api/docker/stats', authMiddleware, async (req, res) => {
    try {
        const result = await runCommand('docker stats --no-stream --format "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}"');
        if (result) {
            const containers = result.split('\n').filter(l => l.trim()).map(line => {
                const [name, cpu, mem] = line.split('|');
                return { name, cpu, mem };
            });
            res.json({ containers });
        } else {
            res.json({ containers: [] });
        }
    } catch (error) {
        res.status(500).json({ error: error.message, containers: [] });
    }
});

app.get('/api/git/sync-status', authMiddleware, async (req, res) => {
    try {
        const gitPath = MODE === 'server' ? FETCHR_PATH : VPS_FETCHR_PATH;
        await runCommand(`cd ${gitPath} && git fetch origin 2>/dev/null`);
        const local = await runCommand(`cd ${gitPath} && git rev-parse HEAD`);
        const remote = await runCommand(`cd ${gitPath} && git rev-parse origin/master`);
        const behind = await runCommand(`cd ${gitPath} && git rev-list HEAD..origin/master --count`);
        const ahead = await runCommand(`cd ${gitPath} && git rev-list origin/master..HEAD --count`);
        res.json({
            local: local.trim(),
            remote: remote.trim(),
            behind: parseInt(behind) || 0,
            ahead: parseInt(ahead) || 0,
            synced: local.trim() === remote.trim()
        });
    } catch (error) {
        res.status(500).json({ error: error.message, synced: true });
    }
});

app.get('/api/git/history', authMiddleware, async (req, res) => {
    try {
        const gitPath = MODE === 'server' ? FETCHR_PATH : VPS_FETCHR_PATH;
        const result = await runCommand(`cd ${gitPath} && git log --oneline -20 --format="%h|%s|%cr|%an"`);
        if (result) {
            const commits = result.split('\n').filter(l => l.trim()).map(line => {
                const [hash, msg, date, author] = line.split('|');
                return { hash, msg, date, author };
            });
            res.json({ commits });
        } else {
            res.json({ commits: [] });
        }
    } catch (error) {
        res.status(500).json({ error: error.message, commits: [] });
    }
});

// --- Stats functions ---

async function getServerStats() {
    try {
        const commands = {
            cpu: `top -bn1 | grep "Cpu(s)" | sed "s/.*, *\\([0-9.]*\\)%* id.*/\\1/" | awk '{print 100 - $1}'`,
            ram: `free -m | awk 'NR==2{printf "%.2f%%", $3*100/$2 }'`,
            disk: `df -h / | awk 'NR==2{print $5}'`,
            uptime: `uptime -p`
        };

        const results = {};
        for (const [key, cmd] of Object.entries(commands)) {
            try {
                results[key] = await runCommand(cmd) || '--';
            } catch {
                results[key] = '--';
            }
        }
        return results;
    } catch {
        return { cpu: '--%', ram: '--%', disk: '--%', uptime: '--' };
    }
}

async function getStripeStats() {
    if (!stripeClient) return { totalSales: '--', totalRevenue: '-- €', activeSubscriptions: '--' };

    try {
        const payments = await stripeClient.charges.list({ limit: 100 });
        const successfulPayments = payments.data.filter(p => p.paid && !p.refunded);
        const totalSales = successfulPayments.length;
        const totalRevenue = successfulPayments.reduce((sum, p) => sum + (p.amount || 0), 0) / 100;

        const subscriptions = await stripeClient.subscriptions.list({ status: 'active', limit: 100 });
        return {
            totalSales: totalSales.toString(),
            totalRevenue: totalRevenue.toFixed(2) + ' €',
            activeSubscriptions: subscriptions.data.length.toString()
        };
    } catch {
        return { totalSales: '--', totalRevenue: '-- €', activeSubscriptions: '--' };
    }
}

async function getCloudflareStats() {
    if (!config.cloudflare.apiToken || !config.cloudflare.zoneId) {
        return { requests: '--', bandwidth: '-- GB', uniqueVisitors: '--' };
    }

    try {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const query = `{
            viewer {
                zones(filter: {zoneTag: "${config.cloudflare.zoneId}"}) {
                    httpRequests1dGroups(limit: 1, filter: {date_geq: "${yesterday.toISOString().split('T')[0]}", date_leq: "${now.toISOString().split('T')[0]}"}) {
                        sum { requests bytes }
                        uniq { uniques }
                    }
                }
            }
        }`;

        const response = await axios.post('https://api.cloudflare.com/client/v4/graphql', { query }, {
            headers: { 'Authorization': `Bearer ${config.cloudflare.apiToken}`, 'Content-Type': 'application/json' }
        });

        const zones = response.data?.data?.viewer?.zones;
        if (zones?.length > 0 && zones[0].httpRequests1dGroups.length > 0) {
            const data = zones[0].httpRequests1dGroups[0];
            return {
                requests: data.sum.requests?.toLocaleString() || '--',
                bandwidth: data.sum.bytes ? (data.sum.bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB' : '-- GB',
                uniqueVisitors: data.uniq.uniques?.toLocaleString() || '--'
            };
        }
        return { requests: '--', bandwidth: '-- GB', uniqueVisitors: '--' };
    } catch {
        return { requests: '--', bandwidth: '-- GB', uniqueVisitors: '--' };
    }
}

// --- Deploy admin panel (commit + push + pull on VPS + restart service) ---

const ADMIN_LOCAL_PATH = '/home/horzyon/fetchr-server-manager';
const ADMIN_VPS_PATH = '/home/ubuntu/fetchr-server-manager';
const ADMIN_SERVICE = 'fetchr-admin';

app.post('/api/deploy', authMiddleware, async (req, res) => {
    const { message } = req.body;
    const commitMsg = message || `Admin panel update ${new Date().toISOString().slice(0, 16)}`;
    const steps = [];

    try {
        if (MODE === 'remote') {
            // Step 1: commit local changes
            try {
                const { stdout: statusOut } = await execAsync(`cd "${ADMIN_LOCAL_PATH}" && git status --porcelain`);
                if (statusOut.trim()) {
                    const { stdout: commitOut } = await execAsync(`cd "${ADMIN_LOCAL_PATH}" && git add . && git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
                    steps.push({ step: 'commit', status: 'ok', output: commitOut.split('\n')[0] });
                } else {
                    steps.push({ step: 'commit', status: 'skipped', output: 'Rien à commiter' });
                }
            } catch (e) {
                steps.push({ step: 'commit', status: 'skipped', output: 'Nothing to commit' });
            }

            // Step 2: push to origin
            try {
                await execAsync(`cd "${ADMIN_LOCAL_PATH}" && git push origin main`);
                steps.push({ step: 'push', status: 'ok', output: 'Pushed to origin/main' });
            } catch (e) {
                try {
                    await execAsync(`cd "${ADMIN_LOCAL_PATH}" && git push origin master`);
                    steps.push({ step: 'push', status: 'ok', output: 'Pushed to origin/master' });
                } catch (e2) {
                    steps.push({ step: 'push', status: 'error', output: e2.message });
                    return res.json({ success: false, steps });
                }
            }

            // Step 3: pull on VPS
            try {
                const pullOut = await runCommand(`cd ${ADMIN_VPS_PATH} && git pull`);
                steps.push({ step: 'pull', status: 'ok', output: pullOut });
            } catch (e) {
                steps.push({ step: 'pull', status: 'error', output: e.message });
                return res.json({ success: false, steps });
            }

            // Step 4: install deps + restart service
            try {
                await runCommand(`cd ${ADMIN_VPS_PATH} && npm install --production`);
                const restartOut = await runCommand(`sudo systemctl restart ${ADMIN_SERVICE}`);
                steps.push({ step: 'restart', status: 'ok', output: restartOut || 'Service redémarré' });
            } catch (e) {
                steps.push({ step: 'restart', status: 'error', output: e.message });
                return res.json({ success: false, steps });
            }
        } else {
            // Server mode: pull + restart self
            try {
                const pullOut = await execAsync(`cd ${ADMIN_VPS_PATH} && git pull`);
                steps.push({ step: 'pull', status: 'ok', output: pullOut.stdout.trim() });
            } catch (e) {
                steps.push({ step: 'pull', status: 'error', output: e.message });
                return res.json({ success: false, steps });
            }

            try {
                await execAsync(`cd ${ADMIN_VPS_PATH} && npm install --production`);
                steps.push({ step: 'install', status: 'ok', output: 'Deps installées' });
            } catch (e) {
                steps.push({ step: 'install', status: 'error', output: e.message });
            }

            // Restart self (response sent before restart)
            steps.push({ step: 'restart', status: 'ok', output: 'Redémarrage en cours...' });
            res.json({ success: true, steps });
            setTimeout(() => execAsync(`sudo systemctl restart ${ADMIN_SERVICE}`), 500);
            return;
        }

        res.json({ success: true, steps });
    } catch (error) {
        res.status(500).json({ success: false, steps, error: error.message });
    }
});

// --- Transfers: disk, files, logs ---

app.get('/api/transfers/disk', authMiddleware, async (req, res) => {
    try {
        const result = await runCommand(`df -B1 / | awk 'NR==2{print $2"|"$3"|"$4"|"$5}'`);
        const [total, used, free, percent] = result.split('|');
        res.json({
            total: parseInt(total),
            used: parseInt(used),
            free: parseInt(free),
            percent: parseInt(percent)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/transfers/files', authMiddleware, async (req, res) => {
    const dir = req.query.path || '/home/ubuntu/transfer';
    const allowedRoots = ['/home/ubuntu/transfer', '/home/ubuntu', '/'];
    const isAllowed = allowedRoots.some(root => dir === root || dir.startsWith(root + '/'));
    if (!isAllowed) return res.status(403).json({ error: 'Chemin non autorisé' });

    try {
        await runCommand(`mkdir -p /home/ubuntu/transfer`);
        const result = await runCommand(`ls -la --time-style=long-iso "${dir}" 2>/dev/null | tail -n +2`);
        if (!result) return res.json({ path: dir, files: [] });

        const files = result.split('\n').filter(l => l.trim()).map(line => {
            const parts = line.split(/\s+/);
            if (parts.length < 8) return null;
            const perms = parts[0];
            const size = parseInt(parts[4]);
            const date = parts[5] + ' ' + parts[6];
            const name = parts.slice(7).join(' ');
            if (name === '.' || name === '..') return null;
            return {
                name,
                isDir: perms.startsWith('d'),
                size,
                date
            };
        }).filter(Boolean);

        res.json({ path: dir, files });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/transfers/watch', authMiddleware, async (req, res) => {
    try {
        await runCommand(`mkdir -p /home/ubuntu/transfer`);
        const result = await runCommand(`find /home/ubuntu/transfer -type f -mmin -60 -exec ls -lh --time-style=long-iso {} \\; 2>/dev/null | sort -k6,7 -r | head -20`);
        const files = [];
        if (result) {
            result.split('\n').filter(l => l.trim()).forEach(line => {
                const parts = line.split(/\s+/);
                if (parts.length >= 8) {
                    files.push({
                        size: parts[4],
                        date: parts[5] + ' ' + parts[6],
                        path: parts.slice(7).join(' ').replace('/home/ubuntu/transfer/', '')
                    });
                }
            });
        }
        res.json({ files });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/transfers/auth-log', authMiddleware, async (req, res) => {
    try {
        const result = await runCommand(`grep -i "scp\\|sftp\\|ssh" /var/log/auth.log 2>/dev/null | tail -30 || journalctl -u ssh --no-pager -n 30 2>/dev/null | grep -i "session\\|accepted\\|connection"`);
        const lines = result ? result.split('\n').filter(l => l.trim()) : [];
        res.json({ lines });
    } catch (error) {
        res.json({ lines: [] });
    }
});

// --- Fetchr health (cookie status) ---

app.get('/api/fetchr/health', authMiddleware, async (req, res) => {
    try {
        const backendUrl = MODE === 'server'
            ? 'http://localhost:8000/health'
            : 'http://152.228.137.122:8000/health';
        const response = await axios.get(backendUrl, { timeout: 5000 });
        res.json(response.data);
    } catch (error) {
        res.json({ status: 'unreachable', cookies_expired: null, cookies_file: null });
    }
});

// Start
app.listen(PORT, () => {
    console.log(`Fetchr Admin [${MODE}] running on port ${PORT}`);
});

process.on('uncaughtException', (error) => console.error('Uncaught:', error));
process.on('unhandledRejection', (reason) => console.error('Unhandled:', reason));
