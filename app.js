/**
 * TaskFlow - Aplikasi Manajemen Tugas Modern
 * Terintegrasi dengan Backend REST API (Node.js + Express + MariaDB/mysql2)
 * dengan sinkronisasi dan fallback cerdas ke localStorage.
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- Konstanta Endpoint & Storage ---
  const API_BASE_URL = '/api';
  const STORAGE_KEY_TASKS = 'taskflow_tasks_data';
  const STORAGE_KEY_THEME = 'taskflow_theme_mode';

  // --- Data Sampel Awal (Cadangan jika Database dan Storage Kosong) ---
  const INITIAL_TASKS = [
    {
      id: 'sample-1',
      title: 'Menyelesaikan perancangan antarmuka TaskFlow',
      description: 'Membuat desain yang modern, minimalis, responsif, dan nyaman digunakan di semua perangkat.',
      priority: 'tinggi',
      completed: true,
      createdAt: Date.now() - 3600000 * 5
    },
    {
      id: 'sample-2',
      title: 'Mempersiapkan materi presentasi mingguan',
      description: 'Menyusun slide ringkasan capaian proyek dan target rencana sprint berikutnya.',
      priority: 'sedang',
      completed: false,
      createdAt: Date.now() - 3600000 * 2
    },
    {
      id: 'sample-3',
      title: 'Evaluasi performa dan aksesibilitas aplikasi',
      description: 'Memastikan kontras warna optimal, navigasi keyboard berjalan baik, dan waktu render cepat.',
      priority: 'rendah',
      completed: false,
      createdAt: Date.now() - 3600000 * 0.5
    }
  ];

  // --- State Aplikasi ---
  let tasks = [];
  let isDatabaseConnected = false;
  let currentFilter = 'all'; // 'all' | 'pending' | 'completed'
  let currentSearchQuery = '';
  let currentSort = 'newest'; // 'newest' | 'oldest' | 'priority-desc' | 'title-asc'
  let taskPendingDeletionId = null;

  // --- Selektor Elemen DOM ---
  // Header, Status DB & Tema
  const dbStatusBadge = document.getElementById('dbStatusBadge');
  const dbStatusText = document.getElementById('dbStatusText');
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const currentDateText = document.getElementById('currentDateText');

  // Statistik
  const statTotal = document.getElementById('statTotal');
  const statPending = document.getElementById('statPending');
  const statCompleted = document.getElementById('statCompleted');
  const statProgressPercent = document.getElementById('statProgressPercent');
  const statProgressBar = document.getElementById('statProgressBar');

  // Filter Badges
  const badgeAll = document.getElementById('badgeAll');
  const badgePending = document.getElementById('badgePending');
  const badgeCompleted = document.getElementById('badgeCompleted');

  // Form Tambah Tugas
  const taskForm = document.getElementById('taskForm');
  const taskTitleInput = document.getElementById('taskTitle');
  const taskTitleError = document.getElementById('taskTitleError');
  const taskDescInput = document.getElementById('taskDescription');
  const titleCharCount = document.getElementById('titleCharCount');
  const descCharCount = document.getElementById('descCharCount');

  // Kontrol List (Cari, Filter, Sort)
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const filterTabs = document.querySelectorAll('.filter-tab');
  const sortSelect = document.getElementById('sortSelect');
  const activeStatusBar = document.getElementById('activeStatusBar');
  const activeStatusText = document.getElementById('activeStatusText');
  const resetFilterBtn = document.getElementById('resetFilterBtn');

  // Wadah List & Empty State
  const tasksContainer = document.getElementById('tasksContainer');
  const emptyState = document.getElementById('emptyState');
  const emptyTitle = document.getElementById('emptyTitle');
  const emptyDesc = document.getElementById('emptyDesc');

  // Modal Konfirmasi Hapus
  const deleteModal = document.getElementById('deleteModal');
  const deleteTaskTitle = document.getElementById('deleteTaskTitle');
  const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

  // Modal Edit Tugas
  const editModal = document.getElementById('editModal');
  const editTaskForm = document.getElementById('editTaskForm');
  const editTaskId = document.getElementById('editTaskId');
  const editTaskTitle = document.getElementById('editTaskTitle');
  const editTaskTitleError = document.getElementById('editTaskTitleError');
  const editTaskDescription = document.getElementById('editTaskDescription');
  const editTitleCharCount = document.getElementById('editTitleCharCount');
  const editDescCharCount = document.getElementById('editDescCharCount');
  const closeEditModalBtn = document.getElementById('closeEditModalBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');

  // Toast Container
  const toastContainer = document.getElementById('toastContainer');

  // --- Inisialisasi Aplikasi ---
  initTheme();
  renderCurrentDate();
  bindEventListeners();
  initializeApp();

  // ==========================================================================
  // INISIALISASI & KONEKSI API / DATABASE
  // ==========================================================================

  async function initializeApp() {
    // 1. Periksa koneksi backend & MariaDB via /api/health
    await checkDatabaseHealth(false);

    // 2. Muat data tugas (dari API jika MariaDB aktif, fallback ke localStorage jika belum)
    await loadTasks();
  }

  /**
   * Menguji endpoint /api/health untuk memeriksa status MariaDB
   */
  async function checkDatabaseHealth(showUserToast = false) {
    if (dbStatusText) dbStatusText.textContent = 'Memeriksa DB...';

    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      const data = await response.json();

      if (data && data.database && data.database.connected) {
        isDatabaseConnected = true;
        updateDbBadge(true, 'MariaDB Terhubung');
        if (showUserToast) {
          showToast('✅ Berhasil terhubung ke database MariaDB!', 'success');
        }
      } else {
        isDatabaseConnected = false;
        const errMessage = (data && data.database && data.database.message) || 'Tidak terhubung';
        updateDbBadge(false, 'MariaDB Offline (Mode Lokal)');
        if (showUserToast) {
          showToast(`⚠️ Database belum terhubung: ${errMessage}`, 'info');
        }
      }
    } catch (error) {
      // Backend server tidak merespons atau offline
      isDatabaseConnected = false;
      updateDbBadge(false, 'Mode Lokal (Browser)');
      if (showUserToast) {
        showToast('ℹ️ Server backend belum berjalan. Menggunakan data lokal.', 'info');
      }
    }
  }

  function updateDbBadge(connected, text) {
    if (!dbStatusBadge || !dbStatusText) return;

    if (connected) {
      dbStatusBadge.classList.remove('is-disconnected');
      dbStatusBadge.classList.add('is-connected');
      dbStatusBadge.title = 'Terhubung ke MariaDB. Klik untuk cek ulang.';
    } else {
      dbStatusBadge.classList.remove('is-connected');
      dbStatusBadge.classList.add('is-disconnected');
      dbStatusBadge.title = 'MariaDB belum aktif atau kredensial belum sesuai. Klik untuk cek ulang.';
    }

    dbStatusText.textContent = text;
  }

  // ==========================================================================
  // OPERASI DATA (API DENGAN FALLBACK LOCALSTORAGE)
  // ==========================================================================

  /**
   * Membaca tugas: Mengutamakan GET /api/tasks jika database terhubung,
   * jika gagal membaca dari localStorage.
   */
  async function loadTasks() {
    if (isDatabaseConnected) {
      try {
        const response = await fetch(`${API_BASE_URL}/tasks`);
        if (response.ok) {
          const resData = await response.json();
          if (resData.success && Array.isArray(resData.data)) {
            tasks = resData.data;
            // Sinkronkan salinan cadangan ke localStorage
            localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
            updateUI();
            return;
          }
        }
      } catch (err) {
        console.warn('Gagal memuat tugas dari API, beralih ke localStorage:', err);
      }
    }

    // Fallback membaca dari localStorage
    tasks = loadTasksFromStorage();
    updateUI();
  }

  function loadTasksFromStorage() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_TASKS);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (error) {
      console.warn('Gagal membaca data dari localStorage:', error);
    }
    // Jika masih kosong
    localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(INITIAL_TASKS));
    return [...INITIAL_TASKS];
  }

  function saveTasksToStorage(tasksArray) {
    try {
      localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasksArray));
    } catch (error) {
      console.error('Gagal menyimpan ke localStorage:', error);
    }
  }

  // ==========================================================================
  // OPERASI TUGAS (CRUD)
  // ==========================================================================

  // 1. Tambah Tugas Baru (POST /api/tasks)
  async function handleAddTask(e) {
    e.preventDefault();

    const titleValue = taskTitleInput.value.trim();
    const descValue = taskDescInput.value.trim();
    const priorityRadio = document.querySelector('input[name="priority"]:checked');
    const priorityValue = priorityRadio ? priorityRadio.value : 'rendah';

    if (!titleValue) {
      showInputError(taskTitleInput, taskTitleError, 'Judul tugas tidak boleh kosong');
      taskTitleInput.focus();
      return;
    }

    clearInputError(taskTitleInput, taskTitleError);

    // Siapkan payload tugas
    const payload = {
      title: titleValue,
      description: descValue,
      priority: priorityValue
    };

    if (isDatabaseConnected) {
      try {
        const response = await fetch(`${API_BASE_URL}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const resData = await response.json();

        if (response.ok && resData.success) {
          tasks.unshift(resData.data);
          saveTasksToStorage(tasks);
          resetTaskForm();
          updateUI();
          showToast('Tugas berhasil disimpan ke MariaDB! 🎉', 'success');
          return;
        } else {
          throw new Error(resData.message || 'Gagal menyimpan ke database');
        }
      } catch (err) {
        console.warn('Gagal menyimpan ke API, menyimpan ke lokal:', err);
        showToast('Database bermasalah, tugas disimpan sementara di browser.', 'info');
      }
    }

    // Fallback simpan lokal
    const localTask = {
      id: 'task-' + Date.now(),
      title: titleValue,
      description: descValue,
      priority: priorityValue,
      completed: false,
      createdAt: Date.now()
    };

    tasks.unshift(localTask);
    saveTasksToStorage(tasks);
    resetTaskForm();
    updateUI();
    showToast('Tugas berhasil ditambahkan ke penyimpanan lokal.', 'success');
  }

  function resetTaskForm() {
    taskForm.reset();
    updateCharCounters();
    const defaultRadio = document.querySelector('input[name="priority"][value="rendah"]');
    if (defaultRadio) defaultRadio.checked = true;
  }

  // 2. Toggle Status Selesai / Belum Selesai (PATCH /api/tasks/:id/toggle)
  async function toggleTaskCompletion(taskId) {
    const taskIndex = tasks.findIndex(t => String(t.id) === String(taskId));
    if (taskIndex === -1) return;

    const currentTask = tasks[taskIndex];
    const previousState = currentTask.completed;
    const newState = !previousState;

    // Optimistic UI update
    currentTask.completed = newState;
    updateUI();

    if (isDatabaseConnected && !isNaN(parseInt(taskId, 10))) {
      try {
        const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/toggle`, {
          method: 'PATCH'
        });

        if (response.ok) {
          saveTasksToStorage(tasks);
          const msg = newState ? 'Tugas ditandai selesai di MariaDB! ✓' : 'Tugas dikembalikan ke belum selesai.';
          showToast(msg, newState ? 'success' : 'info');
          return;
        }
      } catch (err) {
        console.warn('Gagal sinkron toggle ke API:', err);
      }
    }

    // Fallback lokal
    saveTasksToStorage(tasks);
    const msg = newState ? 'Tugas ditandai selesai! ✓' : 'Tugas dikembalikan ke belum selesai.';
    showToast(msg, newState ? 'success' : 'info');
  }

  // 3. Edit Tugas (PUT /api/tasks/:id)
  function openEditModal(taskId) {
    const task = tasks.find(t => String(t.id) === String(taskId));
    if (!task) return;

    editTaskId.value = task.id;
    editTaskTitle.value = task.title;
    editTaskDescription.value = task.description || '';

    const editPriorityRadio = document.querySelector(`input[name="editPriority"][value="${task.priority}"]`);
    if (editPriorityRadio) {
      editPriorityRadio.checked = true;
    }

    clearInputError(editTaskTitle, editTaskTitleError);
    updateEditCharCounters();

    editModal.style.display = 'flex';
    setTimeout(() => {
      editTaskTitle.focus();
    }, 50);
  }

  function closeEditModal() {
    editModal.style.display = 'none';
    editTaskForm.reset();
  }

  async function handleSaveEditTask(e) {
    e.preventDefault();

    const taskId = editTaskId.value;
    const taskIndex = tasks.findIndex(t => String(t.id) === String(taskId));
    if (taskIndex === -1) return;

    const newTitle = editTaskTitle.value.trim();
    const newDesc = editTaskDescription.value.trim();
    const editPriorityRadio = document.querySelector('input[name="editPriority"]:checked');
    const newPriority = editPriorityRadio ? editPriorityRadio.value : 'rendah';

    if (!newTitle) {
      showInputError(editTaskTitle, editTaskTitleError, 'Judul tugas tidak boleh kosong');
      editTaskTitle.focus();
      return;
    }

    const currentCompleted = tasks[taskIndex].completed;

    if (isDatabaseConnected && !isNaN(parseInt(taskId, 10))) {
      try {
        const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: newTitle,
            description: newDesc,
            priority: newPriority,
            completed: currentCompleted
          })
        });

        if (response.ok) {
          tasks[taskIndex].title = newTitle;
          tasks[taskIndex].description = newDesc;
          tasks[taskIndex].priority = newPriority;
          saveTasksToStorage(tasks);
          closeEditModal();
          updateUI();
          showToast('Perubahan berhasil disimpan ke database!', 'success');
          return;
        }
      } catch (err) {
        console.warn('Gagal mengupdate lewat API, menyimpan lokal:', err);
      }
    }

    // Fallback lokal
    tasks[taskIndex].title = newTitle;
    tasks[taskIndex].description = newDesc;
    tasks[taskIndex].priority = newPriority;
    saveTasksToStorage(tasks);
    closeEditModal();
    updateUI();
    showToast('Perubahan tugas berhasil disimpan.', 'success');
  }

  // 4. Hapus Tugas (DELETE /api/tasks/:id)
  function openDeleteModal(taskId) {
    const task = tasks.find(t => String(t.id) === String(taskId));
    if (!task) return;

    taskPendingDeletionId = taskId;
    deleteTaskTitle.textContent = task.title;
    deleteModal.style.display = 'flex';
  }

  function closeDeleteModal() {
    taskPendingDeletionId = null;
    deleteModal.style.display = 'none';
  }

  async function confirmDeleteTask() {
    if (!taskPendingDeletionId) return;

    const idToDelete = taskPendingDeletionId;

    if (isDatabaseConnected && !isNaN(parseInt(idToDelete, 10))) {
      try {
        const response = await fetch(`${API_BASE_URL}/tasks/${idToDelete}`, {
          method: 'DELETE'
        });

        if (response.ok) {
          tasks = tasks.filter(t => String(t.id) !== String(idToDelete));
          saveTasksToStorage(tasks);
          closeDeleteModal();
          updateUI();
          showToast('Tugas berhasil dihapus dari database.', 'danger');
          return;
        }
      } catch (err) {
        console.warn('Gagal menghapus via API, menghapus dari lokal:', err);
      }
    }

    // Fallback lokal
    tasks = tasks.filter(t => String(t.id) !== String(idToDelete));
    saveTasksToStorage(tasks);
    closeDeleteModal();
    updateUI();
    showToast('Tugas berhasil dihapus dari daftar.', 'danger');
  }

  // ==========================================================================
  // TEMA & TANGGAL
  // ==========================================================================

  function initTheme() {
    const savedTheme = localStorage.getItem(STORAGE_KEY_THEME);
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem(STORAGE_KEY_THEME, newTheme);
    showToast(`Mode ${newTheme === 'dark' ? 'Gelap' : 'Terang'} aktif`, 'info');
  }

  function renderCurrentDate() {
    const now = new Date();
    const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    currentDateText.textContent = now.toLocaleDateString('id-ID', options);
  }

  function formatTaskDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const dateFormatted = date.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    const timeFormatted = date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    return `${dateFormatted}, ${timeFormatted}`;
  }

  // ==========================================================================
  // RENDER UI & STATISTIK
  // ==========================================================================

  function updateUI() {
    updateStatistics();
    renderTasks();
  }

  function updateStatistics() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const pending = total - completed;
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

    statTotal.textContent = total;
    statPending.textContent = pending;
    statCompleted.textContent = completed;
    statProgressPercent.textContent = `${percent}%`;
    statProgressBar.style.width = `${percent}%`;

    badgeAll.textContent = total;
    badgePending.textContent = pending;
    badgeCompleted.textContent = completed;
  }

  function getFilteredAndSortedTasks() {
    let result = [...tasks];

    // 1. Filter Status
    if (currentFilter === 'pending') {
      result = result.filter(t => !t.completed);
    } else if (currentFilter === 'completed') {
      result = result.filter(t => t.completed);
    }

    // 2. Filter Pencarian
    if (currentSearchQuery.trim() !== '') {
      const q = currentSearchQuery.toLowerCase();
      result = result.filter(t => 
        (t.title && t.title.toLowerCase().includes(q)) || 
        (t.description && t.description.toLowerCase().includes(q))
      );
    }

    // 3. Sortir Data
    const priorityWeights = { tinggi: 3, sedang: 2, rendah: 1 };

    result.sort((a, b) => {
      switch (currentSort) {
        case 'newest':
          return (b.createdAt || 0) - (a.createdAt || 0);
        case 'oldest':
          return (a.createdAt || 0) - (b.createdAt || 0);
        case 'priority-desc':
          return (priorityWeights[b.priority] || 0) - (priorityWeights[a.priority] || 0);
        case 'title-asc':
          return a.title.localeCompare(b.title, 'id');
        default:
          return 0;
      }
    });

    return result;
  }

  function renderTasks() {
    const filteredTasks = getFilteredAndSortedTasks();
    updateActiveStatusBar();

    if (filteredTasks.length === 0) {
      tasksContainer.innerHTML = '';
      emptyState.style.display = 'flex';

      if (currentSearchQuery.trim() !== '') {
        emptyTitle.textContent = 'Tugas Tidak Ditemukan';
        emptyDesc.textContent = `Tidak ada tugas yang sesuai dengan kata kunci "${currentSearchQuery}". Coba kata kunci lain atau bersihkan pencarian.`;
      } else if (currentFilter === 'completed') {
        emptyTitle.textContent = 'Belum Ada Tugas Selesai';
        emptyDesc.textContent = 'Tandai tugas yang sudah tuntas dengan mengklik kotak centang pada daftar tugas.';
      } else if (currentFilter === 'pending') {
        emptyTitle.textContent = 'Semua Tugas Telah Selesai!';
        emptyDesc.textContent = 'Luar biasa! Tidak ada tugas yang tertunda saat ini.';
      } else {
        emptyTitle.textContent = 'Belum Ada Tugas';
        emptyDesc.textContent = 'Daftar tugas Anda masih kosong. Silakan gunakan formulir di samping untuk menambahkan tugas baru.';
      }
      return;
    }

    emptyState.style.display = 'none';
    tasksContainer.innerHTML = '';

    filteredTasks.forEach(task => {
      const card = createTaskCardElement(task);
      tasksContainer.appendChild(card);
    });
  }

  function updateActiveStatusBar() {
    const isSearchActive = currentSearchQuery.trim() !== '';
    const isFilterNonDefault = currentFilter !== 'all';

    if (isSearchActive || isFilterNonDefault) {
      activeStatusBar.style.display = 'flex';
      let message = 'Menampilkan: ';
      
      const filterLabels = {
        all: 'Semua Tugas',
        pending: 'Tugas Belum Selesai',
        completed: 'Tugas Selesai'
      };

      message += filterLabels[currentFilter] || '';

      if (isSearchActive) {
        message += ` • Pencarian: "${currentSearchQuery}"`;
      }

      activeStatusText.textContent = message;
    } else {
      activeStatusBar.style.display = 'none';
    }
  }

  function createTaskCardElement(task) {
    const card = document.createElement('article');
    card.className = `task-card ${task.completed ? 'is-completed' : ''}`;
    card.setAttribute('data-task-id', task.id);

    const safeTitle = escapeHTML(task.title);
    const safeDesc = task.description ? escapeHTML(task.description) : '';
    const formattedDate = formatTaskDate(task.createdAt);

    const priorityLabels = {
      rendah: 'Rendah',
      sedang: 'Sedang',
      tinggi: 'Tinggi'
    };
    const priorityText = priorityLabels[task.priority] || 'Rendah';

    card.innerHTML = `
      <button 
        type="button" 
        class="task-checkbox-btn" 
        aria-label="${task.completed ? 'Tandai tugas belum selesai' : 'Tandai tugas selesai'}" 
        title="${task.completed ? 'Klik untuk tandai belum selesai' : 'Klik untuk tandai selesai'}"
        data-action="toggle"
      >
        <span class="checkbox-custom-box">
          <svg class="checkbox-check-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </span>
      </button>

      <div class="task-main-content">
        <div class="task-title-row">
          <h3 class="task-card-title">${safeTitle}</h3>
        </div>
        ${safeDesc ? `<p class="task-card-desc">${safeDesc}</p>` : ''}
        
        <div class="task-card-meta">
          <span class="badge badge-priority-${task.priority}" title="Prioritas: ${priorityText}">
            <span class="priority-dot"></span> ${priorityText}
          </span>
          <span class="badge badge-status ${task.completed ? 'is-completed' : 'is-pending'}">
            ${task.completed ? '✓ Selesai' : '⏳ Belum Selesai'}
          </span>
          ${formattedDate ? `
            <span class="task-created-time">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              ${formattedDate}
            </span>
          ` : ''}
        </div>
      </div>

      <div class="task-actions">
        <button 
          type="button" 
          class="action-btn edit-btn" 
          aria-label="Edit tugas" 
          title="Edit Tugas"
          data-action="edit"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button 
          type="button" 
          class="action-btn delete-btn" 
          aria-label="Hapus tugas" 
          title="Hapus Tugas"
          data-action="delete"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </div>
    `;

    return card;
  }

  // ==========================================================================
  // TOAST NOTIFICATIONS
  // ==========================================================================

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');

    let iconSVG = '';
    if (type === 'success') {
      iconSVG = `
        <svg class="toast-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
      `;
    } else if (type === 'danger') {
      iconSVG = `
        <svg class="toast-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      `;
    } else {
      iconSVG = `
        <svg class="toast-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
      `;
    }

    toast.innerHTML = `
      ${iconSVG}
      <span class="toast-message">${escapeHTML(message)}</span>
      <button type="button" class="toast-close-btn" aria-label="Tutup notifikasi">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;

    toastContainer.appendChild(toast);

    const dismissTimeout = setTimeout(() => {
      dismissToast(toast);
    }, 3800);

    const closeBtn = toast.querySelector('.toast-close-btn');
    closeBtn.addEventListener('click', () => {
      clearTimeout(dismissTimeout);
      dismissToast(toast);
    });
  }

  function dismissToast(toast) {
    toast.classList.add('toast-hiding');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    });
  }

  // ==========================================================================
  // HELPER FORM & VALIDASI
  // ==========================================================================

  function showInputError(inputEl, errorEl, message) {
    inputEl.classList.add('is-invalid');
    errorEl.textContent = message;
    errorEl.classList.add('visible');
  }

  function clearInputError(inputEl, errorEl) {
    inputEl.classList.remove('is-invalid');
    errorEl.classList.remove('visible');
  }

  function updateCharCounters() {
    titleCharCount.textContent = `${taskTitleInput.value.length}/80`;
    descCharCount.textContent = `${taskDescInput.value.length}/250`;
  }

  function updateEditCharCounters() {
    editTitleCharCount.textContent = `${editTaskTitle.value.length}/80`;
    editDescCharCount.textContent = `${editTaskDescription.value.length}/250`;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ==========================================================================
  // EVENT LISTENERS & DELEGASI
  // ==========================================================================

  function bindEventListeners() {
    // 1. Klik Badge DB untuk cek ulang status koneksi
    if (dbStatusBadge) {
      dbStatusBadge.addEventListener('click', async () => {
        await checkDatabaseHealth(true);
        if (isDatabaseConnected) {
          await loadTasks();
        }
      });
    }

    // 2. Toggle Tema
    themeToggleBtn.addEventListener('click', toggleTheme);

    // 3. Tambah Tugas Form
    taskForm.addEventListener('submit', handleAddTask);

    taskTitleInput.addEventListener('input', () => {
      clearInputError(taskTitleInput, taskTitleError);
      updateCharCounters();
    });
    taskDescInput.addEventListener('input', updateCharCounters);

    // 4. Delegasi Event Kartu Tugas (Toggle, Edit, Delete)
    tasksContainer.addEventListener('click', (e) => {
      const targetBtn = e.target.closest('[data-action]');
      if (!targetBtn) return;

      const card = targetBtn.closest('.task-card');
      if (!card) return;

      const taskId = card.getAttribute('data-task-id');
      const action = targetBtn.getAttribute('data-action');

      if (action === 'toggle') {
        toggleTaskCompletion(taskId);
      } else if (action === 'edit') {
        openEditModal(taskId);
      } else if (action === 'delete') {
        openDeleteModal(taskId);
      }
    });

    // 5. Modal Konfirmasi Hapus
    cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    confirmDeleteBtn.addEventListener('click', confirmDeleteTask);

    deleteModal.addEventListener('click', (e) => {
      if (e.target === deleteModal) closeDeleteModal();
    });

    // 6. Modal Edit Tugas
    editTaskForm.addEventListener('submit', handleSaveEditTask);
    closeEditModalBtn.addEventListener('click', closeEditModal);
    cancelEditBtn.addEventListener('click', closeEditModal);

    editTaskTitle.addEventListener('input', () => {
      clearInputError(editTaskTitle, editTaskTitleError);
      updateEditCharCounters();
    });
    editTaskDescription.addEventListener('input', updateEditCharCounters);

    editModal.addEventListener('click', (e) => {
      if (e.target === editModal) closeEditModal();
    });

    // 7. Tombol ESC untuk tutup modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (deleteModal.style.display === 'flex') closeDeleteModal();
        if (editModal.style.display === 'flex') closeEditModal();
      }
    });

    // 8. Filter Tabs
    filterTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        filterTabs.forEach(t => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        currentFilter = tab.getAttribute('data-filter');
        renderTasks();
      });
    });

    // 9. Pencarian
    searchInput.addEventListener('input', () => {
      currentSearchQuery = searchInput.value;
      clearSearchBtn.style.display = currentSearchQuery.length > 0 ? 'flex' : 'none';
      renderTasks();
    });

    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      currentSearchQuery = '';
      clearSearchBtn.style.display = 'none';
      searchInput.focus();
      renderTasks();
    });

    // 10. Sortir
    sortSelect.addEventListener('change', () => {
      currentSort = sortSelect.value;
      renderTasks();
    });

    // 11. Reset Filter
    resetFilterBtn.addEventListener('click', () => {
      currentFilter = 'all';
      currentSearchQuery = '';
      searchInput.value = '';
      clearSearchBtn.style.display = 'none';

      filterTabs.forEach(t => {
        const isAll = t.getAttribute('data-filter') === 'all';
        t.classList.toggle('active', isAll);
        t.setAttribute('aria-selected', isAll ? 'true' : 'false');
      });

      renderTasks();
      showToast('Filter telah direset', 'info');
    });
  }
});
