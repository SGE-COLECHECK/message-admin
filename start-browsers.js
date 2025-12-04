const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

// Colores para la consola
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
};

console.log(`${colors.blue}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
console.log(`${colors.blue}║  🚀 Iniciador Dinámico de Navegadores WhatsApp (Node.js) ║${colors.reset}`);
console.log(`${colors.blue}╚════════════════════════════════════════════════════════════╝${colors.reset}`);
console.log('');

// 1. Leer configuración
const configPath = path.join(__dirname, 'browsers.config.json');
if (!fs.existsSync(configPath)) {
    console.error(`${colors.red}❌ Error: No se encontró browsers.config.json${colors.reset}`);
    process.exit(1);
}

let config;
try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log(`${colors.green}✓${colors.reset} Configuración cargada correctamente.`);
} catch (e) {
    console.error(`${colors.red}❌ Error al parsear browsers.config.json:${colors.reset}`, e.message);
    process.exit(1);
}

// 2. Determinar ejecutable del navegador
const platform = os.platform();
let browserCmd = '';

if (platform === 'win32') {
    browserCmd = config.browserExecutable.windows;
} else {
    browserCmd = config.browserExecutable.linux;
}

// Verificar si el comando/archivo existe (básico)
// En Windows es una ruta absoluta, en Linux puede ser un comando en PATH
if (platform === 'win32' && !fs.existsSync(browserCmd)) {
    console.error(`${colors.red}❌ Error: El ejecutable no existe en la ruta configurada:${colors.reset}`);
    console.error(`   ${browserCmd}`);
    console.error(`${colors.yellow}   Edita browsers.config.json con la ruta correcta de Edge.${colors.reset}`);
    process.exit(1);
}

console.log(`${colors.green}✓${colors.reset} Navegador: ${colors.blue}${browserCmd}${colors.reset}`);
console.log(`${colors.green}✓${colors.reset} Modo Headless: ${config.headless ? colors.yellow + 'ACTIVADO' : colors.reset + 'Desactivado'}`);
console.log('');

// 3. Filtrar cuentas habilitadas
const enabledAccounts = config.accounts.filter(acc => acc.enabled);

if (enabledAccounts.length === 0) {
    console.error(`${colors.red}❌ Error: No hay cuentas habilitadas en browsers.config.json${colors.reset}`);
    process.exit(1);
}

console.log(`${colors.green}✓${colors.reset} Cuentas habilitadas: ${colors.yellow}${enabledAccounts.length}${colors.reset}`);
console.log(`${colors.blue}════════════════════════════════════════════════════════════${colors.reset}`);
console.log('');

// 4. Lanzar navegadores
enabledAccounts.forEach(account => {
    const { id, description, debuggingPort } = account;

    console.log(`${colors.blue}→${colors.reset} Lanzando: ${colors.green}${description}${colors.reset} (${colors.yellow}${id}${colors.reset})`);
    console.log(`  Puerto: ${colors.yellow}${debuggingPort}${colors.reset}`);

    // Construir ruta del perfil
    const userHome = os.homedir();
    const profilePath = path.join(userHome, 'message-admin', 'profiles', id);

    const args = [
        `--remote-debugging-port=${debuggingPort}`,
        '--remote-debugging-address=0.0.0.0',
        `--user-data-dir=${profilePath}`
    ];

    if (config.headless) {
        args.push('--headless=new');
        args.push('--disable-gpu');
    }

    // Lanzar proceso
    try {
        const subprocess = spawn(browserCmd, args, {
            detached: true, // Permite que el navegador siga corriendo si el script termina
            stdio: 'ignore' // No atar stdio para poder salir limpiamente
        });

        subprocess.unref(); // Desvincular del proceso padre
        console.log(`  ${colors.green}✓${colors.reset} Lanzado en segundo plano.`);
    } catch (e) {
        console.error(`  ${colors.red}❌ Error al lanzar:${colors.reset}`, e.message);
    }
    console.log('');
});

console.log(`${colors.blue}════════════════════════════════════════════════════════════${colors.reset}`);
console.log(`${colors.green}✅ Proceso finalizado.${colors.reset}`);
if (!config.headless) {
    console.log('   Recuerda escanear el QR en cada ventana abierta.');
}
console.log('');
