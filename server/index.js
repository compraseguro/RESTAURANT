require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
const { initDatabase, getDbPath } = require('./database');
const jwt = require('jsonwebtoken');
const { authenticateToken, requireRole, JWT_SECRET } = require('./middleware/auth');
const { createRateLimiter } = require('./middleware/rateLimit');

const app = express();
const server = http.createServer(app);
const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wildcardToRegex(rule) {
  const escaped = escapeRegex(rule).replace(/\\\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (!corsOrigins.length) return true;
  if (corsOrigins.includes(origin)) return true;
  return corsOrigins
    .filter(rule => rule.includes('*'))
    .some((rule) => wildcardToRegex(rule).test(origin));
}

const corsOptions = {
  origin(origin, cb) {
    if (isOriginAllowed(origin)) return cb(null, true);
    return cb(new Error('Origen no permitido por CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
};
const io = new Server(server, {
  cors: corsOptions,
});

app.set('io', io);
app.use(cors(corsOptions));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('x-request-id', requestId);
  req.requestId = requestId;
  next();
});
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    const elapsed = Date.now() - startedAt;
    console.log(JSON.stringify({
      level: 'info',
      msg: 'http_request',
      request_id: req.requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      elapsed_ms: elapsed,
    }));
  });
  next();
});

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Tipo de archivo no permitido'));
    }
    return cb(null, true);
  },
});

app.post('/api/upload', authenticateToken, requireRole('admin', 'cajero', 'mozo', 'master_admin'), upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

app.get('/api/healthz', (req, res) => res.json({ ok: true, uptime: process.uptime() }));
app.get('/api/readyz', async (req, res) => {
  try {
    await initDatabase();
    res.json({ ready: true });
  } catch (err) {
    res.status(503).json({ ready: false, error: err.message });
  }
});

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 40,
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/customer/login', authLimiter);

app.use('/api/public/self-order', require('./routes/publicSelfOrder'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/restaurant', require('./routes/restaurant'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/users', require('./routes/users'));
app.use('/api/staff-chat', require('./routes/staffChat'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/pos', require('./routes/pos'));
app.use('/api/delivery', require('./routes/delivery'));
app.use('/api/tables', require('./routes/tables'));
app.use('/api/admin-modules', require('./routes/adminModules'));
app.use('/api/master-admin', require('./routes/masterAdmin'));
const billingRoutes = require('./routes/billing');
app.use('/api/billing', billingRoutes);

app.use((err, req, res, next) => {
  if (!err) return next();
  console.error(JSON.stringify({
    level: 'error',
    msg: 'unhandled_error',
    request_id: req.requestId,
    path: req.originalUrl,
    method: req.method,
    error: err.message,
  }));
  res.status(500).json({ error: err.message || 'Error interno del servidor' });
});

const clientBuild = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientBuild)) {
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => res.sendFile(path.join(clientBuild, 'index.html')));
}

io.on('connection', (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);
  socket.on('join-staff', (payload) => {
    try {
      const token = payload?.token;
      if (!token) return;
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.type === 'customer' || decoded.role === 'master_admin') return;
      if (!decoded.id) return;
      socket.join(`staff-${decoded.id}`);
      socket.join('staff-broadcast');
    } catch (_) {
      /* token inválido: ignorar */
    }
  });
  socket.on('join-kitchen', () => { socket.join('kitchen'); });
  socket.on('join-bar', () => { socket.join('bar'); });
  socket.on('join-delivery', (driverId) => { socket.join(`delivery-${driverId}`); });
  socket.on('join-customer', (customerId) => { socket.join(`customer-${customerId}`); });
  socket.on('disconnect', () => { console.log(`Desconectado: ${socket.id}`); });
});

const PORT = process.env.PORT || 3001;

async function start() {
  await initDatabase();
  console.log(`[DB] SQLite path: ${getDbPath()}`);
  if (typeof billingRoutes.startBillingAutoRetryJob === 'function') {
    billingRoutes.startBillingAutoRetryJob();
  }
  server.listen(PORT, () => {
    console.log(`
======================================================
   RESTAURANT PLATFORM - SERVIDOR ACTIVO
   Puerto: ${PORT}
   Base de datos: ${getDbPath()}
   Maestro: use MASTER_USERNAME / MASTER_PASSWORD (.env) o credenciales ya guardadas.
   Staff: sin usuarios demo; el maestro crea el administrador en /master.
   Datos: en la nube use disco persistente y DB_PATH (ver .env.example).
======================================================
    `);
  });
}

start().catch(err => {
  console.error('Error al iniciar:', err);
  process.exit(1);
});
