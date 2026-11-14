require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('Missing JWT_SECRET. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

const app = express();
app.use(cors());
app.use(express.json());

// Only the "public" folder is exposed (server.js and .env are NOT reachable)
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- IMAGE UPLOADS ---------- */
const uploadDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) =>
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${EXT[file.mimetype]}`)
  }),
  limits: { fileSize: 3 * 1024 * 1024 }, // 3 MB
  fileFilter: (req, file, cb) =>
    EXT[file.mimetype] ? cb(null, true) : cb(new Error('Only JPG, PNG or WEBP images are allowed'))
});

function removeUploadedFile(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith('/uploads/')) return;
  const filePath = path.join(uploadDir, path.basename(imageUrl));
  fs.unlink(filePath, () => {});
}


function isHttpUrl(value = '') {
  try {
    const u = new URL(value);
    return ['http:', 'https:'].includes(u.protocol);
  } catch {
    return false;
  }
}

function parsePrice(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n < 10000000 ? n : null;
}

/* ---------- DATABASE ---------- */
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sudorank_db'
});

/* ---------- ADMIN MIDDLEWARE ---------- */
function verifyAdmin(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

/* ---------- AUTH ROUTES ---------- */
app.post('/api/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields are required' });
  try {
    const hash = await bcrypt.hash(password, 10);

    const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM users');
    // Admin if first user OR email is in ADMIN_EMAILS
    const role = (count === 0 || ADMIN_EMAILS.includes(email.toLowerCase())) ? 'admin' : 'user';

    const [result] = await pool.query(
      'INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, role]
    );
    const token = jwt.sign({ id: result.insertId, name, email, role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { name, email, role } });
  } catch (err) {
    res.status(400).json({ error: err.code === 'ER_DUP_ENTRY' ? 'Email already exists' : 'Signup failed' });
  }
});

app.post('/api/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign(
      { id: user.id, name: user.full_name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { name: user.full_name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Sign in failed' });
  }
});

/* ---------- PUBLIC EVENTS & ADS ---------- */
app.get('/api/events', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, university, category,
              DATE_FORMAT(event_date, "%Y-%m-%d") AS date,
              DATE_FORMAT(deadline, "%Y-%m-%d") AS deadline,
              venue, link, description, image_url, approved
       FROM events WHERE approved = TRUE ORDER BY event_date ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not load events' });
  }
});

// Event submission (multipart/form-data with optional "image" file)
app.post('/api/events', (req, res) => {
  upload.single('image')(req, res, async (uploadErr) => {
    if (uploadErr) {
      const msg = uploadErr.code === 'LIMIT_FILE_SIZE' ? 'Image is too large (max 3 MB)' : uploadErr.message;
      return res.status(400).json({ error: msg });
    }
    try {
      const { title, university, category, date, deadline, venue, link, description } = req.body;
      if (!title || !university || !category || !date || !deadline || !venue || !description) {
        if (req.file) removeUploadedFile(`/uploads/${req.file.filename}`);
        return res.status(400).json({ error: 'Please fill in all required fields' });
      }
      const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
      await pool.query(
        `INSERT INTO events (title, university, category, event_date, deadline, venue, link, description, image_url, approved)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE)`,
        [title, university, category, date, deadline, venue, link || null, description, imageUrl]
      );
      res.json({ message: 'Event submitted for admin review!' });
    } catch (err) {
      if (req.file) removeUploadedFile(`/uploads/${req.file.filename}`);
      res.status(500).json({ error: 'Could not save event' });
    }
  });
});

/* ---------- STORE: PRODUCTS ---------- */
app.get('/api/products', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, category, price, seller, description, image_url, order_link
       FROM products WHERE approved = TRUE ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not load products' });
  }
});

// Product submission (multipart/form-data with optional "image" file)
app.post('/api/products', (req, res) => {
  upload.single('image')(req, res, async (uploadErr) => {
    if (uploadErr) {
      const msg = uploadErr.code === 'LIMIT_FILE_SIZE' ? 'Image is too large (max 3 MB)' : uploadErr.message;
      return res.status(400).json({ error: msg });
    }
    const discard = () => { if (req.file) removeUploadedFile(`/uploads/${req.file.filename}`); };
    try {
      const { name, category, price, seller, order_link, description } = req.body;
      if (!name || !category || !seller || !order_link || !description || price === undefined || price === '') {
        discard();
        return res.status(400).json({ error: 'Please fill in all required fields' });
      }
      if (!isHttpUrl(order_link)) {
        discard();
        return res.status(400).json({ error: 'Order link must start with http:// or https://' });
      }
      const priceNum = parsePrice(price);
      if (priceNum === null) {
        discard();
        return res.status(400).json({ error: 'Enter a valid price' });
      }
      const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
      await pool.query(
        `INSERT INTO products (name, category, price, seller, description, image_url, order_link, approved)
         VALUES (?, ?, ?, ?, ?, ?, ?, FALSE)`,
        [name, category, priceNum, seller, description, imageUrl, order_link]
      );
      res.json({ message: 'Product submitted for admin review!' });
    } catch (err) {
      discard();
      res.status(500).json({ error: 'Could not save product' });
    }
  });
});

app.post('/api/ads', async (req, res) => {
  try {
    const { company, title, type, link, description } = req.body;
    await pool.query(
      'INSERT INTO ads (company, title, ad_type, link, description) VALUES (?, ?, ?, ?, ?)',
      [company, title, type, link, description]
    );
    res.json({ message: 'Advertisement submitted for review!' });
  } catch (err) {
    res.status(500).json({ error: 'Could not save ad' });
  }
});

/* ---------- ADMIN ROUTES ---------- */
app.get('/api/admin/all', verifyAdmin, async (req, res) => {
  try {
    const [events] = await pool.query(
      `SELECT id, title, university, category,
              DATE_FORMAT(event_date, "%Y-%m-%d") AS date,
              DATE_FORMAT(deadline, "%Y-%m-%d") AS deadline,
              venue, link, description, image_url, approved
       FROM events ORDER BY created_at DESC`
    );
    const [ads] = await pool.query('SELECT * FROM ads ORDER BY submitted_at DESC');
    const [products] = await pool.query(
      `SELECT id, name, category, price, seller, description, image_url, order_link, approved
       FROM products ORDER BY created_at DESC`
    );
    res.json({ events, ads, products });
  } catch (err) {
    res.status(500).json({ error: 'Could not load admin data' });
  }
});

app.put('/api/admin/events/:id', verifyAdmin, async (req, res) => {
  try {
    const { title, university, category, date, deadline, venue, approved } = req.body;
    await pool.query(
      'UPDATE events SET title=?, university=?, category=?, event_date=?, deadline=?, venue=?, approved=? WHERE id=?',
      [title, university, category, date, deadline, venue, approved ? 1 : 0, req.params.id]
    );
    res.json({ message: 'Event updated' });
  } catch (err) {
    res.status(500).json({ error: 'Could not update event' });
  }
});

app.delete('/api/admin/events/:id', verifyAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT image_url FROM events WHERE id = ?', [req.params.id]);
    await pool.query('DELETE FROM events WHERE id = ?', [req.params.id]);
    if (rows[0]) removeUploadedFile(rows[0].image_url); // clean up the photo too
    res.json({ message: 'Event deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete event' });
  }
});

app.put('/api/admin/ads/:id/approve', verifyAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE ads SET approved = ? WHERE id = ?', [req.body.approved ? 1 : 0, req.params.id]);
    res.json({ message: 'Ad updated' });
  } catch (err) {
    res.status(500).json({ error: 'Could not update ad' });
  }
});

app.put('/api/admin/products/:id', verifyAdmin, async (req, res) => {
  try {
    const { name, category, price, seller, order_link, description, approved } = req.body;
    if (!name || !category || !seller || !description) {
      return res.status(400).json({ error: 'Please fill in all fields' });
    }
    if (!isHttpUrl(order_link)) {
      return res.status(400).json({ error: 'Order link must start with http:// or https://' });
    }
    const priceNum = parsePrice(price);
    if (priceNum === null) return res.status(400).json({ error: 'Enter a valid price' });
    await pool.query(
      `UPDATE products SET name=?, category=?, price=?, seller=?, order_link=?, description=?, approved=? WHERE id=?`,
      [name, category, priceNum, seller, order_link, description, approved ? 1 : 0, req.params.id]
    );
    res.json({ message: 'Product updated' });
  } catch (err) {
    res.status(500).json({ error: 'Could not update product' });
  }
});

app.delete('/api/admin/products/:id', verifyAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT image_url FROM products WHERE id = ?', [req.params.id]);
    await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    if (rows[0]) removeUploadedFile(rows[0].image_url);
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete product' });
  }
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
