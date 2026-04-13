const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');
const SECRET_KEY = 'tyke_secret_key_123'; // In a real app, use .env

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize DB if not exists
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], documents: [], folders: [] }, null, 2));
}

// Helper to interact with DB
const readDB = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

const GEMINI_API_KEY = 'AIzaSyDEdpa89wBrN2fJRzaHM88KJMEhfAYAZLQ';

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Erişim reddedildi. Lütfen giriş yapın.' });

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: 'Geçersiz token.' });
    req.user = user;
    next();
  });
};
// --- AUTH ROUTES ---
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Kullanıcı adı ve şifre zorunludur.' });

  const db = readDB();
  if (db.users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'Bu kullanıcı adı zaten alınmış.' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = { id: Date.now().toString(), username, password: hashedPassword };
  db.users.push(newUser);
  writeDB(db);

  res.status(201).json({ message: 'Kayıt başarılı! Lütfen giriş yapınız.' });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const db = readDB();
  
  const user = db.users.find(u => u.username === username);
  if (!user) return res.status(400).json({ error: 'Kullanıcı bulunamadı.' });

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) return res.status(400).json({ error: 'Hatalı şifre.' });

  const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '24h' });
  res.json({ token, username: user.username });
});

// --- GEMINI AI PROXY ---
app.post('/api/ai/process', authenticateToken, async (req, res) => {
  const { prompt, text, action } = req.body;
  
  let systemPrompt = "Sen 'Tyke Writer' isminde profesyonel bir yazım asistanısın. Apple minimalist tasarım felsefesine sahip, siyah-beyaz bir doküman uygulamasında yardımcı oluyorsun.";
  
  let userMessage = "";
  if (action === 'improve') {
    userMessage = `Aşağıdaki metni daha profesyonel, akıcı ve dil bilgisi açısından kusursuz hale getir. Sadece düzeltilmiş metni döndür:\n\n${text}`;
  } else if (action === 'summarize') {
    userMessage = `Aşağıdaki metni kısa ve öz bir şekilde özetle:\n\n${text}`;
  } else if (action === 'continue') {
    userMessage = `Aşağıdaki metnin akışına uygun olarak devamını yaz (yaklaşık 2-3 cümle): \n\n${text}`;
  } else {
    userMessage = prompt;
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-goog-api-key': GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\nKullanıcı İsteği: ${userMessage}` }] }]
      })
    });
    const data = await response.json();
    const resultText = data.candidates[0].content.parts[0].text;
    res.json({ result: resultText });
  } catch (error) {
    res.status(500).json({ error: 'AI servisi şu an kullanılamıyor.' });
  }
});

// --- FOLDER ROUTES ---
app.get('/api/folders', authenticateToken, (req, res) => {
  const db = readDB();
  const userFolders = (db.folders || []).filter(f => f.userId === req.user.id);
  res.json(userFolders);
});

app.post('/api/folders', authenticateToken, (req, res) => {
  const db = readDB();
  if (!db.folders) db.folders = [];
  const newFolder = {
    id: Date.now().toString(),
    userId: req.user.id,
    name: req.body.name || 'Yeni Klasör',
    parentId: req.body.parentId || null
  };
  db.folders.push(newFolder);
  writeDB(db);
  res.status(201).json(newFolder);
});

// --- DOCUMENT ROUTES ---
app.get('/api/documents', authenticateToken, (req, res) => {
  const db = readDB();
  const userDocs = db.documents.filter(doc => doc.userId === req.user.id);
  const previewDocs = userDocs.map(doc => ({
    id: doc.id,
    title: doc.title,
    updatedAt: doc.updatedAt,
    folderId: doc.folderId || null,
    tags: doc.tags || []
  }));
  res.json(previewDocs.sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
});

app.get('/api/documents/:id', authenticateToken, (req, res) => {
  const db = readDB();
  const doc = db.documents.find(d => d.id === req.params.id && d.userId === req.user.id);
  if (!doc) return res.status(404).json({ error: 'Doküman bulunamadı.' });
  res.json(doc);
});

app.post('/api/documents', authenticateToken, (req, res) => {
  const db = readDB();
  const newDoc = {
    id: Date.now().toString(),
    userId: req.user.id,
    title: req.body.title || 'Başlıksız Doküman',
    content: req.body.content || '',
    folderId: req.body.folderId || null,
    tags: req.body.tags || [],
    history: [],
    updatedAt: new Date().toISOString()
  };
  db.documents.push(newDoc);
  writeDB(db);
  res.status(201).json(newDoc);
});

app.put('/api/documents/:id', authenticateToken, (req, res) => {
  const db = readDB();
  const index = db.documents.findIndex(d => d.id === req.params.id && d.userId === req.user.id);
  if (index === -1) return res.status(404).json({ error: 'Doküman bulunamadı.' });

  const oldDoc = db.documents[index];
  
  // Snapshots for history (limit to last 20)
  const history = oldDoc.history || [];
  if (req.body.content !== undefined && req.body.content !== oldDoc.content) {
    history.unshift({
      content: oldDoc.content,
      title: oldDoc.title,
      updatedAt: oldDoc.updatedAt
    });
    if (history.length > 20) history.pop();
  }

  db.documents[index] = {
    ...oldDoc,
    title: req.body.title !== undefined ? req.body.title : oldDoc.title,
    content: req.body.content !== undefined ? req.body.content : oldDoc.content,
    folderId: req.body.folderId !== undefined ? req.body.folderId : oldDoc.folderId,
    tags: req.body.tags !== undefined ? req.body.tags : oldDoc.tags,
    history: history,
    updatedAt: new Date().toISOString()
  };
  writeDB(db);
  res.json(db.documents[index]);
});

app.post('/api/documents/:id/restore', authenticateToken, (req, res) => {
  const db = readDB();
  const index = db.documents.findIndex(d => d.id === req.params.id && d.userId === req.user.id);
  if (index === -1) return res.status(404).json({ error: 'Doküman bulunamadı.' });

  const { versionIndex } = req.body;
  const doc = db.documents[index];
  
  if (!doc.history || !doc.history[versionIndex]) {
    return res.status(400).json({ error: 'Geçersiz versiyon indeksi.' });
  }

  const restoredVersion = doc.history[versionIndex];
  
  // Before restoring, save current as latest history
  doc.history.unshift({
    content: doc.content,
    title: doc.title,
    updatedAt: doc.updatedAt
  });
  if (doc.history.length > 20) doc.history.pop();

  // Restore
  doc.title = restoredVersion.title;
  doc.content = restoredVersion.content;
  doc.updatedAt = new Date().toISOString();

  writeDB(db);
  res.json(doc);
});

app.delete('/api/documents/:id', authenticateToken, (req, res) => {
  const db = readDB();
  const initialLength = db.documents.length;
  db.documents = db.documents.filter(d => !(d.id === req.params.id && d.userId === req.user.id));
  
  if (db.documents.length === initialLength) {
    return res.status(404).json({ error: 'Doküman bulunamadı.' });
  }

  writeDB(db);
  res.json({ success: true, message: 'Doküman silindi.' });
});

// Storage Info Route
app.get('/api/user/storage', authenticateToken, (req, res) => {
    const db = readDB();
    const userDocs = db.documents.filter(doc => doc.userId === req.user.id);
    const count = userDocs.length;
    // Calculate synthetic MB size
    let bytes = JSON.stringify(userDocs).length;
    let mb = (bytes / (1024 * 1024)).toFixed(4);
    if(mb < 0.01) mb = 0.01;
    res.json({ count, mb });
});

// Search Route
app.get('/api/documents/search', authenticateToken, (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  const db = readDB();
  const results = db.documents.filter(d => d.userId === req.user.id && (d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q))).map(d => ({id: d.id, title: d.title}));
  res.json(results);
});

// Public Document Route
app.get('/api/documents/public/:id', (req, res) => {
  const db = readDB();
  const doc = db.documents.find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: 'Belge bulunamadı veya yetkisiz.' });
  res.json({ title: doc.title, content: doc.content, updatedAt: doc.updatedAt });
});

// Any unmatched route sends to index.html (SPA like routing or fallback)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Tyke Documents sunucusu http://localhost:${PORT} adresinde çalışıyor...`);
});
