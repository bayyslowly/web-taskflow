import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, testConnection, initTable } from './db.js';

// Muat variabel lingkungan
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sajikan file statis frontend (index.html, style.css, app.js)
app.use(express.static(__dirname));

// ============================================================================
// ENDPOINT KESEHATAN SISTEM & DATABASE
// ============================================================================

/**
 * GET /api/health
 * Menguji status koneksi ke database MariaDB dan server.
 */
app.get('/api/health', async (req, res) => {
  const dbStatus = await testConnection();
  
  res.status(dbStatus.connected ? 200 : 503).json({
    status: dbStatus.connected ? 'healthy' : 'degraded',
    server: 'running',
    timestamp: new Date().toISOString(),
    database: dbStatus
  });
});

// ============================================================================
// ENDPOINT CRUD TUGAS (TASKFLOW API)
// ============================================================================

/**
 * GET /api/tasks
 * Mengambil seluruh daftar tugas dari database.
 */
app.get('/api/tasks', async (req, res) => {
  try {
    const query = `
      SELECT 
        id, 
        title, 
        description, 
        priority, 
        CASE WHEN completed = 1 THEN TRUE ELSE FALSE END AS completed,
        UNIX_TIMESTAMP(created_at) * 1000 AS createdAt
      FROM tasks
      ORDER BY created_at DESC;
    `;
    const [rows] = await pool.query(query);
    res.json({
      success: true,
      total: rows.length,
      data: rows
    });
  } catch (error) {
    console.error('Error mengambil tugas:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil data tugas dari database.',
      error: error.message
    });
  }
});

/**
 * POST /api/tasks
 * Menambahkan tugas baru ke database.
 */
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, description, priority } = req.body;

    if (!title || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Judul tugas wajib diisi dan tidak boleh kosong.'
      });
    }

    const safeTitle = title.trim();
    const safeDesc = description && typeof description === 'string' ? description.trim() : '';
    const safePriority = ['rendah', 'sedang', 'tinggi'].includes(priority) ? priority : 'rendah';

    const insertQuery = `
      INSERT INTO tasks (title, description, priority, completed)
      VALUES (?, ?, ?, FALSE);
    `;
    const [result] = await pool.query(insertQuery, [safeTitle, safeDesc, safePriority]);

    const newTask = {
      id: result.insertId,
      title: safeTitle,
      description: safeDesc,
      priority: safePriority,
      completed: false,
      createdAt: Date.now()
    };

    res.status(201).json({
      success: true,
      message: 'Tugas berhasil ditambahkan ke database.',
      data: newTask
    });
  } catch (error) {
    console.error('Error menambah tugas:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gagal menyimpan tugas ke database.',
      error: error.message
    });
  }
});

/**
 * PUT /api/tasks/:id
 * Memperbarui tugas secara menyeluruh (judul, deskripsi, prioritas, status).
 */
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const { title, description, priority, completed } = req.body;

    if (!taskId || isNaN(taskId)) {
      return res.status(400).json({ success: false, message: 'ID tugas tidak valid.' });
    }

    if (!title || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ success: false, message: 'Judul tugas tidak boleh kosong.' });
    }

    const safeTitle = title.trim();
    const safeDesc = description && typeof description === 'string' ? description.trim() : '';
    const safePriority = ['rendah', 'sedang', 'tinggi'].includes(priority) ? priority : 'rendah';
    const isCompleted = Boolean(completed);

    const updateQuery = `
      UPDATE tasks 
      SET title = ?, description = ?, priority = ?, completed = ?
      WHERE id = ?;
    `;
    const [result] = await pool.query(updateQuery, [safeTitle, safeDesc, safePriority, isCompleted, taskId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Tugas tidak ditemukan.' });
    }

    res.json({
      success: true,
      message: 'Tugas berhasil diperbarui.',
      data: {
        id: taskId,
        title: safeTitle,
        description: safeDesc,
        priority: safePriority,
        completed: isCompleted
      }
    });
  } catch (error) {
    console.error('Error memperbarui tugas:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gagal memperbarui data tugas.',
      error: error.message
    });
  }
});

/**
 * PATCH /api/tasks/:id/toggle
 * Membalik status selesai tugas (completed: true <-> false).
 */
app.patch('/api/tasks/:id/toggle', async (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);

    if (!taskId || isNaN(taskId)) {
      return res.status(400).json({ success: false, message: 'ID tugas tidak valid.' });
    }

    // Ambil status saat ini terlebih dahulu
    const [existing] = await pool.query('SELECT completed FROM tasks WHERE id = ?;', [taskId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Tugas tidak ditemukan.' });
    }

    const newCompleted = !existing[0].completed;
    await pool.query('UPDATE tasks SET completed = ? WHERE id = ?;', [newCompleted, taskId]);

    res.json({
      success: true,
      message: newCompleted ? 'Tugas ditandai selesai.' : 'Tugas dikembalikan ke belum selesai.',
      completed: newCompleted
    });
  } catch (error) {
    console.error('Error toggle tugas:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gagal mengubah status tugas.',
      error: error.message
    });
  }
});

/**
 * DELETE /api/tasks/:id
 * Menghapus tugas berdasarkan ID.
 */
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);

    if (!taskId || isNaN(taskId)) {
      return res.status(400).json({ success: false, message: 'ID tugas tidak valid.' });
    }

    const [result] = await pool.query('DELETE FROM tasks WHERE id = ?;', [taskId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Tugas tidak ditemukan.' });
    }

    res.json({
      success: true,
      message: 'Tugas berhasil dihapus dari database.'
    });
  } catch (error) {
    console.error('Error menghapus tugas:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gagal menghapus tugas dari database.',
      error: error.message
    });
  }
});

// Fallback route untuk SPA (Single Page Application)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Jalankan Server
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`🚀 TaskFlow Backend berjalan di http://localhost:${PORT}`);
  
  // Periksa koneksi awal ke database
  const status = await testConnection();
  if (status.connected) {
    console.log('✅ Terhubung ke MariaDB/MySQL:', status.message);
    await initTable();
  } else {
    console.log('ℹ️ Status Database: Belum terhubung (', status.message, ')');
    console.log('💡 Pastikan MariaDB/MySQL aktif di port ' + (process.env.DB_PORT || 3306) + ' dan file .env sudah sesuai.');
  }
});
