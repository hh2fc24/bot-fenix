// RUTA: src/utils/location.js

const axios = require('axios');
const puppeteer = require('puppeteer');
const { openCageApiKey } = require('../config');

// --- GESTIÓN DEL NAVEGADOR PERSISTENTE ---
let browserInstance;

async function initBrowser() {
  if (browserInstance) return;
  console.log('🚀 Iniciando instancia única de navegador para uso bajo demanda...');
  browserInstance = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process'
    ]
  });
  console.log('✅ Navegador listo.');
}

async function closeBrowser() {
  if (browserInstance) {
    console.log('👋 Cerrando instancia de navegador...');
    await browserInstance.close();
    browserInstance = null;
  }
}

// --- MÉTODO LIGERO PARA EXPANDIR URL (NIVEL 2) ---
async function expandUrlSimple(url) {
  try {
    // Usamos .head para una petición más ligera, solo queremos los headers
    await axios.head(url, { maxRedirects: 0, timeout: 4000 });
    return url; // Si no hay redirección, devuelve la URL original
  } catch (error) {
    // Si hay un error de redirección (3xx), devolvemos la nueva ubicación
    if (error.response && error.response.status >= 300 && error.response.status < 400 && error.response.headers.location) {
      return error.response.headers.location;
    }
    return url; // Si hay otro error, devuelve la original para no fallar
  }
}

// --- MÉTODO PESADO CON PUPPETEER (NIVEL 3) ---
async function expandUrlWithPuppeteer(url) {
  if (!browserInstance) {
    console.error('ERROR: Puppeteer no está iniciado. No se puede expandir la URL.');
    return url;
  }
  let page;
  try {
    page = await browserInstance.newPage();
    // Optimización: Bloquea recursos innecesarios como imágenes y CSS
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });
    // Navega y espera a que la red se calme, señal de que los redirects JS terminaron
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });
    const finalUrl = page.url();
    console.log(`URL final obtenida con Puppeteer: ${finalUrl}`);
    return finalUrl;
  } catch (e) {
    console.error(`Fallo al expandir URL con Puppeteer: ${e.message}`);
    return url;
  } finally {
    if (page) await page.close(); // Siempre cierra la pestaña
  }
}

// --- FUNCIÓN ORQUESTADORA PRINCIPAL ---
async function extractLocation(text) {
  const GOOGLE_URL_REGEX = /(https?:\/\/[^\s]*(maps|goo\.gl|google|googleusercontent|mapas )[^\s]*)/i;
  const urlMatch = text.match(GOOGLE_URL_REGEX);
  const coordsInText = extractCoordinatesFromText(text);

  if (coordsInText) {
    const geoData = await reverseGeocode(coordsInText.lat, coordsInText.lng);
    return { ...geoData, ...coordsInText, originalText: text };
  }
  
  if (!urlMatch) return null;

  const originalUrl = urlMatch[0];
  const patterns = [ /@(-?\d+\.\d+),(-?\d+\.\d+)/, /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/ ];
  
  const findCoords = async (url) => {
    for (const re of patterns) {
      const m = url.match(re);
      if (m && m.length >= 3) {
        const lat = parseFloat(m[1]);
        const lng = parseFloat(m[2]);
        if (!isNaN(lat) && !isNaN(lng)) {
          const geoData = await reverseGeocode(lat, lng);
          return { ...geoData, lat, lng, originalUrl: originalUrl };
        }
      }
    }
    return null;
  };

  // Nivel 1: Búsqueda directa en la URL original
  let coords = await findCoords(originalUrl);
  if (coords) {
    console.log("✅ Coordenadas encontradas en Nivel 1 (URL Original).");
    return coords;
  }

  // Nivel 2: Búsqueda con expansión ligera
  const simpleExpandedUrl = await expandUrlSimple(originalUrl);
  coords = await findCoords(simpleExpandedUrl);
  if (coords) {
    console.log("✅ Coordenadas encontradas en Nivel 2 (Expansión Ligera).");
    return coords;
  }

  // Nivel 3: Búsqueda con Puppeteer como último recurso
  console.log("⚠️ Métodos ligeros fallaron. Activando Nivel 3 (Puppeteer)...");
  const puppeteerExpandedUrl = await expandUrlWithPuppeteer(simpleExpandedUrl);
  coords = await findCoords(puppeteerExpandedUrl);
  if (coords) {
    console.log("✅ Coordenadas encontradas en Nivel 3 (Puppeteer).");
    return coords;
  }
  
  console.error(`❌ Fallaron todos los niveles. No se pudieron extraer coordenadas de la URL final: ${puppeteerExpandedUrl}`);
  return null;
}

// --- FUNCIONES DE SOPORTE ---
async function geocodeAddress(address) {
  try {
    const { data } = await axios.get(
      "https://api.opencagedata.com/geocode/v1/json",
      {
        params: { q: address, key: openCageApiKey, language: "es", countrycode: "bo", limit: 1 },
        timeout: 8000,
      }
    );
    const best = data?.results?.[0];
    if (!best) return null;
    const comp = best?.components || {};
    const city = comp.city || comp.town || comp.village || comp.county || comp.state || null;
    const country = comp.country || null;
    return {
      address: best.formatted,
      city,
      country,
      lat: best.geometry.lat,
      lng: best.geometry.lng,
    };
  } catch (e) {
    console.error("Error en OpenCage (Geocoding):", e?.message);
    return null;
  }
}

async function reverseGeocode(lat, lng) {
  try {
    const { data } = await axios.get(
      "https://api.opencagedata.com/geocode/v1/json",
      {
        params: { q: `${lat},${lng}`, key: openCageApiKey, language: "es" },
        timeout: 8000,
      }
     );
    const best = data?.results?.[0];
    const formatted = best?.formatted || `Latitud: ${lat}, Longitud: ${lng}`;
    const comp = best?.components || {};
    const city = comp.city || comp.town || comp.village || comp.county || comp.state || null;
    const country = comp.country || null;
    return { address: formatted, city, country };
  } catch (e) {
    console.error("Error en OpenCage:", e?.message);
    return { address: `Latitud: ${lat}, Longitud: ${lng}`, city: null, country: null };
  }
}

function extractCoordinatesFromText(text) {
    const patterns = [
        /(-?\d+\.\d+)[,\s]\s*(-?\d+\.\d+)/,
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            const lat = parseFloat(match[1]);
            const lng = parseFloat(match[2]);
            if (!isNaN(lat) && !isNaN(lng)) {
                return { lat, lng };
            }
        }
    }
    return null;
}

module.exports = {
  initBrowser,
  closeBrowser,
  geocodeAddress,
  reverseGeocode,
  extractLocation,
};