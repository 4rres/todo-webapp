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

export async function createList(workspaceId, name, position, isDump = false, isCompleted = false) {
  const { data, error } = await supabase
    .from('lists')
    .insert({ workspace_id: workspaceId, name, position, is_dump: isDump, is_completed: isCompleted })
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
