-- ============================================================================
-- TaskFlow Database Schema (MariaDB / MySQL)
-- ============================================================================

-- 1. Buat database jika belum ada
CREATE DATABASE IF NOT EXISTS taskflow_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- 2. Gunakan database taskflow_db
USE taskflow_db;

-- 3. Buat tabel tasks
CREATE TABLE IF NOT EXISTS tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  priority ENUM('rendah', 'sedang', 'tinggi') DEFAULT 'rendah',
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Contoh data awal (opsional)
INSERT INTO tasks (title, description, priority, completed) VALUES
('Menyelesaikan perancangan antarmuka TaskFlow', 'Membuat desain yang modern, minimalis, responsif, dan nyaman digunakan di semua perangkat.', 'tinggi', TRUE),
('Mempersiapkan materi presentasi mingguan', 'Menyusun slide ringkasan capaian proyek dan target rencana sprint berikutnya.', 'sedang', FALSE),
('Evaluasi performa dan aksesibilitas aplikasi', 'Memastikan kontras warna optimal, navigasi keyboard berjalan baik, dan waktu render cepat.', 'rendah', FALSE);
