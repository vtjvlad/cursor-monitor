const $ = (id) => document.getElementById(id);
let token = '';
let refreshTimer;
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;'
  })[char]);
}
async function api(path) {
  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });
  if (response.status === 401) throw new Error('Неверный токен');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
function showError(error) {
  $('connection').textContent = 'Ошибка';
  $('connection').className = 'pill error';
  $('sessions').textContent = error.message;
}
function renderProcesses(processes) {
  if (!processes.length) {
    return '<div class="empty">Процессы Cursor CLI не обнаружены.</div>';
  }
  return processes.map((process) => `
    <article class="session">
      <div class="session-title">${escapeHtml(process.executable)} · PID ${process.pid}</div>
      <div class="session-meta">
        Пользователь: ${escapeHtml(process.user)}<br>
        Состояние ОС: ${escapeHtml(process.state)} · Время процесса: ${escapeHtml(process.elapsed)}<br>
        Рабочий каталог: ${escapeHtml(process.cwd || 'недоступен')}<br>
        Тип: обнаруженный процесс; состояние задачи агента не определено
      </div>
    </article>
  `).join('');
}
async function refresh() {
  if (!token) return;
  $('refresh').disabled = true;
  try {
    const data = await api('/monitor/api/sessions');
    const processes = data.processes.processes || [];
    const persist = data.persistent;
    $('connection').textContent = 'API доступен';
    $('connection').className = 'pill ok';
    $('persistent-count').textContent = persist.available
      ? persist.sessions.length
      : '—';
    $('process-count').textContent = processes.length;
    $('sessions').innerHTML = renderProcesses(processes);
    $('persist-output').textContent = [
      `Источник: ${persist.source}`,
      `Доступен: ${persist.available}`,
      persist.message,
      persist.error ? `Ошибка: ${persist.error}` : ''
    ].filter(Boolean).join('\n');
    return true;
  } catch (error) {
    showError(error);
    return false;
  } finally {
    $('refresh').disabled = false;
  }
}
$('auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  token = $('token').value.trim();
  const connected = await refresh();
  if (connected) {
    $('token').value = '';
    clearInterval(refreshTimer);
    refreshTimer = setInterval(refresh, 15000);
  }
});
$('refresh').addEventListener('click', refresh);
