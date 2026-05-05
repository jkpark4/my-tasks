'use strict';

// ── Constants ────────────────────────────────────────────────
const STORAGE_KEY = 'todos';
const THEME_KEY   = 'theme';
const SORT_KEY    = 'sortMode';

const CATEGORY_LABEL = { work: '업무', personal: '개인', study: '공부' };
const CATEGORY_CLASS = { work: 'cat-work', personal: 'cat-personal', study: 'cat-study' };

// ── State ────────────────────────────────────────────────────
let todos             = [];
let currentFilter     = 'all';
let pendingDeleteId   = null;
let pendingImportData = null;
let newlyAddedId      = null;
let draggedItemId     = null;
let searchQuery       = '';
let searchTimer       = null;
let dialogMode        = null; // 'delete' | 'clear-completed' | 'import'
let sortMode          = localStorage.getItem(SORT_KEY) || 'createdAt-desc';

// keyed DOM reconciliation: id → <li>
const renderedMap = new Map();

// ── DOM refs ─────────────────────────────────────────────────
const todoInput         = document.getElementById('todo-input');
const categorySelect    = document.getElementById('category-select');
const addBtn            = document.getElementById('add-btn');
const todoList          = document.getElementById('todo-list');
const progressBar       = document.getElementById('progress-bar');
const progressText      = document.getElementById('progress-text');
const errorMsg          = document.getElementById('error-msg');
const currentDateEl     = document.getElementById('current-date');
const celebration       = document.getElementById('celebration');
const overlay           = document.getElementById('overlay');
const deleteDialog      = document.getElementById('delete-dialog');
const emptyState        = document.getElementById('empty-state');
const badgeRemaining    = document.getElementById('badge-remaining');
const clearCompletedBtn = document.getElementById('clear-completed-btn');
const dialogMsg         = document.getElementById('dialog-msg');
const confirmDeleteBtn  = document.getElementById('confirm-delete');
// progress detail refs
const barWork       = document.getElementById('bar-work');
const barPersonal   = document.getElementById('bar-personal');
const barStudy      = document.getElementById('bar-study');
const countWork     = document.getElementById('count-work');
const countPersonal = document.getElementById('count-personal');
const countStudy    = document.getElementById('count-study');
const todayCountEl  = document.getElementById('today-count');

// ── Init ─────────────────────────────────────────────────────
function init() {
  displayDate();
  initTheme();
  initSort();
  loadTodos();
  render();
  bindEvents();
  todoInput.focus();
}

function displayDate() {
  const d = new Date();
  currentDateEl.textContent =
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Theme ────────────────────────────────────────────────────
function initTheme() {
  if (localStorage.getItem(THEME_KEY) === 'dark') applyDark(true);
  document.getElementById('theme-toggle-input').addEventListener('change', e => {
    applyDark(e.target.checked);
    localStorage.setItem(THEME_KEY, e.target.checked ? 'dark' : 'light');
  });
}

function applyDark(on) {
  document.body.classList.toggle('dark', on);
  document.getElementById('theme-toggle-input').checked = on;
}

// ── Sort ─────────────────────────────────────────────────────
function initSort() {
  document.getElementById('sort-select').value = sortMode;
}

function getSorted(arr) {
  const result = [...arr];
  switch (sortMode) {
    case 'createdAt-asc':
      return result.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    case 'createdAt-desc':
      return result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    case 'category': {
      const order = { work: 0, personal: 1, study: 2 };
      return result.sort((a, b) => order[a.category] - order[b.category]);
    }
    case 'completed':
      return result.sort((a, b) => Number(a.completed) - Number(b.completed));
    default: // 'manual'
      return result;
  }
}

// ── Persistence ──────────────────────────────────────────────
function loadTodos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    todos = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(todos)) todos = [];
  } catch {
    todos = [];
  }
}

function saveTodos() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

// ── Export / Import ──────────────────────────────────────────
function exportTodos() {
  const d    = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const blob = new Blob([JSON.stringify(todos, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `mytodo_${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function triggerImport() {
  document.getElementById('import-file').click();
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const parsed = JSON.parse(ev.target.result);
      if (!Array.isArray(parsed)) throw new Error();
      pendingImportData = parsed;
      openImportDialog(parsed.length);
    } catch {
      alert('유효하지 않은 JSON 파일입니다.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function applyImport() {
  if (!pendingImportData) return;
  // Auto-backup current data before replacing
  if (todos.length > 0) exportTodos();
  todos = pendingImportData;
  pendingImportData = null;
  // Full reset — data is completely replaced
  todoList.innerHTML = '';
  renderedMap.clear();
  saveTodos();
  render();
}

// ── CRUD ─────────────────────────────────────────────────────
function addTodo(text, category) {
  const id = Date.now().toString();
  newlyAddedId = id;
  todos.unshift({ id, text, category, completed: false, createdAt: new Date().toISOString() });
  saveTodos();
  render();
  newlyAddedId = null;
}

function deleteTodo(id) {
  const li = renderedMap.get(id);
  if (li) {
    li.classList.add('fade-out');
    setTimeout(() => {
      todos = todos.filter(t => t.id !== id);
      renderedMap.delete(id);
      saveTodos();
      render();
    }, 240);
  } else {
    todos = todos.filter(t => t.id !== id);
    saveTodos();
    render();
  }
}

function clearCompleted() {
  todos = todos.filter(t => !t.completed);
  saveTodos();
  render();
}

function toggleTodo(id) {
  const todo = todos.find(t => t.id === id);
  if (!todo) return;
  todo.completed = !todo.completed;
  saveTodos();
  render();
  if (todos.length > 0 && todos.every(t => t.completed)) showCelebration();
}

function updateTodo(id, text, category) {
  const todo = todos.find(t => t.id === id);
  if (!todo) return;
  todo.text = text;
  todo.category = category;
  saveTodos();
  render();
}

// ── Drag & Drop ──────────────────────────────────────────────
function reorderTodo(draggedId, targetId) {
  if (draggedId === targetId) return;
  const dragIdx = todos.findIndex(t => t.id === draggedId);
  if (dragIdx === -1) return;
  const [item] = todos.splice(dragIdx, 1);
  const targetIdx = todos.findIndex(t => t.id === targetId);
  todos.splice(targetIdx === -1 ? todos.length : targetIdx, 0, item);
  sortMode = 'manual';
  document.getElementById('sort-select').value = 'manual';
  localStorage.setItem(SORT_KEY, 'manual');
  saveTodos();
  render();
}

// ── Filter ───────────────────────────────────────────────────
function setFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === filter);
  });
  render();
}

// ── Render ───────────────────────────────────────────────────
function getFiltered() {
  let result = currentFilter === 'all' ? todos : todos.filter(t => t.category === currentFilter);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    result = result.filter(t => t.text.toLowerCase().includes(q));
  }
  return result;
}

function render() {
  const filtered = getFiltered();
  const sorted   = getSorted(filtered);
  updateProgress(filtered);
  updateBadge();

  if (sorted.length === 0) {
    emptyState.classList.remove('hidden');
    for (const li of renderedMap.values()) li.remove();
    renderedMap.clear();
    return;
  }

  emptyState.classList.add('hidden');
  reconcile(sorted);
}

// Keyed reconciliation — only touch changed / new / removed nodes
function reconcile(sorted) {
  const newIdSet = new Set(sorted.map(t => t.id));

  // Remove nodes no longer in the visible list
  for (const [id, li] of renderedMap) {
    if (!newIdSet.has(id)) {
      li.remove();
      renderedMap.delete(id);
    }
  }

  // Insert / patch / reorder
  for (let i = 0; i < sorted.length; i++) {
    const todo = sorted[i];
    let li = renderedMap.get(todo.id);

    if (li) {
      patchItem(li, todo);
    } else {
      li = buildItem(todo);
      renderedMap.set(todo.id, li);
    }

    // Move to correct position only when needed
    if (todoList.children[i] !== li) {
      todoList.insertBefore(li, todoList.children[i] || null);
    }
  }
}

// In-place DOM patch for a single item — avoids rebuilding unchanged nodes
function patchItem(li, todo) {
  // Don't disturb items currently in edit mode
  if (li.querySelector('.edit-input')) return;

  li.classList.toggle('completed', todo.completed);

  const checkbox = li.querySelector('.todo-checkbox');
  if (checkbox && checkbox.checked !== todo.completed) checkbox.checked = todo.completed;

  const badge = li.querySelector('.category-label');
  if (badge) {
    const newCls = `category-label ${CATEGORY_CLASS[todo.category]}`;
    if (badge.className !== newCls) {
      badge.className  = newCls;
      badge.textContent = CATEGORY_LABEL[todo.category];
    }
  }

  const textEl = li.querySelector('.todo-text');
  if (textEl && textEl.textContent !== todo.text) textEl.textContent = todo.text;
}

function updateBadge() {
  const remaining = todos.filter(t => !t.completed).length;
  badgeRemaining.textContent = `${remaining}개 남음`;
  badgeRemaining.classList.toggle('hidden', remaining === 0);
  clearCompletedBtn.classList.toggle('hidden', !todos.some(t => t.completed));
}

function getRelativeTime(isoString) {
  const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diffSec < 60)  return '방금 전';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60)  return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7)   return `${diffDay}일 전`;
  const d = new Date(isoString);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function getTodayCount() {
  const today = new Date().toDateString();
  return todos.filter(t => new Date(t.createdAt).toDateString() === today).length;
}

function updateProgress(filtered) {
  const total = filtered.length;
  const done  = filtered.filter(t => t.completed).length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

  progressBar.style.width    = pct + '%';
  progressText.textContent   = `${done}/${total} 완료 (${pct}%)`;

  const cats = [
    { key: 'work',     bar: barWork,     count: countWork     },
    { key: 'personal', bar: barPersonal, count: countPersonal },
    { key: 'study',    bar: barStudy,    count: countStudy    },
  ];
  for (const { key, bar, count } of cats) {
    const catTodos = todos.filter(t => t.category === key);
    const catDone  = catTodos.filter(t => t.completed).length;
    const catTotal = catTodos.length;
    bar.style.width    = catTotal > 0 ? Math.round((catDone / catTotal) * 100) + '%' : '0%';
    count.textContent  = `${catDone}/${catTotal}`;
  }

  todayCountEl.textContent = `${getTodayCount()}개`;
}

// ── Build item (no event listeners — handled by delegation) ──
function buildItem(todo) {
  const li = document.createElement('li');
  li.className = 'todo-item'
    + (todo.completed     ? ' completed' : '')
    + (todo.id === newlyAddedId ? ' fade-in'   : '');
  li.dataset.id  = todo.id;
  li.draggable   = true;

  const checkbox = document.createElement('input');
  checkbox.type      = 'checkbox';
  checkbox.className = 'todo-checkbox';
  checkbox.checked   = todo.completed;
  checkbox.setAttribute('aria-label', '완료 체크');
  checkbox.draggable = false;

  const badge = document.createElement('span');
  badge.className   = `category-label ${CATEGORY_CLASS[todo.category]}`;
  badge.textContent = CATEGORY_LABEL[todo.category];

  const textEl = document.createElement('span');
  textEl.className   = 'todo-text';
  textEl.textContent = todo.text;

  const timeEl = document.createElement('span');
  timeEl.className   = 'todo-time';
  timeEl.textContent = getRelativeTime(todo.createdAt);

  const textWrapper = document.createElement('div');
  textWrapper.className = 'todo-text-wrapper';
  textWrapper.append(textEl, timeEl);

  const editBtn = document.createElement('button');
  editBtn.className = 'icon-btn edit-btn';
  editBtn.setAttribute('aria-label', '수정');
  editBtn.textContent = '✎';
  editBtn.draggable   = false;

  const delBtn = document.createElement('button');
  delBtn.className = 'icon-btn delete-btn';
  delBtn.setAttribute('aria-label', '삭제');
  delBtn.textContent = '🗑';
  delBtn.draggable   = false;

  const actions = document.createElement('div');
  actions.className = 'todo-actions';
  actions.append(editBtn, delBtn);

  li.append(checkbox, badge, textWrapper, actions);
  return li;
}

// ── Inline edit ──────────────────────────────────────────────
function enterEditMode(li, todo) {
  const badge       = li.querySelector('.category-label');
  const textWrapper = li.querySelector('.todo-text-wrapper');
  const actions     = li.querySelector('.todo-actions');
  if (!badge || !textWrapper || !actions) return; // already in edit mode

  const editInput = document.createElement('input');
  editInput.type      = 'text';
  editInput.className = 'edit-input';
  editInput.value     = todo.text;

  const editSelect = document.createElement('select');
  editSelect.className = 'edit-select';
  ['work', 'personal', 'study'].forEach(cat => {
    const opt       = document.createElement('option');
    opt.value       = cat;
    opt.textContent = CATEGORY_LABEL[cat];
    if (cat === todo.category) opt.selected = true;
    editSelect.appendChild(opt);
  });

  const saveBtn = document.createElement('button');
  saveBtn.className = 'icon-btn save-btn';
  saveBtn.setAttribute('aria-label', '저장');
  saveBtn.textContent = '✔';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'icon-btn cancel-btn';
  cancelBtn.setAttribute('aria-label', '취소');
  cancelBtn.textContent = '✕';

  const editActions = document.createElement('div');
  editActions.className = 'todo-actions';
  editActions.append(saveBtn, cancelBtn);

  badge.replaceWith(editSelect);
  textWrapper.replaceWith(editInput);
  actions.replaceWith(editActions);

  editInput.focus();
  editInput.select();

  function save() {
    const newText = editInput.value.trim();
    if (newText) updateTodo(todo.id, newText, editSelect.value);
    else render();
  }

  editInput.addEventListener('keydown', e => {
    if (e.key === 'Enter')  save();
    if (e.key === 'Escape') render();
  });
  saveBtn.addEventListener('click', save);
  cancelBtn.addEventListener('click', render);
}

// ── Dialogs ──────────────────────────────────────────────────
function openDeleteDialog(id) {
  dialogMode      = 'delete';
  pendingDeleteId = id;
  dialogMsg.textContent        = '이 할 일을 삭제할까요?';
  confirmDeleteBtn.textContent = '삭제';
  overlay.classList.remove('hidden');
  deleteDialog.classList.remove('hidden');
  confirmDeleteBtn.focus();
}

function openClearCompletedDialog() {
  dialogMode = 'clear-completed';
  dialogMsg.textContent        = '완료된 항목을 모두 삭제할까요?';
  confirmDeleteBtn.textContent = '삭제';
  overlay.classList.remove('hidden');
  deleteDialog.classList.remove('hidden');
  confirmDeleteBtn.focus();
}

function openImportDialog(count) {
  dialogMode = 'import';
  const hasData = todos.length > 0;
  dialogMsg.textContent = hasData
    ? `${count}개 항목을 불러옵니다. 현재 ${todos.length}개 항목은 백업 후 교체됩니다.`
    : `${count}개 항목을 불러올까요?`;
  confirmDeleteBtn.textContent = hasData ? '백업 후 가져오기' : '가져오기';
  overlay.classList.remove('hidden');
  deleteDialog.classList.remove('hidden');
  confirmDeleteBtn.focus();
}

function closeDeleteDialog() {
  pendingDeleteId   = null;
  pendingImportData = null;
  dialogMode        = null;
  overlay.classList.add('hidden');
  deleteDialog.classList.add('hidden');
}

// ── Celebration ──────────────────────────────────────────────
let celebrationTimer = null;

function showCelebration() {
  clearTimeout(celebrationTimer);
  celebration.classList.remove('hidden');
  celebrationTimer = setTimeout(() => celebration.classList.add('hidden'), 3000);
}

// ── Events ───────────────────────────────────────────────────
function handleAdd() {
  const text = todoInput.value.trim();
  if (!text) {
    errorMsg.classList.remove('hidden');
    todoInput.focus();
    clearTimeout(errorMsg._timer);
    errorMsg._timer = setTimeout(() => errorMsg.classList.add('hidden'), 2000);
    return;
  }
  errorMsg.classList.add('hidden');
  addTodo(text, categorySelect.value);
  todoInput.value    = '';
  categorySelect.value = 'personal';
  todoInput.focus();
}

// All todo-list interactions via event delegation (one listener set for all items)
function setupListEvents() {
  // Checkbox toggle
  todoList.addEventListener('change', e => {
    if (e.target.matches('.todo-checkbox')) {
      toggleTodo(e.target.closest('.todo-item').dataset.id);
    }
  });

  // Edit / delete button clicks
  todoList.addEventListener('click', e => {
    const li = e.target.closest('.todo-item');
    if (!li) return;
    const id = li.dataset.id;

    if (e.target.closest('.edit-btn')) {
      const todo = todos.find(t => t.id === id);
      if (todo) enterEditMode(li, todo);
    } else if (e.target.closest('.delete-btn')) {
      openDeleteDialog(id);
    }
  });

  // Double-click text to edit
  todoList.addEventListener('dblclick', e => {
    if (e.target.matches('.todo-text')) {
      const li   = e.target.closest('.todo-item');
      const todo = todos.find(t => t.id === li.dataset.id);
      if (todo) enterEditMode(li, todo);
    }
  });

  // Drag start
  todoList.addEventListener('dragstart', e => {
    const li = e.target.closest('.todo-item');
    if (!li || e.target.matches('input, button, select')) return;
    draggedItemId = li.dataset.id;
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', li.dataset.id);
  });

  // Drag end — clean up all visual state
  todoList.addEventListener('dragend', () => {
    todoList.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    todoList.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    draggedItemId = null;
  });

  // Drag over — highlight drop target
  todoList.addEventListener('dragover', e => {
    e.preventDefault();
    const target = e.target.closest('.todo-item');
    if (!target) return;
    todoList.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    if (target.dataset.id !== draggedItemId) target.classList.add('drag-over');
  });

  todoList.addEventListener('dragleave', e => {
    if (!todoList.contains(e.relatedTarget)) {
      todoList.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    }
  });

  // Drop
  todoList.addEventListener('drop', e => {
    e.preventDefault();
    const target = e.target.closest('.todo-item');
    todoList.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    if (target && draggedItemId) reorderTodo(draggedItemId, target.dataset.id);
  });
}

function bindEvents() {
  addBtn.addEventListener('click', handleAdd);
  todoInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleAdd(); });

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => setFilter(btn.dataset.filter));
  });

  // Sort
  document.getElementById('sort-select').addEventListener('change', e => {
    sortMode = e.target.value;
    localStorage.setItem(SORT_KEY, sortMode);
    render();
  });

  // Search (debounced 150 ms)
  const searchInput    = document.getElementById('search-input');
  const searchClearBtn = document.getElementById('search-clear');

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim();
    searchClearBtn.classList.toggle('hidden', !searchQuery);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 150);
  });

  searchClearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery       = '';
    searchClearBtn.classList.add('hidden');
    render();
    searchInput.focus();
  });

  // Clear completed
  clearCompletedBtn.addEventListener('click', openClearCompletedDialog);

  // Export / Import
  document.getElementById('export-btn').addEventListener('click', exportTodos);
  document.getElementById('import-btn').addEventListener('click', triggerImport);
  document.getElementById('import-file').addEventListener('change', handleFileSelect);

  // Dialog confirm / cancel
  confirmDeleteBtn.addEventListener('click', () => {
    if      (dialogMode === 'clear-completed') clearCompleted();
    else if (dialogMode === 'import')          applyImport();
    else if (pendingDeleteId)                  deleteTodo(pendingDeleteId);
    closeDeleteDialog();
  });
  document.getElementById('cancel-delete').addEventListener('click', closeDeleteDialog);
  overlay.addEventListener('click', closeDeleteDialog);

  // Todo list interactions (event delegation)
  setupListEvents();

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !deleteDialog.classList.contains('hidden')) {
      closeDeleteDialog();
      return;
    }
    if (e.altKey) {
      const filterMap = { '1': 'all', '2': 'work', '3': 'personal', '4': 'study' };
      if (e.key === 'n') { e.preventDefault(); todoInput.focus(); todoInput.select(); }
      else if (filterMap[e.key]) { e.preventDefault(); setFilter(filterMap[e.key]); }
    }
  });
}

// ── Start ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
