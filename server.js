const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://innovalatinos:innovalatinos@cluster0.cinpcmb.mongodb.net/inventario_DB?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = process.env.DB_NAME || 'inventario_DB';
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
  console.log('Conectado a inventario_DB');
}

app.use(async (req, res, next) => {
  if (!db) {
    try { await connectDB(); } catch (e) { return res.status(500).json({ error: 'DB not connected' }); }
  }
  req.db = db;
  next();
});

// Mapear producto de Inventario a formato Fleure
function toFleure(p, usuarioNombre) {
  const variants = (p.variantes || []).map(v => ({
    name: v.color,
    color: v.colorHex || '#D4A0B0',
    image: v.image || '',
    cantidad: v.cantidad || 0
  }));
  const totalStock = variants.length ? variants.reduce((s, v) => s + v.cantidad, 0) : p.cantidad;
  const soldOut = !p.activo || totalStock <= 0;
  return {
    _id: p._id,
    name: p.nombre,
    price: p.precioVenta,
    description: p.descripcion || '',
    image: p.url || '',
    category: p.categoria || 'Otros',
    variants,
    soldOut,
    usuario: usuarioNombre || '',
    createdAt: p.createdAt || p._id.getTimestamp()
  };
}

// Mapear de formato Fleure a Inventario (para writes del admin)
function toInventario(data) {
  const doc = {
    nombre: data.name,
    proveedor: data.proveedor || 'Fleure',
    cantidad: data.cantidad !== undefined ? Number(data.cantidad) : 1,
    precioCompra: data.precioCompra || 0,
    precioVenta: parseFloat(data.price),
    descripcion: data.description || '',
    categoria: data.category || 'Otros',
    url: data.image || '',
    color: '',
    material: '',
    variantes: [],
    activo: data.soldOut !== undefined ? !data.soldOut : true,
    notas: data.notas || ''
  };
  if (data.variants && data.variants.length) {
    doc.variantes = data.variants.map(v => ({
      color: v.name,
      cantidad: v.cantidad !== undefined ? Number(v.cantidad) : 1,
      colorHex: v.color || '#D4A0B0',
      image: v.image || ''
    }));
    doc.cantidad = doc.variantes.reduce((s, v) => s + v.cantidad, 0);
  }
  return doc;
}

// Auth simple para admin
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) return res.json({ success: true });
  res.status(401).json({ error: 'Contraseña incorrecta' });
});

// GET /api/products - leer de inventario_DB
app.get('/api/products', async (req, res) => {
  try {
    const products = await req.db.collection('products').find().sort({ createdAt: -1 }).toArray();
    res.json(products.map(p => toFleure(p)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/products - crear en inventario_DB
app.post('/api/products', async (req, res) => {
  try {
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'No autorizado' });
    const fleureUser = await req.db.collection('users').findOne({ rol: 'fleure' });
    if (!fleureUser) return res.status(500).json({ error: 'No hay usuario fleure en inventario' });
    const doc = toInventario(req.body);
    doc.usuario = fleureUser._id;
    doc.fechaCompra = new Date();
    const result = await req.db.collection('products').insertOne(doc);
    const created = await req.db.collection('products').findOne({ _id: result.insertedId });
    res.json(toFleure(created, fleureUser.nombre));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/products/:id - actualizar en inventario_DB
app.put('/api/products/:id', async (req, res) => {
  try {
    const { password, soldOut, name, price, description, image, category, variants, proveedor, cantidad, precioCompra, notas } = req.body;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'No autorizado' });
    const update = {};
    if (soldOut !== undefined) update.activo = !soldOut;
    if (name !== undefined) update.nombre = name;
    if (price !== undefined) update.precioVenta = parseFloat(price);
    if (description !== undefined) update.descripcion = description;
    if (image !== undefined) update.url = image;
    if (category !== undefined) update.categoria = category;
    if (proveedor !== undefined) update.proveedor = proveedor;
    if (cantidad !== undefined) update.cantidad = Number(cantidad);
    if (precioCompra !== undefined) update.precioCompra = Number(precioCompra);
    if (notas !== undefined) update.notas = notas;
    if (variants !== undefined) {
      update.variantes = variants.map(v => ({
        color: v.name,
        cantidad: v.cantidad !== undefined ? Number(v.cantidad) : 1,
        colorHex: v.color || '#D4A0B0',
        image: v.image || ''
      }));
    }
    await req.db.collection('products').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: update }
    );
    const updated = await req.db.collection('products').findOne({ _id: new ObjectId(req.params.id) });
    const fleureUser = await req.db.collection('users').findOne({ rol: 'fleure' });
    res.json(toFleure(updated, fleureUser?.nombre));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/products/:id - marcar como inactivo
app.delete('/api/products/:id', async (req, res) => {
  try {
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'No autorizado' });
    await req.db.collection('products').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { activo: false } }
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function start() {
  try {
    await connectDB();
    app.listen(PORT, () => console.log(`Fleuré corriendo en http://localhost:${PORT}`));
  } catch (e) { console.error('Failed:', e.message); process.exit(1); }
}

start();
