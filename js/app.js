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
const STATUS_ORDER = ['pending', 'in_progress', 'waiting', 'review', 'done'];
const STATUS_LABELS = {
  pending: null,
  in_progress: 'in corso',
  waiting: 'in attesa',
  review: 'revisione',
  done: 'fatto'
};

function nextStatus(current) {
  if (current === 'done') return 'pending';
  const idx = STATUS_ORDER.indexOf(current);
  return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
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
            data-id="${w.id}">${escapeHtml(w.name)}</button>
  `).join('');

  container.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.id !== state.activeWorkspaceId) setActiveWorkspace(btn.dataset.id);
    });
    btn.addEventListener('dblclick', () => renameWorkspace(btn.dataset.id));
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
  const regular = lists.filter(l => !l.is_dump);

  container.innerHTML = '';

  if (dump) container.appendChild(renderCard(dump));

  if (regular.length) {
    const grid = document.createElement('div');
    grid.className = 'cards-grid';
    regular.forEach(l => grid.appendChild(renderCard(l)));
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
  card.className = `card${list.is_dump ? ' dump' : ''}`;
  card.dataset.listId = list.id;
  if (!list.is_dump) card.dataset.cols = list.width_cols;

  card.innerHTML = `
    <div class="card-header">
      <input class="card-title" value="${escapeHtml(list.name)}" data-list-id="${list.id}">
      <button class="card-menu" data-list-id="${list.id}" title="Elimina lista">⋯</button>
    </div>
    ${tasks.length ? `<div class="progress-text">${done}/${tasks.length} completati</div>` : ''}
    <div class="task-list" data-list-id="${list.id}">
      ${tasks.map(t => renderTaskHtml(t)).join('')}
    </div>
    <div class="add-task-row">
      <span style="color:#ccc;font-size:13px;flex-shrink:0">+</span>
      <input class="add-task-input" placeholder="Aggiungi task…" data-list-id="${list.id}">
    </div>
    ${!list.is_dump ? `<div class="resize-handle" data-list-id="${list.id}"></div>` : ''}
  `;

  bindCardEvents(card, list);
  return card;
}

function renderTaskHtml(task) {
  const hasStatus = task.status !== 'pending';
  const tagClass = hasStatus ? `tag-${task.status}` : 'tag-empty';
  const tagLabel = hasStatus ? STATUS_LABELS[task.status] : '···';
  return `
    <div class="task-item ${task.status === 'done' ? 'done' : ''}"
         draggable="true" data-task-id="${task.id}" data-list-id="${task.list_id}">
      <input type="checkbox" ${task.status === 'done' ? 'checked' : ''} data-task-id="${task.id}">
      <span class="task-text" contenteditable="true"
            data-task-id="${task.id}">${escapeHtml(task.text)}</span>
      <span class="tag ${tagClass}" data-task-id="${task.id}">${tagLabel}</span>
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

  // Delete list
  card.querySelector('.card-menu').addEventListener('click', async () => {
    if (!confirm(`Eliminare la lista "${list.name}"?`)) return;
    await deleteList(list.id);
    state.lists = state.lists.filter(l => l.id !== list.id);
    state.tasks = state.tasks.filter(t => t.list_id !== list.id);
    renderWorkspace();
  });

  // Add task on Enter
  const addInput = card.querySelector('.add-task-input');
  addInput.addEventListener('keydown', async e => {
    if (e.key !== 'Enter' || !addInput.value.trim()) return;
    const text = addInput.value.trim();
    addInput.value = '';
    const pos = state.tasks.filter(t => t.list_id === list.id).length;
    const task = await createTask(list.id, text, pos);
    state.tasks.push(task);
    renderWorkspace();
  });

  // Checkbox toggle
  card.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', async () => {
      const task = state.tasks.find(t => t.id === cb.dataset.taskId);
      if (!task) return;
      task.status = cb.checked ? 'done' : 'pending';
      await updateTask(task.id, { status: task.status });
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

  // Resize handle
  const handle = card.querySelector('.resize-handle');
  if (handle) bindResizeHandle(handle, card, list);

  // Drag & drop
  bindDragDrop(card);
}

// ── Workspace management ──
async function setActiveWorkspace(id) {
  state.activeWorkspaceId = id;
  state.lists = await fetchLists(id);
  const listIds = state.lists.map(l => l.id);
  state.tasks = listIds.length ? await fetchTasks(listIds) : [];

  if (!state.lists.find(l => l.is_dump)) {
    const dump = await createList(id, 'Vario', 0, true);
    state.lists.unshift(dump);
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

function bindGlobalEvents() {
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

  taskList.addEventListener('dragover', e => {
    e.preventDefault();
    document.querySelectorAll('.task-item.drag-over-top').forEach(el => el.classList.remove('drag-over-top'));
    const after = getDragAfterElement(taskList, e.clientY);
    if (after) after.classList.add('drag-over-top');
  });

  taskList.addEventListener('dragleave', () => {
    document.querySelectorAll('.task-item.drag-over-top').forEach(el => el.classList.remove('drag-over-top'));
  });

  taskList.addEventListener('drop', async e => {
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
  if (eventType === 'INSERT') {
    if (!state.workspaces.find(w => w.id === rec.id)) state.workspaces.push(rec);
  } else if (eventType === 'UPDATE') {
    const idx = state.workspaces.findIndex(w => w.id === rec.id);
    if (idx !== -1) state.workspaces[idx] = rec;
  } else if (eventType === 'DELETE') {
    state.workspaces = state.workspaces.filter(w => w.id !== old.id);
    if (state.activeWorkspaceId === old.id) {
      state.activeWorkspaceId = state.workspaces[0]?.id ?? null;
    }
  }
  renderTabs();
  renderWorkspace();
}

function handleRealtimeList({ eventType, new: rec, old }) {
  if (eventType === 'INSERT') {
    if (!state.lists.find(l => l.id === rec.id)) state.lists.push(rec);
  } else if (eventType === 'UPDATE') {
    const idx = state.lists.findIndex(l => l.id === rec.id);
    if (idx !== -1) state.lists[idx] = rec;
  } else if (eventType === 'DELETE') {
    state.lists = state.lists.filter(l => l.id !== old.id);
    state.tasks = state.tasks.filter(t => t.list_id !== old.id);
  }
  renderWorkspace();
}

function handleRealtimeTask({ eventType, new: rec, old }) {
  if (eventType === 'INSERT') {
    if (!state.tasks.find(t => t.id === rec.id)) state.tasks.push(rec);
  } else if (eventType === 'UPDATE') {
    const idx = state.tasks.findIndex(t => t.id === rec.id);
    if (idx !== -1) state.tasks[idx] = rec;
  } else if (eventType === 'DELETE') {
    state.tasks = state.tasks.filter(t => t.id !== old.id);
  }
  renderWorkspace();
}

// ── Init ──
async function init() {
  state.workspaces = await fetchWorkspaces();
  if (!state.workspaces.length) {
    const ws = await createWorkspace('Lista', 0);
    state.workspaces.push(ws);
  }
  bindGlobalEvents();
  subscribeToChanges(handleRealtimeWorkspace, handleRealtimeList, handleRealtimeTask);
  await setActiveWorkspace(state.workspaces[0].id);
}

init();
