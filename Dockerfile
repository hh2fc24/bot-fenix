# RUTA: Dockerfile (en la raíz de tu proyecto)

# Usamos una imagen de Node.js 18 para coincidir con la advertencia de Supabase, pero puedes usar una más nueva
FROM node:18-slim

# Instala todas las dependencias que Puppeteer/Chrome necesita para correr en Linux
RUN apt-get update \
    && apt-get install -yq \
    gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 \
    libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 \
    libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 \
    libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 \
    libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation \
    libappindicator1 libnss3 lsb-release xdg-utils wget \
    --no-install-recommends

# Establece el directorio de trabajo
WORKDIR /usr/src/app

# Copia los archivos de dependencias
COPY package*.json ./

# --- LÓGICA DE INSTALACIÓN MEJORADA ---
# 1. Le decimos a Puppeteer que NO descargue Chrome durante el npm install.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# 2. Instalamos las dependencias de Node.js
RUN npm install

# 3. Copiamos el resto del código de la aplicación
COPY . .

# 4. AHORA, le ordenamos a Puppeteer que instale el navegador de forma explícita.
#    Esto es más robusto y nos da un control total.
RUN npx puppeteer browsers install chrome
# --- FIN DE LA LÓGICA MEJORADA ---

# El comando para iniciar tu bot
CMD [ "node", "index.js" ]