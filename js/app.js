import {
  fetchWorkspaces, createWorkspace, updateWorkspace, deleteWorkspace,
  fetchLists, createList, updateList, deleteList,
  fetchTasks, createTask, updateTask, deleteTask,
  subscribeToChanges
} from './db.js';

const state = {
  workspaces: [],
  lists: [],
  tasks: [],
  activeWorkspaceId: null
};

const $ = id => document.getElementById(id);

// ── Status ──
const STATUS_LABELS = {
  pending: null,
  in_progress: 'in corso',
  waiting: 'in attesa',
  review: 'revisione',
  paused: 'in pausa',
  done: 'fatto'
};

const TAG_CYCLE = ['in_progress', 'waiting', 'review', 'paused'];

function nextStatus(current) {
  if (current === 'pending' || current === 'done') return 'in_progress';
  const idx = TAG_CYCLE.indexOf(current);
  return TAG_CYCLE[(idx + 1) % TAG_CYCLE.length];
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Render tabs ──
function renderTabs() {
  const container = $('tabs');
  container.innerHTML = state.workspaces.map(w => `
    <button class="tab ${w.id === state.activeWorkspaceId ? 'active' : ''}"
            data-id="${w.id}">
      ${escapeHtml(w.name)}
      <span class="tab-close" data-id="${w.id}" title="Elimina workspace">×</span>
    </button>
  `).join('');

  container.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', e => {
      if (e.target.classList.contains('tab-close')) return;
      if (btn.dataset.id !== state.activeWorkspaceId) setActiveWorkspace(btn.dataset.id);
    });
    btn.addEventListener('dblclick', e => {
      if (e.target.classList.contains('tab-close')) return;
      renameWorkspace(btn.dataset.id);
    });
  });

  container.querySelectorAll('.tab-close').forEach(x => {
    x.addEventListener('click', async e => {
      e.stopPropagation();
      const id = x.dataset.id;
      if (state.workspaces.length === 1) { alert('Non puoi eliminare l\'unico workspace.'); return; }
      const ws = state.workspaces.find(w => w.id === id);
      if (!confirm(`Eliminare il workspace "${ws.name}" e tutte le sue liste?`)) return;
      await deleteWorkspace(id);
      state.workspaces = state.workspaces.filter(w => w.id !== id);
      if (state.activeWorkspaceId === id) {
        await setActiveWorkspace(state.workspaces[0].id);
      } else {
        renderTabs();
      }
    });
  });

  const active = state.workspaces.find(w => w.id === state.activeWorkspaceId);
  $('workspace-title').textContent = active ? active.name : '';
}

// ── Render workspace ──
function renderWorkspace() {
  const container = $('workspace');
  if (!state.activeWorkspaceId) { container.innerHTML = ''; return; }

  const lists = state.lists
    .filter(l => l.workspace_id === state.activeWorkspaceId)
    .sort((a, b) => a.position - b.position);

  const dump = lists.find(l => l.is_dump);
  const completati = lists.find(l => l.is_completed);
  const regular = lists.filter(l => !l.is_dump && !l.is_completed);

  container.innerHTML = '';

  if (dump) container.appendChild(renderCard(dump));

  const hasCompletati = completati && state.tasks.some(t => t.list_id === completati.id);

  if (regular.length || hasCompletati) {
    const grid = document.createElement('div');
    grid.className = 'cards-grid';
    regular.forEach(l => grid.appendChild(renderCard(l)));
    if (hasCompletati) grid.appendChild(renderCard(completati));
    bindGridDrag(grid);
    container.appendChild(grid);
  } else if (!dump) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Nessuna lista. Clicca "+ Nuova lista" per iniziare.';
    container.appendChild(empty);
  }
}

// ── Render single card ──
function renderCard(list) {
  const tasks = state.tasks
    .filter(t => t.list_id === list.id)
    .sort((a, b) => a.position - b.position);

  const done = tasks.filter(t => t.status === 'done').length;

  const card = document.createElement('div');
  card.className = `card${list.is_dump ? ' dump' : ''}${list.is_completed ? ' completati' : ''}`;
  card.dataset.listId = list.id;
  if (!list.is_dump) card.dataset.cols = getListWidth(list.id);

  const collapsed = getCollapsedIds().has(list.id);
  if (collapsed) card.classList.add('collapsed');

  card.innerHTML = `
    <div class="card-header">
      ${!list.is_dump && !list.is_completed ? `<span class="card-drag-handle" draggable="true" title="Sposta lista">⠿</span>` : ''}
      <input class="card-title" value="${escapeHtml(list.name)}" data-list-id="${list.id}"${list.is_completed ? ' readonly' : ''}>
      <button class="card-toggle" title="Comprimi/espandi">❯</button>
      ${!list.is_dump ? `<button class="card-width-btn" title="Cambia larghezza (1-4 colonne)">${getListWidth(list.id)}</button>` : ''}
      ${!list.is_completed ? `<button class="card-menu" data-list-id="${list.id}" title="Elimina lista">⋯</button>` : ''}
    </div>
    ${tasks.length ? `<div class="progress-text">${done}/${tasks.length} completati</div>` : ''}
    <div class="task-list" data-list-id="${list.id}">
      ${tasks.map(t => renderTaskHtml(t, !list.is_completed)).join('')}
    </div>
    ${!list.is_completed ? `
    <div class="add-task-row">
      <span style="color:#ccc;font-size:13px;flex-shrink:0">+</span>
      <input class="add-task-input" placeholder="Aggiungi task…" data-list-id="${list.id}">
    </div>` : ''}
  `;

  bindCardEvents(card, list);
  return card;
}

function renderTaskHtml(task, draggable = true) {
  const hasStatus = task.status !== 'pending' && task.status !== 'done';
  const tagClass = hasStatus ? `tag-${task.status}` : 'tag-empty';
  const tagLabel = hasStatus ? STATUS_LABELS[task.status] : '···';
  return `
    <div class="task-item ${task.status === 'done' ? 'done' : ''}"
         ${draggable ? 'draggable="true"' : ''} data-task-id="${task.id}" data-list-id="${task.list_id}">
      <input type="checkbox" ${task.status === 'done' ? 'checked' : ''} data-task-id="${task.id}">
      <span class="task-text" contenteditable="${draggable}"
            data-task-id="${task.id}">${escapeHtml(task.text)}</span>
      ${draggable ? `<span class="tag ${tagClass}" data-task-id="${task.id}">${tagLabel}</span>` : ''}
      <button class="task-delete" data-task-id="${task.id}" title="Elimina task">×</button>
    </div>
  `;
}

// ── Card event binding ──
function bindCardEvents(card, list) {
  // Rename list
  const titleInput = card.querySelector('.card-title');
  titleInput.addEventListener('blur', () => {
    const newName = titleInput.value.trim();
    if (newName && newName !== list.name) {
      list.name = newName;
      updateList(list.id, { name: newName });
      if (list.is_dump) {} // title stays in card only
    }
  });
  titleInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') titleInput.blur();
  });

  // Collapse/expand toggle
  card.querySelector('.card-toggle').addEventListener('click', () => {
    const isCollapsed = card.classList.toggle('collapsed');
    setCollapsed(list.id, isCollapsed);
  });

  // Delete list
  const menuBtn = card.querySelector('.card-menu');
  if (menuBtn) {
    menuBtn.addEventListener('click', async () => {
      if (!confirm(`Eliminare la lista "${list.name}"?`)) return;
      await deleteList(list.id);
      state.lists = state.lists.filter(l => l.id !== list.id);
      state.tasks = state.tasks.filter(t => t.list_id !== list.id);
      renderWorkspace();
    });
  }

  // Add task on Enter
  const addInput = card.querySelector('.add-task-input');
  if (addInput) {
    addInput.addEventListener('keydown', async e => {
      if (e.key !== 'Enter' || !addInput.value.trim()) return;
      const text = addInput.value.trim();
      addInput.value = '';
      const pos = state.tasks.filter(t => t.list_id === list.id).length;
      const task = await createTask(list.id, text, pos);
      state.tasks.push(task);
      renderWorkspace();
    });
  }

  // Checkbox toggle
  card.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', async () => {
      const task = state.tasks.find(t => t.id === cb.dataset.taskId);
      if (!task) return;
      const completatiList = state.lists.find(l => l.workspace_id === state.activeWorkspaceId && l.is_completed);
      if (cb.checked) {
        if (completatiList && task.list_id !== completatiList.id) {
          const originalListId = task.list_id;
          saveTaskStatus(task.id, task.status);
          task.original_list_id = originalListId;
          task.list_id = completatiList.id;
          task.status = 'done';
          await updateTask(task.id, { status: 'done', list_id: completatiList.id, original_list_id: originalListId });
        } else {
          task.status = 'done';
          await updateTask(task.id, { status: 'done' });
        }
      } else {
        if (completatiList && task.list_id === completatiList.id) {
          const dumpList = state.lists.find(l => l.workspace_id === state.activeWorkspaceId && l.is_dump);
          const targetListId = task.original_list_id || dumpList?.id || task.list_id;
          const restoredStatus = getTaskStatus(task.id);
          clearTaskStatus(task.id);
          task.list_id = targetListId;
          task.status = restoredStatus;
          task.original_list_id = null;
          await updateTask(task.id, { status: restoredStatus, list_id: targetListId, original_list_id: null });
        } else {
          task.status = 'pending';
          await updateTask(task.id, { status: 'pending' });
        }
      }
      renderWorkspace();
    });
  });

  // Status tag click → cycle (skip done — use checkbox for that)
  card.querySelectorAll('.tag[data-task-id]').forEach(tag => {
    tag.addEventListener('click', async e => {
      e.stopPropagation();
      const task = state.tasks.find(t => t.id === tag.dataset.taskId);
      if (!task) return;
      if (task.status === 'done') return;
      task.status = nextStatus(task.status);
      await updateTask(task.id, { status: task.status });
      renderWorkspace();
    });
  });

  // Delete task
  card.querySelectorAll('.task-delete').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = btn.dataset.taskId;
      await deleteTask(id);
      state.tasks = state.tasks.filter(t => t.id !== id);
      renderWorkspace();
    });
  });

  // Edit task text inline
  card.querySelectorAll('.task-text[contenteditable]').forEach(span => {
    span.addEventListener('blur', async () => {
      const task = state.tasks.find(t => t.id === span.dataset.taskId);
      if (!task) return;
      const newText = span.textContent.trim();
      if (newText && newText !== task.text) {
        task.text = newText;
        await updateTask(task.id, { text: newText });
      } else if (!newText) {
        span.textContent = task.text;
      }
    });
    span.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); span.blur(); }
      if (e.key === 'Escape') { span.textContent = state.tasks.find(t => t.id === span.dataset.taskId)?.text || ''; span.blur(); }
    });
  });

  // Width button — cycles 1→2→3→4→1
  const widthBtn = card.querySelector('.card-width-btn');
  if (widthBtn) {
    widthBtn.addEventListener('click', () => {
      const next = (getListWidth(list.id) % 4) + 1;
      setListWidth(list.id, next);
      card.dataset.cols = next;
      widthBtn.textContent = next;
    });
  }

  // Card drag (header only, non-dump/non-completed)
  if (!list.is_dump && !list.is_completed) bindCardDrag(card, list);

  // Resize handle
  const handle = card.querySelector('.resize-handle');
  if (handle) bindResizeHandle(handle, card, list);

  // Drag & drop (not for completati — tasks managed via checkbox only)
  if (!list.is_completed) bindDragDrop(card);
}

// ── Workspace management ──
async function setActiveWorkspace(id) {
  state.activeWorkspaceId = id;
  state.lists = await fetchLists(id);
  const listIds = state.lists.map(l => l.id);
  state.tasks = listIds.length ? await fetchTasks(listIds) : [];

  if (!state.lists.find(l => l.is_dump)) {
    const dump = await createList(id, 'Vario', 0, true, false);
    state.lists.unshift(dump);
  }

  if (!state.lists.find(l => l.is_completed)) {
    const completati = await createList(id, 'Completati', 999, false, true);
    state.lists.push(completati);
  }

  renderTabs();
  renderWorkspace();
}

function renameWorkspace(id) {
  const ws = state.workspaces.find(w => w.id === id);
  const newName = prompt('Rinomina workspace:', ws.name);
  if (!newName || newName === ws.name) return;
  ws.name = newName;
  updateWorkspace(id, { name: newName });
  renderTabs();
}

function getCollapsedIds() {
  return new Set(JSON.parse(localStorage.getItem('collapsed-lists') || '[]'));
}
function setCollapsed(id, collapsed) {
  const ids = getCollapsedIds();
  if (collapsed) ids.add(id); else ids.delete(id);
  localStorage.setItem('collapsed-lists', JSON.stringify([...ids]));
}

function getListWidth(listId) {
  return JSON.parse(localStorage.getItem('list-widths') || '{}')[listId] || 1;
}
function setListWidth(listId, cols) {
  const widths = JSON.parse(localStorage.getItem('list-widths') || '{}');
  widths[listId] = cols;
  localStorage.setItem('list-widths', JSON.stringify(widths));
}

function saveTaskStatus(taskId, status) {
  const s = JSON.parse(localStorage.getItem('task-original-status') || '{}');
  s[taskId] = status;
  localStorage.setItem('task-original-status', JSON.stringify(s));
}
function getTaskStatus(taskId) {
  return JSON.parse(localStorage.getItem('task-original-status') || '{}')[taskId] || 'pending';
}
function clearTaskStatus(taskId) {
  const s = JSON.parse(localStorage.getItem('task-original-status') || '{}');
  delete s[taskId];
  localStorage.setItem('task-original-status', JSON.stringify(s));
}

function applyBgColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const darker = `rgb(${Math.max(0,r-12)},${Math.max(0,g-11)},${Math.max(0,b-9)})`;
  document.documentElement.style.setProperty('--bg', hex);
  document.documentElement.style.setProperty('--bg-tabs', darker);
}

function bindGlobalEvents() {
  const colorInput = $('input-bg-color');
  const savedColor = localStorage.getItem('bg-color') || '#f0ebe0';
  colorInput.value = savedColor;
  applyBgColor(savedColor);

  colorInput.addEventListener('input', () => {
    applyBgColor(colorInput.value);
    localStorage.setItem('bg-color', colorInput.value);
  });

  $('btn-add-workspace').addEventListener('click', async () => {
    const name = prompt('Nome del nuovo workspace:');
    if (!name) return;
    const pos = state.workspaces.length;
    const ws = await createWorkspace(name, pos);
    state.workspaces.push(ws);
    await setActiveWorkspace(ws.id);
  });

  $('btn-add-list').addEventListener('click', async () => {
    if (!state.activeWorkspaceId) return;
    const name = prompt('Nome della nuova lista:');
    if (!name) return;
    const regular = state.lists.filter(l => !l.is_dump);
    const pos = regular.length;
    const list = await createList(state.activeWorkspaceId, name, pos);
    state.lists.push(list);
    renderWorkspace();
  });
}

// ── Drag & drop ──
let draggedTaskId = null;
let draggedListId = null;

function bindDragDrop(card) {
  const taskList = card.querySelector('.task-list');

  card.querySelectorAll('.task-item').forEach(item => {
    item.addEventListener('dragstart', e => {
      draggedTaskId = item.dataset.taskId;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      document.querySelectorAll('.task-item.drag-over-top').forEach(el => el.classList.remove('drag-over-top'));
    });
  });

  card.addEventListener('dragover', e => {
    if (draggedListId) return;
    e.preventDefault();
    document.querySelectorAll('.task-item.drag-over-top').forEach(el => el.classList.remove('drag-over-top'));
    const after = getDragAfterElement(taskList, e.clientY);
    if (after) after.classList.add('drag-over-top');
  });

  card.addEventListener('dragleave', e => {
    if (draggedListId) return;
    if (!card.contains(e.relatedTarget)) {
      document.querySelectorAll('.task-item.drag-over-top').forEach(el => el.classList.remove('drag-over-top'));
    }
  });

  card.addEventListener('drop', async e => {
    if (draggedListId) return;
    e.preventDefault();
    document.querySelectorAll('.task-item.drag-over-top').forEach(el => el.classList.remove('drag-over-top'));
    if (!draggedTaskId) return;

    const newListId = taskList.dataset.listId;
    const task = state.tasks.find(t => t.id === draggedTaskId);
    if (!task) return;

    const dragging = document.querySelector('.task-item.dragging');
    if (!dragging) return;
    const after = getDragAfterElement(taskList, e.clientY);
    if (!after) taskList.appendChild(dragging);
    else taskList.insertBefore(dragging, after);

    task.list_id = newListId;
    const items = [...taskList.querySelectorAll('.task-item')];
    const updates = items.map((el, i) => {
      const t = state.tasks.find(t => t.id === el.dataset.taskId);
      if (t) { t.position = i; t.list_id = newListId; }
      return { id: el.dataset.taskId, list_id: newListId, position: i };
    });

    await Promise.all(updates.map(u => updateTask(u.id, { list_id: u.list_id, position: u.position })));
    renderWorkspace();
  });
}

function getDragAfterElement(container, y) {
  const draggable = [...container.querySelectorAll('.task-item:not(.dragging)')];
  return draggable.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// ── Card drag & drop (reorder lists) ──
function bindCardDrag(card, list) {
  const handle = card.querySelector('.card-drag-handle');
  if (!handle) return;

  handle.addEventListener('dragstart', e => {
    e.stopPropagation();
    draggedListId = list.id;
    draggedTaskId = null;
    card.classList.add('card-dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  handle.addEventListener('dragend', () => {
    card.classList.remove('card-dragging');
    document.querySelectorAll('.card.card-drag-over').forEach(el => el.classList.remove('card-drag-over'));
    draggedListId = null;
  });
}

function bindGridDrag(grid) {
  grid.addEventListener('dragover', e => {
    if (!draggedListId) return;
    e.preventDefault();
    const target = e.target.closest('.card');
    document.querySelectorAll('.card.card-drag-over').forEach(el => el.classList.remove('card-drag-over'));
    if (target && target.dataset.listId !== draggedListId) target.classList.add('card-drag-over');
  });

  grid.addEventListener('dragleave', e => {
    if (!grid.contains(e.relatedTarget)) {
      document.querySelectorAll('.card.card-drag-over').forEach(el => el.classList.remove('card-drag-over'));
    }
  });

  grid.addEventListener('drop', async e => {
    if (!draggedListId) return;
    e.preventDefault();
    document.querySelectorAll('.card.card-drag-over').forEach(el => el.classList.remove('card-drag-over'));

    const targetCard = e.target.closest('.card');
    if (!targetCard || targetCard.dataset.listId === draggedListId) return;

    const regular = state.lists.filter(l => !l.is_dump && !l.is_completed).sort((a, b) => a.position - b.position);
    const fromIdx = regular.findIndex(l => l.id === draggedListId);
    const toIdx = regular.findIndex(l => l.id === targetCard.dataset.listId);
    if (fromIdx === -1 || toIdx === -1) return;

    const [moved] = regular.splice(fromIdx, 1);
    regular.splice(toIdx, 0, moved);
    await Promise.all(regular.map((l, i) => { l.position = i; return updateList(l.id, { position: i }); }));
    renderWorkspace();
  });
}

// ── Card resize ──
function bindResizeHandle(handle, card, list) {
  let startX = 0;
  let startCols = list.width_cols;

  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    startX = e.clientX;
    startCols = list.width_cols;

    const onMove = e => {
      const grid = card.parentElement;
      if (!grid) return;
      const gridWidth = grid.offsetWidth;
      const colWidth = gridWidth / 4;
      const delta = e.clientX - startX;
      const newCols = Math.min(4, Math.max(1, Math.round(startCols + delta / colWidth)));
      if (newCols !== list.width_cols) {
        list.width_cols = newCols;
        card.dataset.cols = newCols;
      }
    };

    const onUp = async () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      await updateList(list.id, { width_cols: list.width_cols });
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ── Realtime handlers ──
function handleRealtimeWorkspace({ eventType, new: rec, old }) {
  let changed = false;
  if (eventType === 'INSERT') {
    if (!state.workspaces.find(w => w.id === rec.id)) { state.workspaces.push(rec); changed = true; }
  } else if (eventType === 'UPDATE') {
    const idx = state.workspaces.findIndex(w => w.id === rec.id);
    if (idx !== -1) { state.workspaces[idx] = rec; changed = true; }
  } else if (eventType === 'DELETE') {
    state.workspaces = state.workspaces.filter(w => w.id !== old.id);
    if (state.activeWorkspaceId === old.id) state.activeWorkspaceId = state.workspaces[0]?.id ?? null;
    changed = true;
  }
  if (changed) { renderTabs(); renderWorkspace(); }
}

function handleRealtimeList({ eventType, new: rec, old }) {
  let changed = false;
  if (eventType === 'INSERT') {
    if (!state.lists.find(l => l.id === rec.id)) { state.lists.push(rec); changed = true; }
  } else if (eventType === 'UPDATE') {
    const idx = state.lists.findIndex(l => l.id === rec.id);
    if (idx !== -1) { state.lists[idx] = rec; changed = true; }
  } else if (eventType === 'DELETE') {
    state.lists = state.lists.filter(l => l.id !== old.id);
    state.tasks = state.tasks.filter(t => t.list_id !== old.id);
    changed = true;
  }
  if (changed) renderWorkspace();
}

function handleRealtimeTask({ eventType, new: rec, old }) {
  let changed = false;
  if (eventType === 'INSERT') {
    if (!state.tasks.find(t => t.id === rec.id)) { state.tasks.push(rec); changed = true; }
  } else if (eventType === 'UPDATE') {
    const idx = state.tasks.findIndex(t => t.id === rec.id);
    if (idx !== -1) { state.tasks[idx] = rec; changed = true; }
  } else if (eventType === 'DELETE') {
    const before = state.tasks.length;
    state.tasks = state.tasks.filter(t => t.id !== old.id);
    changed = state.tasks.length !== before;
  }
  if (changed) renderWorkspace();
}

// ── Init ──
async function init() {
  const loading = $('loading');
  state.workspaces = await fetchWorkspaces();
  if (!state.workspaces.length) {
    const ws = await createWorkspace('Lista', 0);
    state.workspaces.push(ws);
  }
  bindGlobalEvents();
  subscribeToChanges(handleRealtimeWorkspace, handleRealtimeList, handleRealtimeTask);
  await setActiveWorkspace(state.workspaces[0].id);
  loading.classList.add('hidden');
}

init();
