// ============================================================
// app.js — Main application logic
// Handles: Auth, Habit CRUD, Progress, UI, Streaks
// ============================================================

import { auth, db, googleProvider } from './firebase.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy,
  onSnapshot, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─────────────────────────────────────────────
// GLOBALS
// ─────────────────────────────────────────────
let currentUser = null;
let allHabits = [];            // all habits from Firestore (real-time)
let unsubscribeHabits = null;  // Firestore listener cleanup
let currentFilter = 'all';
let selectedEmoji = '✦';
let userIsPro = false;         // Pro status flag
const TODAY = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
const FREE_HABIT_LIMIT = 3;    // Free users can only have 3 habits

// ─────────────────────────────────────────────
// AUTH STATE LISTENER
// Runs on every page load — redirects if needed
// ─────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  const page = window.location.pathname.split('/').pop() || 'index.html';

  if (user) {
    currentUser = user;
    // If on auth pages → go to dashboard
    if (['login.html', 'signup.html', 'index.html', ''].includes(page)) {
      window.location.href = 'dashboard.html';
    } else if (page === 'dashboard.html') {
      initDashboard();
    }
  } else {
    currentUser = null;
    // If on dashboard without auth → go to login
    if (page === 'dashboard.html') {
      window.location.href = 'login.html';
    }
  }
});

// ─────────────────────────────────────────────
// AUTH: SIGN UP
// ─────────────────────────────────────────────
window.handleSignup = async function() {
  const name = document.getElementById('displayName')?.value?.trim();
  const email = document.getElementById('email')?.value?.trim();
  const password = document.getElementById('password')?.value;
  const confirm = document.getElementById('confirm')?.value;
  const btn = document.getElementById('signup-btn');

  clearAuthMessages();

  if (!name) return showAuthError('Please enter your name.');
  if (!email) return showAuthError('Please enter your email.');
  if (password.length < 8) return showAuthError('Password must be at least 8 characters.');
  if (password !== confirm) return showAuthError('Passwords do not match.');

  setButtonLoading(btn, true, 'Creating account…');

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // Save display name
    await updateProfile(cred.user, { displayName: name });
    // Create user profile doc in Firestore
    await setDoc(doc(db, 'users', cred.user.uid), {
      displayName: name,
      email: email,
      createdAt: serverTimestamp(),
      streak: 0,
      lastActiveDate: TODAY
    });
    showAuthSuccess('Account created! Redirecting…');
    setTimeout(() => window.location.href = 'dashboard.html', 1000);
  } catch (err) {
    showAuthError(friendlyAuthError(err.code));
    setButtonLoading(btn, false, 'Create my account');
  }
};

// ─────────────────────────────────────────────
// AUTH: LOG IN
// ─────────────────────────────────────────────
window.handleLogin = async function() {
  const email = document.getElementById('email')?.value?.trim();
  const password = document.getElementById('password')?.value;
  const btn = document.getElementById('login-btn');

  clearAuthMessages();

  if (!email || !password) return showAuthError('Please fill in all fields.');

  setButtonLoading(btn, true, 'Logging in…');

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged will redirect
  } catch (err) {
    showAuthError(friendlyAuthError(err.code));
    setButtonLoading(btn, false, 'Log in');
  }
};

// ─────────────────────────────────────────────
// AUTH: GOOGLE LOGIN
// ─────────────────────────────────────────────
window.handleGoogleLogin = async function() {
  clearAuthMessages();
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    const user = cred.user;
    // Create user doc if first time
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        displayName: user.displayName || 'User',
        email: user.email,
        createdAt: serverTimestamp(),
        streak: 0,
        lastActiveDate: TODAY
      });
    }
    // onAuthStateChanged handles redirect
  } catch (err) {
    showAuthError(friendlyAuthError(err.code));
  }
};

// ─────────────────────────────────────────────
// AUTH: LOG OUT
// ─────────────────────────────────────────────
window.handleLogout = async function() {
  if (unsubscribeHabits) unsubscribeHabits(); // stop Firestore listener
  await signOut(auth);
  window.location.href = 'login.html';
};

// ─────────────────────────────────────────────
// DASHBOARD INIT
// ─────────────────────────────────────────────
function initDashboard() {
  // Set greeting and date
  setGreeting();
  setTopbarDate();

  // Load user info into sidebar
  const name = currentUser.displayName || 'there';
  const email = currentUser.email || '';
  setText('user-name-sidebar', name);
  setText('user-email-sidebar', email);
  const avatarEl = document.getElementById('user-avatar');
  if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();

  // Load streak
  loadStreak();

  // Start real-time habits listener
  startHabitsListener();

  // Load dark mode preference
  if (localStorage.getItem('darkMode') === '1') {
    document.body.classList.add('dark');
  }

  // Init navigation
  initNavigation();

}



// ─────────────────────────────────────────────
// REAL-TIME HABITS LISTENER (Firestore)
// ─────────────────────────────────────────────
function startHabitsListener() {
  if (!currentUser) return;

  // No orderBy — sorting in JS avoids needing a Firestore composite index
  const q = query(
    collection(db, 'habits'),
    where('userId', '==', currentUser.uid)
  );

  unsubscribeHabits = onSnapshot(q, snapshot => {
    allHabits = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        return bTime - aTime;
      });
    renderTodayHabits();
    updateStats();
    renderAllHabits();
    renderWeeklyView();
    renderAnalytics();
    renderHeatmap();
  }, error => {
    console.error('Habits listener error:', error);
    showToast('Could not load habits. Refresh the page.', 'error');
  });
}

// ─────────────────────────────────────────────
// HABIT CRUD
// ─────────────────────────────────────────────

// CREATE or UPDATE habit
window.saveHabit = async function() {
  const name = document.getElementById('habit-name')?.value?.trim();
  const category = document.getElementById('habit-category')?.value;
  const time = document.getElementById('habit-time')?.value;
  const notes = document.getElementById('habit-notes')?.value?.trim();
  const emoji = document.getElementById('habit-emoji')?.value || '✦';
  const editId = document.getElementById('edit-id')?.value;

  if (!name) return showToast('Please enter a habit name.', 'error');


  const data = {
    name,
    category,
    time,
    notes,
    emoji,
    userId: currentUser.uid,
    updatedAt: serverTimestamp()
  };

  try {
    if (editId) {
      // UPDATE existing
      await updateDoc(doc(db, 'habits', editId), data);
      showToast('Habit updated ✓');
    } else {
      // CREATE new
      data.createdAt = serverTimestamp();
      data.completedDates = []; // array of "YYYY-MM-DD" strings
      await addDoc(collection(db, 'habits'), data);
      showToast('Habit added ✓');
    }
    closeModal();
  } catch (err) {
    console.error(err);
    showToast('Something went wrong. Try again.', 'error');
  }
};

// TOGGLE completion for today
window.toggleHabit = async function(habitId, currentlyDone) {
  const ref = doc(db, 'habits', habitId);
  const habit = allHabits.find(h => h.id === habitId);
  if (!habit) return;

  let dates = habit.completedDates || [];

  if (currentlyDone) {
    // Un-complete: remove today's date
    dates = dates.filter(d => d !== TODAY);
  } else {
    // Complete: add today's date
    if (!dates.includes(TODAY)) dates.push(TODAY);
  }

  await updateDoc(ref, { completedDates: dates });
  // Update streak after toggle
  updateStreakForUser();
};

// DELETE habit
window.deleteHabit = async function(habitId) {
  if (!confirm('Delete this habit? This cannot be undone.')) return;
  await deleteDoc(doc(db, 'habits', habitId));
  showToast('Habit deleted');
};

// OPEN edit modal
window.openEditModal = function(habitId) {
  const habit = allHabits.find(h => h.id === habitId);
  if (!habit) return;

  document.getElementById('modal-title').textContent = 'Edit Habit';
  document.getElementById('edit-id').value = habitId;
  document.getElementById('habit-name').value = habit.name;
  document.getElementById('habit-category').value = habit.category;
  document.getElementById('habit-time').value = habit.time;
  document.getElementById('habit-notes').value = habit.notes || '';
  document.getElementById('habit-emoji').value = habit.emoji || '✦';

  // Highlight selected emoji
  document.querySelectorAll('.emoji-opt').forEach(el => {
    el.classList.toggle('selected', el.textContent === (habit.emoji || '✦'));
  });

  document.getElementById('modal-overlay').classList.add('open');
};

// ─────────────────────────────────────────────
// RENDER: TODAY'S HABITS
// ─────────────────────────────────────────────
function renderTodayHabits() {
  const list = document.getElementById('habits-list');
  const emptyState = document.getElementById('empty-state');
  if (!list) return;

  let habits = allHabits;

  // Apply filter
  if (currentFilter === 'done') {
    habits = habits.filter(h => (h.completedDates || []).includes(TODAY));
  } else if (currentFilter === 'pending') {
    habits = habits.filter(h => !(h.completedDates || []).includes(TODAY));
  } else if (currentFilter !== 'all') {
    habits = habits.filter(h => h.category === currentFilter);
  }

  // Remove old habit cards (keep empty state)
  list.querySelectorAll('.habit-card').forEach(el => el.remove());

  if (allHabits.length === 0) {
    emptyState?.classList.remove('hidden');
    return;
  }
  emptyState?.classList.add('hidden');

  if (habits.length === 0) {
    list.insertAdjacentHTML('beforeend', `<div class="no-filter-results">No habits match this filter.</div>`);
    return;
  }

  habits.forEach(habit => {
    const isDone = (habit.completedDates || []).includes(TODAY);
    const card = document.createElement('div');
    card.className = `habit-card ${isDone ? 'done' : ''}`;
    card.innerHTML = `
      <button class="habit-check ${isDone ? 'checked' : ''}" onclick="toggleHabit('${habit.id}', ${isDone})" title="${isDone ? 'Mark incomplete' : 'Mark complete'}">
        ${isDone ? '✓' : ''}
      </button>
      <div class="habit-info">
        <div class="habit-top">
          <span class="habit-emoji">${habit.emoji || '✦'}</span>
          <span class="habit-name">${escapeHtml(habit.name)}</span>
        </div>
        <div class="habit-meta">
          <span class="tag ${habit.category?.toLowerCase()}">${habit.category}</span>
          <span class="habit-time-badge">⏰ ${habit.time}</span>
          ${habit.notes ? `<span class="habit-notes-preview">${escapeHtml(habit.notes.slice(0, 40))}${habit.notes.length > 40 ? '…' : ''}</span>` : ''}
        </div>
      </div>
      <div class="habit-actions">
        <button class="btn-icon-sm" onclick="openEditModal('${habit.id}')" title="Edit">✏️</button>
        <button class="btn-icon-sm danger" onclick="deleteHabit('${habit.id}')" title="Delete">🗑</button>
      </div>
    `;
    list.appendChild(card);
  });
}

// ─────────────────────────────────────────────
// RENDER: ALL HABITS (management view)
// ─────────────────────────────────────────────
function renderAllHabits() {
  const list = document.getElementById('all-habits-list');
  if (!list) return;
  list.innerHTML = '';

  if (allHabits.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><h3>No habits yet</h3><p>Add your first habit to get started.</p></div>`;
    return;
  }

  allHabits.forEach(habit => {
    const totalDone = (habit.completedDates || []).length;
    const streak = calcHabitStreak(habit);
    const row = document.createElement('div');
    row.className = 'all-habit-row';
    row.innerHTML = `
      <div class="all-habit-left">
        <span class="habit-emoji-lg">${habit.emoji || '✦'}</span>
        <div>
          <div class="all-habit-name">${escapeHtml(habit.name)}</div>
          <div class="all-habit-meta">
            <span class="tag ${habit.category?.toLowerCase()}">${habit.category}</span>
            <span>⏰ ${habit.time}</span>
            <span>✓ ${totalDone} completions</span>
            <span>🔥 ${streak} streak</span>
          </div>
        </div>
      </div>
      <div class="all-habit-actions">
        <button class="btn-ghost btn-sm" onclick="openEditModal('${habit.id}')">Edit</button>
        <button class="btn-danger btn-sm" onclick="deleteHabit('${habit.id}')">Delete</button>
      </div>
    `;
    list.appendChild(row);
  });
}

// ─────────────────────────────────────────────
// STATS + PROGRESS BAR
// ─────────────────────────────────────────────
function updateStats() {
  const total = allHabits.length;
  const done = allHabits.filter(h => (h.completedDates || []).includes(TODAY)).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  setText('stat-total', total);
  setText('stat-done', done);
  setText('stat-pct', pct + '%');

  const progress = document.getElementById('main-progress');
  if (progress) progress.style.width = pct + '%';
  setText('progress-pct-label', pct + '%');
}

// ─────────────────────────────────────────────
// WEEKLY VIEW
// ─────────────────────────────────────────────
function renderWeeklyView() {
  const grid = document.getElementById('weekly-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const days = getLast7Days();

  days.forEach(dateStr => {
    const date = new Date(dateStr + 'T00:00:00');
    const dayLabel = date.toLocaleDateString('en', { weekday: 'short' });
    const dateLabel = date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
    const done = allHabits.filter(h => (h.completedDates || []).includes(dateStr)).length;
    const total = allHabits.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const isToday = dateStr === TODAY;

    const card = document.createElement('div');
    card.className = `week-day-card ${isToday ? 'today' : ''} ${pct === 100 && total > 0 ? 'perfect' : ''}`;
    card.innerHTML = `
      <div class="wdc-day">${dayLabel}</div>
      <div class="wdc-date">${dateLabel}</div>
      <div class="wdc-ring">
        <svg viewBox="0 0 36 36" class="ring-svg">
          <circle class="ring-bg" cx="18" cy="18" r="15.9"/>
          <circle class="ring-fill" cx="18" cy="18" r="15.9" stroke-dasharray="${pct}, 100" transform="rotate(-90 18 18)"/>
        </svg>
        <span class="ring-pct">${pct}%</span>
      </div>
      <div class="wdc-stats">${done}/${total}</div>
    `;
    grid.appendChild(card);
  });
}

// ─────────────────────────────────────────────
// ANALYTICS VIEW
// ─────────────────────────────────────────────
function renderAnalytics() {
  // Completion rate (last 30 days)
  const days30 = getLast30Days();
  let rateSum = 0;
  days30.forEach(d => {
    const done = allHabits.filter(h => (h.completedDates || []).includes(d)).length;
    const total = allHabits.length;
    rateSum += total > 0 ? done / total : 0;
  });
  const avgRate = allHabits.length > 0 ? Math.round((rateSum / 30) * 100) : 0;
  setText('ana-rate', avgRate + '%');

  // Total completions
  const totalComp = allHabits.reduce((sum, h) => sum + (h.completedDates || []).length, 0);
  setText('ana-total', totalComp);

  // Most consistent habit
  if (allHabits.length > 0) {
    const best = allHabits.reduce((a, b) =>
      (a.completedDates?.length || 0) > (b.completedDates?.length || 0) ? a : b
    );
    setText('ana-best-habit', best.emoji + ' ' + best.name);
  }

  // Best streak (from user doc)
  loadBestStreak();
}

async function loadBestStreak() {
  try {
    const snap = await getDoc(doc(db, 'users', currentUser.uid));
    if (snap.exists()) {
      const data = snap.data();
      setText('stat-streak', data.streak || 0);
      setText('streak-count', data.streak || 0);
      setText('ana-best-streak', (data.bestStreak || data.streak || 0) + ' 🔥');
    }
  } catch (e) {}
}

// ─────────────────────────────────────────────
// HEATMAP (last 30 days)
// ─────────────────────────────────────────────
function renderHeatmap() {
  const heatmap = document.getElementById('heatmap');
  if (!heatmap) return;
  heatmap.innerHTML = '';

  const days = getLast30Days();
  days.forEach(dateStr => {
    const done = allHabits.filter(h => (h.completedDates || []).includes(dateStr)).length;
    const total = allHabits.length;
    const pct = total > 0 ? done / total : 0;
    let level = 0;
    if (pct > 0) level = 1;
    if (pct >= 0.5) level = 2;
    if (pct >= 0.75) level = 3;
    if (pct === 1) level = 4;

    const cell = document.createElement('div');
    cell.className = `heatmap-cell level-${level}`;
    cell.title = `${dateStr}: ${done}/${total} habits`;
    heatmap.appendChild(cell);
  });
}

// ─────────────────────────────────────────────
// STREAK SYSTEM
// ─────────────────────────────────────────────
async function updateStreakForUser() {
  if (!currentUser) return;

  // Check if all habits completed today
  const total = allHabits.length;
  const done = allHabits.filter(h => (h.completedDates || []).includes(TODAY)).length;
  if (total === 0) return;

  const allDoneToday = done === total;

  try {
    const userRef = doc(db, 'users', currentUser.uid);
    const snap = await getDoc(userRef);
    const data = snap.data() || {};
    let streak = data.streak || 0;
    let bestStreak = data.bestStreak || 0;
    const lastActive = data.lastActiveDate;

    if (allDoneToday) {
      if (lastActive === getYesterday()) {
        streak += 1;
      } else if (lastActive !== TODAY) {
        streak = 1;
      }
      if (streak > bestStreak) bestStreak = streak;
      await updateDoc(userRef, { streak, bestStreak, lastActiveDate: TODAY });
    } else if (lastActive !== TODAY) {
      // If it's a new day and habits aren't all done, reset streak
      // (only reset if streak was from yesterday)
      // We leave streak as-is until end of day
    }

    setText('stat-streak', streak);
    setText('streak-count', streak);
  } catch (e) {}
}

async function loadStreak() {
  updateStreakForUser();
}

function calcHabitStreak(habit) {
  let streak = 0;
  const dates = habit.completedDates || [];
  let check = TODAY;
  while (dates.includes(check)) {
    streak++;
    check = getPrevDay(check);
  }
  return streak;
}

// ─────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────
function initNavigation() {
  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const view = item.dataset.view;
      switchView(view);

      // Update active nav item
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      // Extra render for badges view
      if (view === 'badges') renderBadges();

      // Close sidebar on mobile
      if (window.innerWidth < 768) closeSidebar();
    });
  });
}

function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + viewId);
  if (target) target.classList.add('active');
}

window.toggleSidebar = function() {
  document.getElementById('sidebar')?.classList.toggle('open');
};

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
}

// ─────────────────────────────────────────────
// FILTER
// ─────────────────────────────────────────────
window.filterHabits = function(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderTodayHabits();
};

// ─────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────
window.openAddModal = function() {
  document.getElementById('modal-title').textContent = 'Add New Habit';
  document.getElementById('edit-id').value = '';
  document.getElementById('habit-name').value = '';
  document.getElementById('habit-category').value = 'Wellness';
  document.getElementById('habit-time').value = 'Morning';
  document.getElementById('habit-notes').value = '';
  document.getElementById('habit-emoji').value = '✦';
  document.querySelectorAll('.emoji-opt').forEach(el => {
    el.classList.toggle('selected', el.textContent === '✦');
  });
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(() => document.getElementById('habit-name')?.focus(), 100);
};

window.closeModal = function(e) {
  if (e && e.target !== document.getElementById('modal-overlay')) return;
  document.getElementById('modal-overlay')?.classList.remove('open');
};

window.selectEmoji = function(el, emoji) {
  document.querySelectorAll('.emoji-opt').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('habit-emoji').value = emoji;
  selectedEmoji = emoji;
};

// Keyboard shortcut: Escape closes modal
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.getElementById('modal-overlay')?.classList.remove('open');
  if (e.key === 'Enter' && document.getElementById('modal-overlay')?.classList.contains('open')) {
    saveHabit();
  }
});

// ─────────────────────────────────────────────
// DARK MODE
// ─────────────────────────────────────────────
window.toggleDarkMode = function() {
  document.body.classList.toggle('dark');
  localStorage.setItem('darkMode', document.body.classList.contains('dark') ? '1' : '0');
};

// Apply dark mode on load
if (localStorage.getItem('darkMode') === '1') {
  document.body.classList.add('dark');
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function setGreeting() {
  const hour = new Date().getHours();
  const greetings = [
    [5, 12, 'Good morning'],
    [12, 17, 'Good afternoon'],
    [17, 21, 'Good evening'],
    [21, 24, 'Good night'],
    [0, 5, 'Still up?']
  ];
  const name = currentUser?.displayName?.split(' ')[0] || 'there';
  const greeting = greetings.find(([s, e]) => hour >= s && hour < e)?.[2] || 'Hello';
  setText('greeting', `${greeting}, ${name}! 👋`);
}

function setTopbarDate() {
  const el = document.getElementById('topbar-date');
  if (!el) return;
  el.textContent = new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' });
}

function getLast7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

function getLast30Days() {
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

function getPrevDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}

function showAuthSuccess(msg) {
  const el = document.getElementById('auth-success');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}

function clearAuthMessages() {
  ['auth-error', 'auth-success'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ''; el.classList.add('hidden'); }
  });
}

function setButtonLoading(btn, loading, text) {
  if (!btn) return;
  btn.disabled = loading;
  btn.querySelector('span').textContent = text;
}

function friendlyAuthError(code) {
  const map = {
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password. Try again.',
    'auth/email-already-in-use': 'This email is already registered.',
    'auth/weak-password': 'Password is too weak.',
    'auth/invalid-email': 'Invalid email address.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment.',
    'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
    'auth/network-request-failed': 'Network error. Check your connection.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

// ══════════════════════════════════════════════
// PRO GATE — shown when free user hits limit
// ══════════════════════════════════════════════
window.showProGate = function(reason) {
  const overlay = document.getElementById('pro-gate-overlay');
  const msg = document.getElementById('pro-gate-msg');
  if (msg) msg.textContent = reason || 'This feature requires HabitFlow Pro.';
  if (overlay) overlay.classList.add('open');
};

window.closeProGate = function(e) {
  if (e && e.target !== document.getElementById('pro-gate-overlay')) return;
  document.getElementById('pro-gate-overlay')?.classList.remove('open');
};

window.goToPricing = function() {
  window.location.href = 'pricing.html';
};

// ══════════════════════════════════════════════
// STREAK BADGES SYSTEM (Pro only)
// ══════════════════════════════════════════════
const BADGES = [
  { id: 'first_habit',  icon: '🌱', name: 'First Step',    desc: 'Added your first habit',          condition: (h, s) => h >= 1 },
  { id: 'streak_3',     icon: '🔥', name: 'On Fire',       desc: '3-day streak',                    condition: (h, s) => s >= 3 },
  { id: 'streak_7',     icon: '⚡', name: 'One Week',      desc: '7-day streak',                    condition: (h, s) => s >= 7 },
  { id: 'streak_14',    icon: '💪', name: 'Fortnight',     desc: '14-day streak',                   condition: (h, s) => s >= 14 },
  { id: 'streak_30',    icon: '🏆', name: 'Month Master',  desc: '30-day streak',                   condition: (h, s) => s >= 30 },
  { id: 'habits_5',     icon: '📋', name: 'Builder',       desc: 'Created 5 habits',                condition: (h, s) => h >= 5 },
  { id: 'habits_10',    icon: '🎯', name: 'Goal Setter',   desc: 'Created 10 habits',               condition: (h, s) => h >= 10 },
  { id: 'perfect_day',  icon: '⭐', name: 'Perfect Day',   desc: 'Completed all habits in one day', condition: (h, s, pDay) => pDay },
];

window.renderBadges = function() {
  const container = document.getElementById('badges-container');
  if (!container) return;



  const streak = parseInt(document.getElementById('stat-streak')?.textContent) || 0;
  const habitCount = allHabits.length;
  const perfectDay = allHabits.length > 0 &&
    allHabits.every(h => (h.completedDates || []).includes(TODAY));

  container.innerHTML = '<div class="badges-grid">' +
    BADGES.map(badge => {
      const earned = badge.condition(habitCount, streak, perfectDay);
      return `
        <div class="badge-item ${earned ? 'earned' : 'locked'}">
          <div class="badge-icon">${earned ? badge.icon : '🔒'}</div>
          <div class="badge-name">${badge.name}</div>
          <div class="badge-desc">${badge.desc}</div>
        </div>`;
    }).join('') + '</div>';
};

// ══════════════════════════════════════════════
// AI HABIT SUGGESTIONS (Pro only)
// Uses Claude API via Anthropic
// ══════════════════════════════════════════════
window.openAISuggestions = async function() {

  const overlay = document.getElementById('ai-overlay');
  if (overlay) overlay.classList.add('open');

  const resultsEl = document.getElementById('ai-results');
  if (resultsEl) {
    resultsEl.innerHTML = `
      <div class="ai-loading">
        <div class="spinner"></div>
        <p>Analysing your habits and generating suggestions…</p>
      </div>`;
  }

  // Build context from existing habits
  const habitContext = allHabits.length > 0
    ? allHabits.map(h => `${h.name} (${h.category})`).join(', ')
    : 'No habits yet';

  const categories = [...new Set(allHabits.map(h => h.category))].join(', ') || 'None yet';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `You are a habit coaching expert. A user has these existing habits: ${habitContext}. Their main categories are: ${categories}.

Suggest 6 new, complementary habits they don't have yet. Return ONLY a JSON array (no preamble, no markdown) like:
[
  {
    "name": "Habit name",
    "category": "Wellness|Fitness|Learning|Mind|Social|Finance|Other",
    "time": "Morning|Afternoon|Evening|Anytime",
    "emoji": "single emoji",
    "reason": "One sentence why this pairs well with their existing habits"
  }
]`
        }]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '[]';
    let suggestions;

    try {
      const clean = text.replace(/```json|```/g, '').trim();
      suggestions = JSON.parse(clean);
    } catch {
      suggestions = [];
    }

    if (!resultsEl) return;

    if (!suggestions.length) {
      resultsEl.innerHTML = `<p class="ai-error">Could not generate suggestions right now. Try again.</p>`;
      return;
    }

    resultsEl.innerHTML = `
      <p class="ai-intro">Based on your habits, here are 6 personalised suggestions:</p>
      <div class="ai-suggestions-grid">
        ${suggestions.map(s => `
          <div class="ai-suggestion-card">
            <div class="ai-suggestion-top">
              <span class="ai-emoji">${s.emoji}</span>
              <div>
                <div class="ai-name">${escapeHtml(s.name)}</div>
                <div class="ai-meta">
                  <span class="tag ${s.category?.toLowerCase()}">${s.category}</span>
                  <span>⏰ ${s.time}</span>
                </div>
              </div>
            </div>
            <p class="ai-reason">${escapeHtml(s.reason)}</p>
            <button class="btn-primary btn-sm" onclick="addSuggestedHabit(${JSON.stringify(s).replace(/"/g, '&quot;')})">
              + Add this habit
            </button>
          </div>
        `).join('')}
      </div>`;

  } catch (err) {
    console.error('AI suggestions error:', err);
    if (resultsEl) resultsEl.innerHTML = `<p class="ai-error">AI suggestions unavailable right now. Try again later.</p>`;
  }
};

window.closeAIOverlay = function(e) {
  if (e && e.target !== document.getElementById('ai-overlay')) return;
  document.getElementById('ai-overlay')?.classList.remove('open');
};

window.addSuggestedHabit = async function(suggestion) {

  try {
    await addDoc(collection(db, 'habits'), {
      name: suggestion.name,
      category: suggestion.category,
      time: suggestion.time,
      emoji: suggestion.emoji,
      notes: suggestion.reason,
      userId: currentUser.uid,
      createdAt: serverTimestamp(),
      completedDates: []
    });
    showToast(`"${suggestion.name}" added! ✓`);
    document.getElementById('ai-overlay')?.classList.remove('open');
  } catch(e) {
    showToast('Could not add habit. Try again.', 'error');
  }
};
