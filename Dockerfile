# Usa una imagen oficial de Node.js que incluye herramientas de construcción
FROM node:18-slim

# Instala todas las dependencias que Puppeteer/Chrome necesita para correr en Linux
# Este es el paso clave que soluciona el problema
RUN apt-get update \
    && apt-get install -yq \
    gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 \
    libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 \
    libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 \
    libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 \
    libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation \
    libappindicator1 libnss3 lsb-release xdg-utils wget \
    --no-install-recommends

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# Copia los archivos de dependencias
COPY package*.json ./

# Instala las dependencias de Node.js Y el navegador de Puppeteer
# PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false asegura que el navegador se descargue
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
RUN npm install

# Copia el resto del código de tu aplicación
COPY . .

# El comando para iniciar tu bot cuando el contenedor se ejecute
CMD [ "node", "index.js" ]