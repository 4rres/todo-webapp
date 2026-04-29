# Todo Webapp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight personal todo webapp (Walling-inspired) with workspaces, resizable card grid, drag & drop, and Supabase realtime sync — hosted on Netlify.

**Architecture:** Vanilla JS single-page app with no build step. All state fetched from Supabase on load, then kept in-sync via Supabase Realtime subscriptions. HTML5 drag & drop API for task reordering. CSS grid for the 4-column card layout.

**Tech Stack:** HTML5 · CSS3 (grid, custom properties) · Vanilla JS (ES modules via CDN) · Supabase JS v2 (CDN) · Netlify (static hosting)

---

## File Structure

```
webapp/
├── index.html          ← app shell, loads CSS + JS modules
├── css/
│   └── style.css       ← all styles: theme, tabs, grid, cards, checkboxes, drag states
├── js/
│   ├── db.js           ← supabase client + all CRUD + realtime subscriptions
│   └── app.js          ← state object, render functions, event handlers, drag & drop
├── netlify.toml        ← redirect rule (SPA fallback)
└── docs/
    └── superpowers/
        ├── specs/2026-04-29-todo-webapp-design.md
        └── plans/2026-04-29-todo-webapp.md
```

---

## Task 1: Supabase project + schema

**Files:**
- No files — manual steps in Supabase dashboard

- [ ] **Step 1: Create Supabase project**

  Go to https://supabase.com → New project. Name it `todo-webapp`. Note down:
  - Project URL: `https://xxxx.supabase.co`
  - Anon public key (Settings → API)

- [ ] **Step 2: Run schema SQL**

  In Supabase → SQL Editor, run:

  ```sql
  create table workspaces (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    position integer not null default 0,
    created_at timestamptz default now()
  );

  create table lists (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid references workspaces(id) on delete cascade,
    name text not null,
    position integer not null default 0,
    is_dump boolean not null default false,
    width_cols integer not null default 1,
    created_at timestamptz default now(),
    constraint width_cols_range check (width_cols between 1 and 4)
  );

  create table tasks (
    id uuid primary key default gen_random_uuid(),
    list_id uuid references lists(id) on delete cascade,
    text text not null,
    status text not null default 'pending',
    position integer not null default 0,
    created_at timestamptz default now(),
    constraint status_values check (status in ('pending','in_progress','waiting','review','done'))
  );
  ```

- [ ] **Step 3: Disable RLS on all three tables (personal app, no auth needed)**

  ```sql
  alter table workspaces disable row level security;
  alter table lists disable row level security;
  alter table tasks disable row level security;
  ```

- [ ] **Step 4: Insert a default workspace**

  ```sql
  insert into workspaces (name, position) values ('Lista', 0);
  ```

  Note the returned UUID — you'll use it to verify the app loads correctly.

- [ ] **Step 5: Verify tables exist**

  In Supabase → Table Editor, confirm `workspaces`, `lists`, `tasks` are visible.

---

## Task 2: Project scaffolding

**Files:**
- Create: `index.html`
- Create: `css/style.css` (empty)
- Create: `js/db.js` (empty)
- Create: `js/app.js` (empty)
- Create: `netlify.toml`

- [ ] **Step 1: Create directory structure**

  ```bash
  cd /Users/mic/Downloads/webapp
  mkdir -p css js
  ```

- [ ] **Step 2: Create `netlify.toml`**

  ```toml
  [[redirects]]
    from = "/*"
    to = "/index.html"
    status = 200
  ```

- [ ] **Step 3: Create `index.html`**

  Replace `SUPABASE_URL` and `SUPABASE_ANON_KEY` with your values from Task 1 Step 1.

  ```html
  <!DOCTYPE html>
  <html lang="it">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Todo</title>
    <link rel="stylesheet" href="css/style.css">
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
  </head>
  <body>
    <div id="app">
      <div class="tabs-bar">
        <div id="tabs" class="tabs"></div>
        <button id="btn-add-workspace" class="tab-add" title="Nuovo workspace">+</button>
      </div>
      <div class="toolbar">
        <span id="workspace-title" class="workspace-title"></span>
        <button id="btn-add-list" class="btn-new">+ Nuova lista</button>
      </div>
      <div id="workspace" class="workspace"></div>
    </div>

    <script>
      window.SUPABASE_URL = 'SUPABASE_URL';
      window.SUPABASE_ANON_KEY = 'SUPABASE_ANON_KEY';
    </script>
    <script type="module" src="js/app.js"></script>
  </body>
  </html>
  ```

- [ ] **Step 4: Create empty `css/style.css`, `js/db.js`, `js/app.js`**

  ```bash
  touch css/style.css js/db.js js/app.js
  ```

- [ ] **Step 5: Open in browser to verify no errors**

  ```bash
  open index.html
  ```

  Expected: blank page, no console errors (Supabase script loads).

- [ ] **Step 6: Commit**

  ```bash
  git init
  git add .
  git commit -m "feat: initial project scaffold"
  ```

---

## Task 3: CSS — theme, tabs, toolbar, grid

**Files:**
- Modify: `css/style.css`

- [ ] **Step 1: Write full CSS**

  ```css
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #f0ebe0;
    --bg-tabs: #e5e0d5;
    --card-bg: #ffffff;
    --border: #ddd8cc;
    --text: #2a2a2a;
    --text-muted: #888;
    --shadow: 0 1px 4px rgba(0,0,0,0.07);
    --radius: 10px;
    --tag-progress-bg: #dbeafe; --tag-progress-fg: #2563eb;
    --tag-waiting-bg: #fef3c7;  --tag-waiting-fg: #d97706;
    --tag-review-bg: #ede9fe;   --tag-review-fg: #7c3aed;
    --tag-done-bg: #d1fae5;     --tag-done-fg: #059669;
  }

  body {
    background: var(--bg);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: var(--text);
    min-height: 100vh;
  }

  /* ── Tabs ── */
  .tabs-bar {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    padding: 10px 16px 0;
    background: var(--bg-tabs);
    border-bottom: 1px solid var(--border);
  }
  .tab {
    padding: 6px 14px;
    border-radius: 7px 7px 0 0;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    background: transparent;
    color: var(--text-muted);
    border: none;
    outline: none;
    transition: background 120ms ease, color 120ms ease;
    user-select: none;
  }
  .tab:hover { color: var(--text); }
  .tab.active { background: var(--bg); color: var(--text); }
  .tab-add {
    padding: 6px 10px;
    font-size: 18px;
    color: var(--text-muted);
    background: none;
    border: none;
    cursor: pointer;
    line-height: 1;
    margin-bottom: 2px;
  }
  .tab-add:hover { color: var(--text); }

  /* ── Toolbar ── */
  .toolbar {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    gap: 12px;
  }
  .workspace-title {
    flex: 1;
    text-align: center;
    font-size: 17px;
    font-weight: 600;
  }
  .btn-new {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 5px 12px;
    font-size: 13px;
    color: #555;
    cursor: pointer;
    white-space: nowrap;
  }
  .btn-new:hover { background: #f8f5ee; }

  /* ── Workspace ── */
  .workspace {
    padding: 0 16px 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* ── Cards grid ── */
  .cards-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    align-items: start;
  }

  /* ── Card ── */
  .card {
    background: var(--card-bg);
    border-radius: var(--radius);
    padding: 14px;
    box-shadow: var(--shadow);
    position: relative;
    transition: box-shadow 120ms ease;
  }
  .card.dump { width: 100%; }
  .card[data-cols="2"] { grid-column: span 2; }
  .card[data-cols="3"] { grid-column: span 3; }
  .card[data-cols="4"] { grid-column: span 4; }

  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }
  .card-title {
    font-weight: 600;
    font-size: 14px;
    flex: 1;
    cursor: text;
    outline: none;
    border: none;
    background: transparent;
    color: var(--text);
    font-family: inherit;
  }
  .card-title:focus {
    background: #f8f5ee;
    border-radius: 4px;
    padding: 1px 4px;
  }
  .card-menu {
    opacity: 0;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 16px;
    color: var(--text-muted);
    padding: 2px 5px;
    border-radius: 4px;
    transition: opacity 100ms;
  }
  .card:hover .card-menu { opacity: 1; }
  .card-menu:hover { background: #f0ebe0; }

  /* ── Task items ── */
  .task-list { display: flex; flex-direction: column; gap: 2px; }

  .task-item {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 4px 0;
    font-size: 13px;
    color: #444;
    cursor: grab;
    border-radius: 5px;
    transition: background 100ms;
  }
  .task-item:hover { background: #faf8f4; }
  .task-item.dragging { opacity: 0.4; cursor: grabbing; }
  .task-item.drag-over { background: #f0ebe0; }

  .task-item input[type="checkbox"] {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    cursor: pointer;
    accent-color: #7c6f5c;
  }
  .task-text {
    flex: 1;
    outline: none;
    cursor: text;
  }
  .task-item.done .task-text {
    text-decoration: line-through;
    color: #bbb;
  }

  /* ── Status tags ── */
  .tag {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 8px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    user-select: none;
  }
  .tag-in_progress { background: var(--tag-progress-bg); color: var(--tag-progress-fg); }
  .tag-waiting     { background: var(--tag-waiting-bg);  color: var(--tag-waiting-fg); }
  .tag-review      { background: var(--tag-review-bg);   color: var(--tag-review-fg); }
  .tag-done        { background: var(--tag-done-bg);      color: var(--tag-done-fg); }

  /* ── Add task row ── */
  .add-task-row {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 4px 0;
    margin-top: 4px;
  }
  .add-task-input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-size: 13px;
    color: var(--text-muted);
    font-family: inherit;
  }
  .add-task-input::placeholder { color: #ccc; }

  /* ── Resize handle ── */
  .resize-handle {
    position: absolute;
    right: -4px;
    top: 20%;
    height: 60%;
    width: 8px;
    cursor: col-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 100ms;
    z-index: 10;
  }
  .card:hover .resize-handle { opacity: 1; }
  .resize-handle::after {
    content: '';
    width: 3px;
    height: 24px;
    background: var(--border);
    border-radius: 2px;
  }

  /* ── Drop zone between cards ── */
  .drop-zone {
    min-height: 6px;
    border-radius: 4px;
    transition: background 100ms;
  }
  .drop-zone.active { background: #d5cfc3; min-height: 40px; }

  /* ── Progress bar ── */
  .progress-text {
    font-size: 11px;
    color: var(--text-muted);
    margin-bottom: 6px;
  }
  ```

- [ ] **Step 2: Reload browser**

  ```bash
  open index.html
  ```

  Expected: beige background visible, no console errors.

- [ ] **Step 3: Commit**

  ```bash
  git add css/style.css
  git commit -m "feat: add beige theme CSS"
  ```

---

## Task 4: Supabase data layer (`js/db.js`)

**Files:**
- Modify: `js/db.js`

- [ ] **Step 1: Write `js/db.js`**

  ```js
  const supabase = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY
  );

  // ── Workspaces ──
  export async function fetchWorkspaces() {
    const { data, error } = await supabase
      .from('workspaces').select('*').order('position');
    if (error) throw error;
    return data;
  }

  export async function createWorkspace(name, position) {
    const { data, error } = await supabase
      .from('workspaces').insert({ name, position }).select().single();
    if (error) throw error;
    return data;
  }

  export async function updateWorkspace(id, changes) {
    const { error } = await supabase
      .from('workspaces').update(changes).eq('id', id);
    if (error) throw error;
  }

  export async function deleteWorkspace(id) {
    const { error } = await supabase
      .from('workspaces').delete().eq('id', id);
    if (error) throw error;
  }

  // ── Lists ──
  export async function fetchLists(workspaceId) {
    const { data, error } = await supabase
      .from('lists').select('*')
      .eq('workspace_id', workspaceId).order('position');
    if (error) throw error;
    return data;
  }

  export async function createList(workspaceId, name, position, isDump = false) {
    const { data, error } = await supabase
      .from('lists')
      .insert({ workspace_id: workspaceId, name, position, is_dump: isDump })
      .select().single();
    if (error) throw error;
    return data;
  }

  export async function updateList(id, changes) {
    const { error } = await supabase
      .from('lists').update(changes).eq('id', id);
    if (error) throw error;
  }

  export async function deleteList(id) {
    const { error } = await supabase
      .from('lists').delete().eq('id', id);
    if (error) throw error;
  }

  // ── Tasks ──
  export async function fetchTasks(listIds) {
    if (!listIds.length) return [];
    const { data, error } = await supabase
      .from('tasks').select('*')
      .in('list_id', listIds).order('position');
    if (error) throw error;
    return data;
  }

  export async function createTask(listId, text, position) {
    const { data, error } = await supabase
      .from('tasks')
      .insert({ list_id: listId, text, position, status: 'pending' })
      .select().single();
    if (error) throw error;
    return data;
  }

  export async function updateTask(id, changes) {
    const { error } = await supabase
      .from('tasks').update(changes).eq('id', id);
    if (error) throw error;
  }

  export async function deleteTask(id) {
    const { error } = await supabase
      .from('tasks').delete().eq('id', id);
    if (error) throw error;
  }

  // ── Realtime ──
  export function subscribeToChanges(onWorkspace, onList, onTask) {
    supabase.channel('db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspaces' }, onWorkspace)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists' }, onList)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, onTask)
      .subscribe();
  }
  ```

- [ ] **Step 2: Verify no syntax errors**

  Open browser console after reloading `index.html`. Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add js/db.js
  git commit -m "feat: supabase data layer with realtime"
  ```

---

## Task 5: App state + initial render (`js/app.js`)

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Write state + load + render skeleton**

  ```js
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

  // ── Selectors ──
  const $ = id => document.getElementById(id);

  // ── Status cycle (clicking tag cycles through statuses) ──
  const STATUS_ORDER = ['pending', 'in_progress', 'waiting', 'review', 'done'];
  const STATUS_LABELS = {
    pending: null,
    in_progress: 'in corso',
    waiting: 'in attesa',
    review: 'revisione',
    done: 'fatto'
  };

  function nextStatus(current) {
    const idx = STATUS_ORDER.indexOf(current);
    return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
  }

  // ── Render tabs ──
  function renderTabs() {
    const container = $('tabs');
    container.innerHTML = state.workspaces.map(w => `
      <button class="tab ${w.id === state.activeWorkspaceId ? 'active' : ''}"
              data-id="${w.id}">${escapeHtml(w.name)}</button>
    `).join('');

    container.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', () => setActiveWorkspace(btn.dataset.id));
      btn.addEventListener('dblclick', () => renameWorkspace(btn.dataset.id, btn));
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

    const grid = document.createElement('div');
    grid.className = 'cards-grid';
    regular.forEach(l => grid.appendChild(renderCard(l)));
    if (regular.length) container.appendChild(grid);
  }

  // ── Render a single card ──
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
        <button class="card-menu" data-list-id="${list.id}" title="Opzioni">···</button>
      </div>
      ${tasks.length ? `<div class="progress-text">${done}/${tasks.length} completati</div>` : ''}
      <div class="task-list" data-list-id="${list.id}">
        ${tasks.map(t => renderTaskHtml(t)).join('')}
      </div>
      <div class="add-task-row">
        <span style="color:#ccc;font-size:13px">+</span>
        <input class="add-task-input" placeholder="Aggiungi task…" data-list-id="${list.id}">
      </div>
      ${!list.is_dump ? `<div class="resize-handle" data-list-id="${list.id}"></div>` : ''}
    `;

    bindCardEvents(card, list);
    return card;
  }

  function renderTaskHtml(task) {
    const tag = task.status !== 'pending'
      ? `<span class="tag tag-${task.status}" data-task-id="${task.id}">${STATUS_LABELS[task.status]}</span>`
      : `<span class="tag" data-task-id="${task.id}" style="color:#ccc;font-size:10px">···</span>`;
    return `
      <div class="task-item ${task.status === 'done' ? 'done' : ''}"
           draggable="true" data-task-id="${task.id}" data-list-id="${task.list_id}">
        <input type="checkbox" ${task.status === 'done' ? 'checked' : ''} data-task-id="${task.id}">
        <span class="task-text" contenteditable="true" data-task-id="${task.id}">${escapeHtml(task.text)}</span>
        ${tag}
      </div>
    `;
  }

  function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Init — called at end of Task 10 once all functions are defined ──
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
  // NOTE: do NOT call init() here — it is called at the bottom of Task 10
  ```

- [ ] **Step 2: Verify no syntax errors**

  Open `index.html`. No console errors expected. App won't render yet — `init()` is called in Task 10 after all functions are defined.

- [ ] **Step 3: Commit**

  ```bash
  git add js/app.js
  git commit -m "feat: app state + render functions skeleton"
  ```

---

## Task 6: Event handlers — workspace, cards, tasks

**Files:**
- Modify: `js/app.js` (append functions)

- [ ] **Step 1: Add `setActiveWorkspace`, `renameWorkspace`, add-workspace handler**

  Append to `js/app.js`:

  ```js
  async function setActiveWorkspace(id) {
    state.activeWorkspaceId = id;
    state.lists = await fetchLists(id);
    const listIds = state.lists.map(l => l.id);
    state.tasks = listIds.length ? await fetchTasks(listIds) : [];
    renderTabs();
    renderWorkspace();
  }

  function renameWorkspace(id, btn) {
    const current = state.workspaces.find(w => w.id === id);
    const newName = prompt('Rinomina workspace:', current.name);
    if (!newName || newName === current.name) return;
    current.name = newName;
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
      state.activeWorkspaceId = ws.id;
      state.lists = [];
      state.tasks = [];
      renderTabs();
      renderWorkspace();
    });

    $('btn-add-list').addEventListener('click', async () => {
      if (!state.activeWorkspaceId) return;
      const name = prompt('Nome della nuova lista:');
      if (!name) return;
      const regularLists = state.lists.filter(l => !l.is_dump);
      const pos = regularLists.length;
      const list = await createList(state.activeWorkspaceId, name, pos);
      state.lists.push(list);
      renderWorkspace();
    });
  }
  ```

- [ ] **Step 2: Add `bindCardEvents` function**

  Append to `js/app.js`:

  ```js
  function bindCardEvents(card, list) {
    // Rename list
    const titleInput = card.querySelector('.card-title');
    titleInput.addEventListener('blur', () => {
      if (titleInput.value !== list.name) {
        list.name = titleInput.value;
        updateList(list.id, { name: list.name });
      }
    });
    titleInput.addEventListener('keydown', e => { if (e.key === 'Enter') titleInput.blur(); });

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

    // Status tag click → cycle
    card.querySelectorAll('.tag[data-task-id]').forEach(tag => {
      tag.addEventListener('click', async e => {
        e.stopPropagation();
        const task = state.tasks.find(t => t.id === tag.dataset.taskId);
        if (!task || task.status === 'done') return;
        task.status = nextStatus(task.status);
        await updateTask(task.id, { status: task.status });
        renderWorkspace();
      });
    });

    // Edit task text
    card.querySelectorAll('.task-text[contenteditable]').forEach(span => {
      span.addEventListener('blur', async () => {
        const task = state.tasks.find(t => t.id === span.dataset.taskId);
        if (!task) return;
        const newText = span.textContent.trim();
        if (newText && newText !== task.text) {
          task.text = newText;
          await updateTask(task.id, { text: newText });
        }
      });
      span.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); span.blur(); } });
    });

    // Resize handle
    const handle = card.querySelector('.resize-handle');
    if (handle) bindResizeHandle(handle, card, list);

    // Drag & drop
    bindDragDrop(card);
  }
  ```

- [ ] **Step 3: Open browser, add a task, verify it saves**

  1. Open `index.html`
  2. Click "Nuova lista" → enter "Test"
  3. Type a task in the input → press Enter
  4. Verify task appears and checkbox works
  5. Check Supabase Table Editor: task row should exist

- [ ] **Step 4: Commit**

  ```bash
  git add js/app.js
  git commit -m "feat: workspace, card, task event handlers"
  ```

---

## Task 7: Drag & drop tasks between cards

**Files:**
- Modify: `js/app.js` (append `bindDragDrop`)

- [ ] **Step 1: Append drag & drop logic**

  ```js
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
        document.querySelectorAll('.task-item.drag-over').forEach(el => el.classList.remove('drag-over'));
      });
    });

    taskList.addEventListener('dragover', e => {
      e.preventDefault();
      const after = getDragAfterElement(taskList, e.clientY);
      const dragging = document.querySelector('.task-item.dragging');
      if (!dragging) return;
      if (!after) taskList.appendChild(dragging);
      else taskList.insertBefore(dragging, after);
    });

    taskList.addEventListener('drop', async e => {
      e.preventDefault();
      if (!draggedTaskId) return;
      const newListId = taskList.dataset.listId;
      const task = state.tasks.find(t => t.id === draggedTaskId);
      if (!task) return;

      task.list_id = newListId;
      const items = [...taskList.querySelectorAll('.task-item')];
      const updates = items.map((el, i) => {
        const t = state.tasks.find(t => t.id === el.dataset.taskId);
        if (t) t.position = i;
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
  ```

- [ ] **Step 2: Test drag & drop**

  1. Create two lists with tasks
  2. Drag a task from one card to another
  3. Refresh page — verify new position persists (stored in Supabase)

- [ ] **Step 3: Commit**

  ```bash
  git add js/app.js
  git commit -m "feat: drag and drop tasks between cards"
  ```

---

## Task 8: Card resize (1–4 columns)

**Files:**
- Modify: `js/app.js` (append `bindResizeHandle`)

- [ ] **Step 1: Append resize logic**

  ```js
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
  ```

- [ ] **Step 2: Test card resize**

  1. Hover over a card → resize handle appears on right edge
  2. Drag right → card expands to 2, 3, or 4 columns
  3. Drag left → card shrinks
  4. Refresh → width persists

- [ ] **Step 3: Commit**

  ```bash
  git add js/app.js
  git commit -m "feat: card column resize with persist"
  ```

---

## Task 9: Realtime sync handlers

**Files:**
- Modify: `js/app.js` (append handlers)

- [ ] **Step 1: Append realtime handlers**

  ```js
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
  ```

- [ ] **Step 2: Test realtime sync**

  1. Open `index.html` in Chrome on Mac
  2. Open same URL in another browser/tab (simulate tablet)
  3. Add a task in one window → must appear in the other within 2 seconds
  4. Complete a task → both windows update

- [ ] **Step 3: Commit**

  ```bash
  git add js/app.js
  git commit -m "feat: realtime sync handlers for all tables"
  ```

---

## Task 10: Dump card on first workspace + auto-create

**Files:**
- Modify: `js/app.js` (modify `setActiveWorkspace`, add helper)

- [ ] **Step 1: Auto-create dump card when workspace is empty**

  In `setActiveWorkspace`, after fetching lists, add:

  ```js
  async function setActiveWorkspace(id) {
    state.activeWorkspaceId = id;
    state.lists = await fetchLists(id);
    const listIds = state.lists.map(l => l.id);
    state.tasks = listIds.length ? await fetchTasks(listIds) : [];

    // Auto-create dump card if none exists
    if (!state.lists.find(l => l.is_dump)) {
      const dump = await createList(id, 'Vario', 0, true);
      state.lists.unshift(dump);
    }

    renderTabs();
    renderWorkspace();
  }
  ```

  Also append at the very bottom of `js/app.js` (this is the final line of the file — call init here now that all functions are defined):

  ```js
  init();
  ```

- [ ] **Step 2: Verify**

  Delete all lists in Supabase Table Editor, reload page. Expected: "Vario" dump card auto-created.

- [ ] **Step 3: Commit**

  ```bash
  git add js/app.js
  git commit -m "feat: auto-create dump card on empty workspace"
  ```

---

## Task 11: Netlify deploy

**Files:**
- Already created: `netlify.toml`

- [ ] **Step 1: Push to GitHub**

  ```bash
  git remote add origin https://github.com/YOUR_USERNAME/todo-webapp.git
  git push -u origin main
  ```

- [ ] **Step 2: Connect to Netlify**

  1. Go to https://app.netlify.com → Add new site → Import from Git
  2. Select your GitHub repo
  3. Build command: (empty — no build)
  4. Publish directory: `.` (root)
  5. Deploy

- [ ] **Step 3: Update `index.html` SUPABASE_URL/KEY with real values if not done yet**

  Open `index.html`, replace:
  ```js
  window.SUPABASE_URL = 'https://xxxx.supabase.co';
  window.SUPABASE_ANON_KEY = 'eyJ...';
  ```

  ```bash
  git add index.html
  git commit -m "chore: add supabase credentials"
  git push
  ```

- [ ] **Step 4: Verify live URL**

  Open `https://your-app.netlify.app` in Chrome on Mac and on tablet.
  Expected: app loads, realtime sync works cross-device.

- [ ] **Step 5: Install as PWA in Chrome**

  In Chrome address bar → click install icon (or Chrome menu → "Installa Todo").
  App appears in Dock/Launchpad on Mac.

---

## Verification Checklist

| Test | Expected |
|------|----------|
| Open app fresh | Workspaces load, dump card visible |
| Add task (Enter) | Appears immediately, saved to Supabase |
| Complete task | Strikethrough, persists after refresh |
| Click status tag | Cycles: pending → in corso → in attesa → revisione → fatto → pending |
| Drag task between cards | Reorders, new list_id saved |
| Resize card | Snaps to 1-4 cols, width persists |
| Add workspace (+) | New tab appears |
| Open on tablet | Same data visible within 2s of any change |
| Realtime | Change on one device → appears on other in <2s |
