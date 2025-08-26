# RUTA: Dockerfile (en la raíz de tu proyecto)

# Usamos una imagen de Node.js 18 para coincidir con la advertencia de Supabase, pero puedes usar una más nueva
FROM node:18-slim

# --- LISTA DE DEPENDENCIAS ACTUALIZADA Y MÁS COMPLETA ---
# Instala todas las dependencias que Puppeteer/Chrome necesita para correr en Linux, incluyendo libgbm1
RUN apt-get update \
    && apt-get install -yq wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Establece el directorio de trabajo
WORKDIR /usr/src/app

# Copia los archivos de dependencias
COPY package*.json ./

# 1. Le decimos a Puppeteer que NO descargue Chrome, porque ya lo instalamos con apt-get
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# 2. Instalamos las dependencias de Node.js
RUN npm install

# 3. Copiamos el resto del código de la aplicación
COPY . .

# El comando para iniciar tu bot
CMD [ "node", "index.js" ]