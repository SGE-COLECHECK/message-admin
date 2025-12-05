# ---- Etapa 1: Builder ----
FROM node:20-alpine AS builder

WORKDIR /app

# Instala dependencias de compilación temporales
RUN apk add --no-cache python3 make g++

# Copia package files
# Instala TODAS las dependencias (incluye devDependencies)
COPY package*.json ./
RUN npm ci --only=production && \
    # Copia también devDependencies para el build
    npm ci

# Copia el código fuente
COPY . .

# Compila la aplicación
RUN npm run build

# ---- Etapa 2: Producción ----
FROM node:20-alpine

WORKDIR /app

# Instala dependencias del sistema MÍNIMAS pero ESENCIALES para Puppeteer
# Corrección: usamos chromium-browser y fonts adecuados
RUN apk add --no-cache \
    chromium-browser \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-liberation \
    fontconfig \
    # Necesario para healthchecks
    curl

# Configuración crítica para entorno headless
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    # Evita problem de sandbox en Docker
    CHROME_DEVEL_SANDBBOX=/usr/lib/chromium/chrome-sandbox \
    # Locale para evitar errores de renderizado
    LANG=es_ES.UTF-8 \
    LANGUAGE=es_ES:en \
    LC_ALL=es_ES.UTF-8

# Copia solo lo necesario desde builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/public ./public

# Crea directorios necesarios para persistencia
RUN mkdir -p /app/profiles /app/.wwebjs_auth

# Cambia permisos del sandbox de Chrome
RUN chmod 4755 /usr/lib/chromium/chrome-sandbox

# Usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S pptruser -u 1001 -G nodejs && \
    chown -R pptruser:nodejs /app

USER pptruser
EXPOSE 3000

CMD ["node", "dist/main.js"]