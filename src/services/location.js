const axios = require('axios');
const { openCageApiKey } = require('../config');

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

async function expandUrl(url) {
  try {
    const encodedUrl = encodeURIComponent(url);
    const apiUrl = `https://unshorten.me/json/${encodedUrl}`;
    const response = await axios.get(apiUrl, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64 ) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
    });
    return response.data?.resolved_url || url;
  } catch (e) {
    console.error(`No se pudo expandir la URL ${url}: ${e.message}`);
    return url;
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

async function extractLocation(text) {
  const GOOGLE_URL_REGEX = /(https?:\/\/[^\s]*(maps|goo\.gl|google|googleusercontent|mapas )[^\s]*)/i;
  const urlMatch = text.match(GOOGLE_URL_REGEX);
  const coordsInText = extractCoordinatesFromText(text);

  if (coordsInText) {
    const geoData = await reverseGeocode(coordsInText.lat, coordsInText.lng);
    return { ...geoData, ...coordsInText, originalText: text };
  }
  
  if (!urlMatch) return null;

  const finalUrl = await expandUrl(urlMatch[0]);
  const patterns = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,
    /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
  ];
  
  for (const re of patterns) {
    const m = finalUrl.match(re);
    if (m && m.length >= 3) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (!isNaN(lat) && !isNaN(lng)) {
        const geoData = await reverseGeocode(lat, lng);
        return { ...geoData, lat, lng, originalUrl: urlMatch[0] };
      }
    }
  }
  
  console.warn(`No se pudieron extraer coordenadas de la URL: ${finalUrl}`);
  return null;
}

module.exports = {
  geocodeAddress,
  reverseGeocode,
  extractLocation,
};