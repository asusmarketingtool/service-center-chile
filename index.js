const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use('/images', express.static(path.join(__dirname, 'public/images')));

const normalize = str =>
  str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const BASE_URL = process.env.BASE_URL || `http://localhost:${port}`;
const IMAGES = { samtek: `${BASE_URL}/images/samtek.png` };

const serviceCenters = [
  {
    region:  'Región Metropolitana de Santiago',
    name:    'SAMTEK',
    address: 'Nueva Tajamar 481, Torre Sur, Oficina 1601. Las Condes (265.2km)',
    products:'Notebook, Desktop PC, All-in-one PCs, Eee Pad, Eee',
    imageUrl: IMAGES.samtek
  }
];

app.post('/nearest', (req, res) => {
  const regionInput = normalize(req.body.region || '');
  const match = serviceCenters.find(sc => normalize(sc.region) === regionInput);
  if (!match) return res.status(404).json({ error: 'No service center found for that region.' });
  const enc = encodeURIComponent(match.address);
  res.json({
    centers: [{
      name:        match.name,
      address:     match.address,
      products:    match.products,
      imageUrl:    match.imageUrl,
      mapLink:     `https://www.google.com/maps/dir/?api=1&destination=${enc}`,
      addressLink: `https://www.google.com/maps/search/?api=1&query=${enc}`,
      embedUrl:    `https://maps.google.com/maps?q=${enc}&output=embed`
    }]
  });
});

app.get('/map', (req, res) => {
  const enc = encodeURIComponent(req.query.address || '');
  res.send(`
    <!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <title>Mapa</title>
    <style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:none}</style>
    </head><body>
    <iframe src="https://maps.google.com/maps?q=${enc}&output=embed"></iframe>
    </body></html>`);
});

app.listen(port, () => console.log(`API running at http://localhost:${port}`));