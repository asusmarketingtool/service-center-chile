// index.js
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// ---------- Middleware ----------
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// ---------- Utils ----------
const normalize = (str = '') =>
  String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9\s]/g, ' ')    // remove punctuation/symbols
    .replace(/\s+/g, ' ')            // collapse spaces
    .trim();

// Levenshtein distance for fuzzy typo tolerance (small & fast)
function levenshtein(a = '', b = '') {
  a = normalize(a); b = normalize(b);
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // delete
        dp[i][j - 1] + 1,      // insert
        dp[i - 1][j - 1] + cost // substitute
      );
    }
  }
  return dp[m][n];
}

function getBaseUrl(req) {
  const envBase = process.env.BASE_URL;
  if (envBase && /^https?:\/\//i.test(envBase)) return envBase.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http');
  const host = req.get('host');
  return `${proto}://${host}`;
}

function buildImageUrl(req, fileName) {
  if (!fileName) return null;
  const base = getBaseUrl(req);
  return `${base}/images/${encodeURIComponent(fileName)}`;
}

// ---------- Data ----------
const serviceCenters = [
  {
    region:  'Región Metropolitana de Santiago',
    name:    'SAMTEK',
    address: 'Nueva Tajamar 481, Torre Sur, Oficina 1601. Las Condes',
    products:'Notebook, Desktop PC, All-in-one PCs, Eee Pad, Eee',
    image:   'samtek.png'
  }
];

// Aliases/variantes por región (normalizadas)
const REGION_ALIASES = {
  'región metropolitana de santiago': [
    'region metropolitana de santiago',
    'rm',
    'metropolitana',
    'santiago',
    'region metropolita na de santiago',
    'region metropolotana de santiago', // typo común
    'region metropolitana',
    'metropolitana de santiago'
  ]
};

// Precompute normalized keys
const REGION_KEYS = serviceCenters.map(sc => normalize(sc.region));

function isAliasMatch(input, regionName) {
  const key = normalize(regionName);
  const inputN = normalize(input);
  const aliases = REGION_ALIASES[key] || [];
  if (inputN === key) return true;
  if (aliases.some(a => normalize(a) === inputN)) return true;
  // partial includes (e.g., "region metropolitana" or "santiago")
  if (inputN.length >= 6 && (key.includes(inputN) || inputN.includes(key))) return true;
  // fuzzy tolerance for small typos (distance ≤ 2)
  if (levenshtein(inputN, key) <= 2) return true;
  // fuzzy vs aliases
  if (aliases.some(a => levenshtein(inputN, a) <= 2)) return true;
  return false;
}

function findByRegionFlexible(input) {
  // 1) exact normalized match
  let match = serviceCenters.find(sc => normalize(sc.region) === normalize(input));
  if (match) return match;
  // 2) alias/partial/fuzzy
  match = serviceCenters.find(sc => isAliasMatch(input, sc.region));
  return match || null;
}

// ---------- Health ----------
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    regionsConfigured: serviceCenters.length,
    regions: serviceCenters.map(sc => sc.region)
  });
});

// ---------- Endpoints ----------
app.post('/nearest', (req, res) => {
  console.log('POST /nearest body:', req.body);

  const rawRegion = req.body?.region;
  if (!rawRegion || typeof rawRegion !== 'string') {
    return res.status(422).json({
      error: "Invalid payload. Send JSON like: { \"region\": \"Región Metropolitana de Santiago\" }",
      expectedRegions: serviceCenters.map(sc => sc.region)
    });
  }

  const match = findByRegionFlexible(rawRegion);
  if (!match) {
    return res.status(404).json({
      error: `No service center found for region: "${rawRegion}"`,
      hint: 'Revisa acentos/espacios o usa una variante reconocida.',
      expectedRegions: serviceCenters.map(sc => sc.region)
    });
  }

  const imageUrl = buildImageUrl(req, match.image);
  const enc = encodeURIComponent(match.address);
  return res.json({
    centers: [{
      name:        match.name,
      address:     match.address,
      products:    match.products,
      imageUrl:    imageUrl,
      mapLink:     `https://www.google.com/maps/dir/?api=1&destination=${enc}`,
      addressLink: `https://www.google.com/maps/search/?api=1&query=${enc}`,
      embedUrl:    `https://maps.google.com/maps?q=${enc}&output=embed`
    }]
  });
});

// GET para pruebas rápidas en el navegador:
// /nearest?region=Regi%C3%B3n%20Metropolitana%20de%20Santiago
app.get('/nearest', (req, res) => {
  console.log('GET /nearest query:', req.query);

  const rawRegion = req.query?.region;
  if (!rawRegion || typeof rawRegion !== 'string') {
    return res.status(422).json({
      error: "Missing ?region=... query parameter",
      example: "/nearest?region=Región%20Metropolitana%20de%20Santiago",
      expectedRegions: serviceCenters.map(sc => sc.region)
    });
  }

  const match = findByRegionFlexible(rawRegion);
  if (!match) {
    return res.status(404).json({
      error: `No service center found for region: "${rawRegion}"`,
      expectedRegions: serviceCenters.map(sc => sc.region)
    });
  }

  const imageUrl = buildImageUrl(req, match.image);
  const enc = encodeURIComponent(match.address);
  return res.json({
    centers: [{
      name:        match.name,
      address:     match.address,
      products:    match.products,
      imageUrl:    imageUrl,
      mapLink:     `https://www.google.com/maps/dir/?api=1&destination=${enc}`,
      addressLink: `https://www.google.com/maps/search/?api=1&query=${enc}`,
      embedUrl:    `https://maps.google.com/maps?q=${enc}&output=embed`
    }]
  });
});

// Página simple de mapa embebido
app.get('/map', (req, res) => {
  const enc = encodeURIComponent(req.query.address || '');
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Mapa</title>
<style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:none}</style>
</head><body>
<iframe src="https://maps.google.com/maps?q=${enc}&output=embed"></iframe>
</body></html>`);
});

// ---------- Start ----------
app.listen(port, () => {
  console.log(`API running at http://localhost:${port}`);
});
