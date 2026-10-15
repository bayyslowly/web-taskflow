import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Muat variabel lingkungan dari .env
dotenv.config();

// Konfigurasi koneksi dari process.env
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'taskflow_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 5000 // 5 detik timeout agar cepat memberi respons jika database mati
};

// Buat pool koneksi mysql2
export const pool = mysql.createPool(dbConfig);

/**
 * Menguji konektivitas ke database MariaDB / MySQL.
 * Mengembalikan objek status tanpa melempar fatal exception.
 */
export async function testConnection() {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    return {
      connected: true,
      message: 'Koneksi ke MariaDB/MySQL berhasil.',
      config: {
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
        user: dbConfig.user
      }
    };
  } catch (error) {
    return {
      connected: false,
      message: error.message || 'Gagal terhubung ke database.',
      code: error.code || 'UNKNOWN_ERROR',
      config: {
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
        user: dbConfig.user
      }
    };
  }
}

/**
 * Inisialisasi tabel tasks otomatis jika database sudah terhubung.
 */
export async function initTable() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      priority ENUM('rendah', 'sedang', 'tinggi') DEFAULT 'rendah',
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  try {
    await pool.query(createTableQuery);
    console.log('✅ Tabel "tasks" siap digunakan di database.');
  } catch (error) {
    console.warn('⚠️ Tidak dapat menginisialisasi tabel tasks:', error.message);
  }
}
