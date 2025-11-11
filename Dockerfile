# ---- Etapa 1: El Constructor (Builder) ----
# Usamos una imagen completa para tener acceso a todas las herramientas de desarrollo
FROM node:20-alpine AS builder

WORKDIR /app

# Copiamos solo los archivos de package para instalar dependencias primero
# Aprovechamos el cache de Docker si no cambian los packages
COPY package*.json ./

# Instalamos TODAS las dependencias, incluyendo las de desarrollo
RUN npm install

# Copiamos todo el código fuente
COPY . .

# Compilamos la aplicación
RUN npm run build


# ---- Etapa 2: La Imagen de Producción ----
# Empezamos desde una imagen limpia y ligera
FROM node:20-alpine

WORKDIR /app

# Instalamos las dependencias del sistema que Puppeteer necesita
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    git \
    python3 \
    make \
    g++

# Le decimos a Puppeteer que no descargue Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copiamos SOLO las dependencias de producción desde la etapa "builder"
COPY --from=builder /app/node_modules ./node_modules
# Copiamos el código compilado desde la etapa "builder"
COPY --from=builder /app/dist ./dist
# Copiamos otros archivos necesarios como package.json
COPY --from=builder /app/package*.json ./
# ---- ¡LÍNEA CLAVE AÑADIDA! ----
# Copiamos la carpeta 'public' para servir tus archivos estáticos
COPY --from=builder /app/public ./public

# Exponemos el puerto
EXPOSE 3000

# Comando para iniciar la aplicación
CMD ["node", "dist/main.js"]