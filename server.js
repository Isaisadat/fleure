const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://innovalatinos:innovalatinos@cluster0.cinpcmb.mongodb.net/Fleure_DB?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = process.env.DB_NAME || 'Fleure_DB';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ferisa02';

const CLOUDINARY_URL = process.env.CLOUDINARY_URL || '';
const useCloudinary = !!CLOUDINARY_URL;

let upload;
if (useCloudinary) {
  cloudinary.config({ cloudinary_url: CLOUDINARY_URL });
  const storage = new CloudinaryStorage({
    cloudinary,
    params: { folder: 'fleure', allowed_formats: ['jpg','jpeg','png','webp','gif'] }
  });
  upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });
  console.log('Cloudinary configurado');
} else {
  const uploadDir = path.join(__dirname, 'public', 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + ext);
    }
  });
  upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });
  console.log('Upload local (sin Cloudinary)');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/upload', upload.single('image'), (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    if (req.file && !useCloudinary) fs.unlinkSync(req.file.path);
    return res.status(401).json({ error: 'No autorizado' });
  }
  if (!req.file) return res.status(400).json({ error: 'No se subió ninguna imagen' });
  const url = useCloudinary ? req.file.path : '/uploads/' + req.file.filename;
  res.json({ url });
});

let db;

async function connectDB() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(DB_NAME);
  console.log('Connected to MongoDB');
}

app.use(async (req, res, next) => {
  if (!db) {
    try { await connectDB(); } catch (e) { return res.status(500).json({ error: 'DB not connected' }); }
  }
  req.db = db;
  next();
});

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) return res.json({ success: true });
  res.status(401).json({ error: 'Contraseña incorrecta' });
});

app.get('/api/products', async (req, res) => {
  try {
    const products = await req.db.collection('products').find().sort({ createdAt: -1 }).toArray();
    res.json(products);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/products', async (req, res) => {
  try {
    const { password, name, price, description, image, category, variants } = req.body;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'No autorizado' });
    const doc = { name, price: parseFloat(price), description, image, category, variants: variants || [], soldOut: false, createdAt: new Date() };
    const result = await req.db.collection('products').insertOne(doc);
    res.json({ ...doc, _id: result.insertedId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const { password, soldOut, name, price, description, image, category, variants } = req.body;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'No autorizado' });
    const update = {};
    if (soldOut !== undefined) update.soldOut = soldOut;
    if (name !== undefined) update.name = name;
    if (price !== undefined) update.price = parseFloat(price);
    if (description !== undefined) update.description = description;
    if (image !== undefined) update.image = image;
    if (category !== undefined) update.category = category;
    if (variants !== undefined) update.variants = variants;
    await req.db.collection('products').updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });
    const updated = await req.db.collection('products').findOne({ _id: new ObjectId(req.params.id) });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'No autorizado' });
    await req.db.collection('products').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function start() {
  try {
    await connectDB();
    app.listen(PORT, () => console.log(`Fleuré running on http://localhost:${PORT}`));
  } catch (e) { console.error('Failed:', e.message); process.exit(1); }
}

start();
