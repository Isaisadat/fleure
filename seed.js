const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://innovalatinos:innovalatinos@cluster0.cinpcmb.mongodb.net/Fleure_DB?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = process.env.DB_NAME || 'Fleure_DB';

const products = [
  {
    name: 'Anillo de Compromiso Eclat',
    price: 2850.00,
    description: 'Anillo en oro blanco 18k con diamante central de 1.2 quilates, talla brillante. Garras de platino que realzan su destello eterno.',
    image: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=600&q=80',
    category: 'Anillos',
    soldOut: false
  },
  {
    name: 'Collar de Perlas Celestial',
    price: 1240.00,
    description: 'Collar de perlas cultivadas freshwater de 8-9mm con cierre de oro rosa 14k. Cable de seda natural con nudos franceses.',
    image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600&q=80',
    category: 'Collares',
    soldOut: false
  },
  {
    name: 'Pendientes Lune',
    price: 890.00,
    description: 'Pendientes de aro en oro amarillo 18k con diamantes pavé de 0.5 quilates total. Diseño clásico con cierre de presión.',
    image: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&q=80',
    category: 'Pendientes',
    soldOut: true
  },
  {
    name: 'Pulsera Duo de Estrellas',
    price: 1670.00,
    description: 'Pulsera rígida en oro blanco y rosa 18k con estrella central pavimentada de zafiros y diamantes.',
    image: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=600&q=80',
    category: 'Pulseras',
    soldOut: false
  },
  {
    name: 'Anillo Eterno Rose',
    price: 2100.00,
    description: 'Anillo eternity en oro rosa 18k con 20 diamantes talla baguette (1.8 ct). Ancho 3.5mm, perfecto como alianza.',
    image: 'https://images.unsplash.com/photo-1602751584554-8ba73aad82e1?w=600&q=80',
    category: 'Anillos',
    soldOut: false
  }
];

async function seed() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection('products');
    await collection.deleteMany({});
    const result = await collection.insertMany(products.map(p => ({ ...p, createdAt: new Date() })));
    console.log(`${result.insertedCount} productos insertados correctamente.`);
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

seed();
