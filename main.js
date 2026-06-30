const express = require('express');
const { NodeSSH } = require('ssh2');
const stripe = require('stripe');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = 3001;

app.use(express.json());

// Charger la configuration
let config;
try {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
        config = require(configPath);
        console.log('✅ Configuration chargée depuis config.json');
    } else {
        console.log('⚠️  Fichier config.json non trouvé. Utilisation de la configuration par défaut.');
        config = {
            server: {
                host: 'fetchr.fr',
                port: 22,
                username: 'root',
                privateKeyPath: path.join(os.homedir(), '.ssh', 'id_rsa')
            },
            stripe: {
                apiKey: process.env.STRIPE_API_KEY || ''
            },
            cloudflare: {
                apiToken: process.env.CLOUDFLARE_API_TOKEN || '',
                zoneId: process.env.CLOUDFLARE_ZONE_ID || ''
            }
        };
    }
} catch (error) {
    console.error('❌ Erreur lors du chargement de la configuration:', error);
    config = {
        server: {
            host: 'fetchr.fr',
            port: 22,
            username: 'root',
            privateKeyPath: path.join(os.homedir(), '.ssh', 'id_rsa')
        },
        stripe: { apiKey: '' },
        cloudflare: { apiToken: '', zoneId: '' }
    };
}

// Initialiser Stripe si la clé est présente
let stripeClient;
if (config.stripe.apiKey) {
    stripeClient = stripe(config.stripe.apiKey);
    console.log('✅ Stripe initialisé');
} else {
    console.log('⚠️  Clé API Stripe non configurée');
}

// Fonction pour se connecter au serveur via SSH
async function connectToServer() {
    const ssh = new NodeSSH();
    try {
        const privateKey = fs.readFileSync(path.expand(config.server.privateKeyPath));
        await ssh.connect({
            host: config.server.host,
            port: config.server.port,
            username: config.server.username,
            privateKey: privateKey
        });
        console.log(`✅ Connecté au serveur ${config.server.host} via SSH`);
        return ssh;
    } catch (error) {
        console.error('❌ Erreur SSH:', error.message);
        throw error;
    }
}

// Fonction pour exécuter une commande SSH
async function execSSHCommand(ssh, command) {
    try {
        const result = await ssh.execCommand(command);
        if (result.code !== 0) {
            console.error(`❌ Commande échouée: ${command}`, result.stderr);
            return null;
        }
        return result.stdout.trim();
    } catch (error) {
        console.error(`❌ Erreur lors de l'exécution de la commande SSH: ${command}`, error);
        return null;
    }
}

// Fonction pour récupérer les stats du serveur
async function getServerStats() {
    let ssh;
    try {
        ssh = await connectToServer();

        // Récupérer les stats CPU, RAM, Disk, Uptime
        const commands = {
            cpu: `top -bn1 | grep "Cpu(s)" | sed "s/.*, *\\([0-9.]*\\)%* id.*/\\1/" | awk '{print 100 - $1}'`,
            ram: `free -m | awk 'NR==2{printf "%.2f%%", $3*100/$2 }'`,
            disk: `df -h / | awk 'NR==2{print $5}'`,
            uptime: `uptime -p`
        };

        const results = {};
        for (const [key, cmd] of Object.entries(commands)) {
            const result = await execSSHCommand(ssh, cmd);
            results[key] = result || '--';
        }

        return results;
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des stats serveur:', error);
        return {
            cpu: '--%',
            ram: '--%',
            disk: '--%',
            uptime: '--'
        };
    } finally {
        if (ssh) ssh.dispose();
    }
}

// Fonction pour récupérer les stats Stripe
async function getStripeStats() {
    if (!stripeClient) {
        console.log('⚠️  Stripe non initialisé');
        return {
            totalSales: '--',
            totalRevenue: '-- €',
            activeSubscriptions: '--'
        };
    }

    try {
        // Récupérer les paiements réussis
        const payments = await stripeClient.paymentIntents.list({
            limit: 100,
            status: 'succeeded'
        });

        const totalSales = payments.data.length;
        const totalRevenue = payments.data.reduce(
            (sum, payment) => sum + (payment.amount || 0), 0
        ) / 100; // Convertir en euros

        // Récupérer les abonnements actifs
        const subscriptions = await stripeClient.subscriptions.list({
            status: 'active',
            limit: 100
        });
        const activeSubscriptions = subscriptions.data.length;

        return {
            totalSales: totalSales.toString(),
            totalRevenue: totalRevenue.toFixed(2) + ' €',
            activeSubscriptions: activeSubscriptions.toString()
        };
    } catch (error) {
        console.error('❌ Erreur Stripe:', error.message);
        return {
            totalSales: '--',
            totalRevenue: '-- €',
            activeSubscriptions: '--'
        };
    }
}

// Fonction pour récupérer les stats Cloudflare
async function getCloudflareStats() {
    if (!config.cloudflare.apiToken || !config.cloudflare.zoneId) {
        console.log('⚠️  Configuration Cloudflare manquante');
        return {
            requests: '--',
            bandwidth: '-- GB',
            uniqueVisitors: '--'
        };
    }

    try {
        const response = await axios.get(
            `https://api.cloudflare.com/client/v4/zones/${config.cloudflare.zoneId}/analytics/dashboard`,
            {
                headers: {
                    'Authorization': `Bearer ${config.cloudflare.apiToken}`,
                    'Content-Type': 'application/json'
                },
                params: {
                    since: -86400 // Dernières 24h (en secondes)
                }
            }
        );

        const data = response.data.result;
        return {
            requests: data.requests?.all?.toLocaleString() || '--',
            bandwidth: data.bandwidth?.all ? (data.bandwidth.all / (1024 * 1024)).toFixed(2) + ' GB' : '-- GB',
            uniqueVisitors: data.uniques?.all?.toLocaleString() || '--'
        };
    } catch (error) {
        console.error('❌ Erreur Cloudflare:', error.response?.data || error.message);
        return {
            requests: '--',
            bandwidth: '-- GB',
            uniqueVisitors: '--'
        };
    }
}

// Endpoint pour récupérer toutes les stats
app.get('/api/stats', async (req, res) => {
    try {
        const [serverStats, stripeStats, cloudflareStats] = await Promise.all([
            getServerStats(),
            getStripeStats(),
            getCloudflareStats()
        ]);

        res.json({
            server: serverStats,
            stripe: stripeStats,
            cloudflare: cloudflareStats
        });
    } catch (error) {
        console.error('❌ Erreur dans /api/stats:', error);
        res.status(500).json({
            error: 'Impossible de récupérer les statistiques',
            details: error.message
        });
    }
});

// Endpoint pour exécuter une commande SSH
app.post('/api/ssh', async (req, res) => {
    const { command } = req.body;
    if (!command) {
        return res.status(400).json({ error: 'Commande manquante' });
    }

    let ssh;
    try {
        ssh = await connectToServer();
        const result = await execSSHCommand(ssh, command);
        res.json({ output: result || '', error: null });
    } catch (error) {
        res.status(500).json({
            output: '',
            error: error.message
        });
    } finally {
        if (ssh) ssh.dispose();
    }
});

// Endpoint pour exécuter une commande Git
app.post('/api/git', async (req, res) => {
    const { action, message, branch } = req.body;

    if (!action) {
        return res.status(400).json({ error: 'Action manquante' });
    }

    let ssh;
    try {
        ssh = await connectToServer();
        let command;

        switch (action) {
            case 'push':
                if (!message) {
                    return res.status(400).json({ error: 'Message de commit manquant' });
                }
                command = `cd /root/fetchr && git add . && git commit -m \"${message}\" && git push origin ${branch || 'master'}`;
                break;
            case 'pull':
                command = 'cd /root/fetchr && git pull';
                break;
            default:
                return res.status(400).json({ error: 'Action non valide' });
        }

        const result = await execSSHCommand(ssh, command);
        res.json({ output: result || '', error: null });
    } catch (error) {
        res.status(500).json({
            output: '',
            error: error.message
        });
    } finally {
        if (ssh) ssh.dispose();
    }
});

// Endpoint pour gérer Docker
app.post('/api/docker', async (req, res) => {
    const { action, composePath } = req.body;

    if (!action) {
        return res.status(400).json({ error: 'Action manquante' });
    }

    let ssh;
    try {
        ssh = await connectToServer();
        let command;

        switch (action) {
            case 'pull':
                command = `cd ${composePath || '/root/fetchr'} && git pull`;
                break;
            case 'recompose':
                command = `cd ${composePath || '/root/fetchr'} && docker compose up --build -d`;
                break;
            case 'start-all':
                command = 'cd /root/fetchr && docker compose start';
                break;
            case 'restart-all':
                command = 'cd /root/fetchr && docker compose restart';
                break;
            case 'stop-all':
                command = 'cd /root/fetchr && docker compose stop';
                break;
            case 'status':
                command = 'cd /root/fetchr && docker compose ps';
                break;
            default:
                return res.status(400).json({ error: 'Action non valide' });
        }

        const result = await execSSHCommand(ssh, command);
        res.json({ output: result || '', error: null });
    } catch (error) {
        res.status(500).json({
            output: '',
            error: error.message
        });
    } finally {
        if (ssh) ssh.dispose();
    }
});

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`✅ Serveur backend démarré sur http://localhost:${PORT}`);
    console.log(`📡 Endpoints disponibles:`);
    console.log(`   - GET  /api/stats          → Récupérer toutes les stats`);
    console.log(`   - POST /api/ssh           → Exécuter une commande SSH`);
    console.log(`   - POST /api/git           → Exécuter une action Git`);
    console.log(`   - POST /api/docker        → Gérer Docker`);
});

// Gérer les erreurs non capturées
process.on('uncaughtException', (error) => {
    console.error('❌ Erreur non capturée:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Rejet non géré:', reason);
});
