const $ = (id) => document.getElementById(id);

let token = sessionStorage.getItem('cursor-monitor-token') || '';
let refreshTimer = null;
let snapshot = null;
let selectedId = null;
let activeView = 'overview';
let activeFilter = 'all';
let activeDetailTab = 'overview';

const viewInfo = {
  overview: ['Overview', 'Состояние CLI-процессов и обнаруженных сессий.'],
  sessions: ['Sessions', 'Сохранённые persistent sessions, доступные через Cursor CLI.'],
  processes: ['Processes', 'Процессы Cursor CLI, обнаруженные в системе.'],
  events: ['Diagnostics', 'Источники данных и результаты последней проверки.']
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;'
  })[char]);
}

function getProcesses() {
  return snapshot?.processes?.processes || [];
}

function getPersistent() {
  return snapshot?.persistent || {
    available: false, sessions: [], rawLines: [],
    message: 'Данные ещё не загружены', error: null
  };
}

async function api(path) {
  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });
  if (response.status === 401) {
    throw new Error('Сервер отклонил токен (HTTP 401). Проверь токен из .env.');
  }
  if (!response.ok) throw new Error(`Ошибка API: HTTP ${response.status}`);
  return response.json();
}

function showError(error) {
  $('error-banner').hidden = false;
  $('error-banner').textContent = error.message || 'Не удалось получить данные.';
  $('connection').textContent = 'Ошибка';
  $('connection').className = 'stat-value stat-value-text';
  $('api-status-caption').textContent = 'Ошибка запроса';
  $('api-status-dot').className = 'stat-dot';
  $('side-status').textContent = 'Connection error';
  $('side-status-caption').textContent = 'Проверь подключение';
  $('side-status-dot').className = 'status-dot error';
  $('diagnostic-api').textContent = error.message || 'Ошибка запроса';
  $('diagnostic-api-state').textContent = 'ERROR';
  $('diagnostic-api-state').className = 'diagnostic-state error';
}

function setConnected() {
  $('error-banner').hidden = true;
  $('connection').textContent = 'Connected';
  $('api-status-caption').textContent = 'API отвечает';
  $('api-status-dot').className = 'stat-dot green-dot';
  $('side-status').textContent = 'Connected';
  $('side-status-caption').textContent = 'API доступен';
  $('side-status-dot').className = 'status-dot ok';
  $('diagnostic-api').textContent = 'Bearer authentication passed';
  $('diagnostic-api-state').textContent = 'OK';
  $('diagnostic-api-state').className = 'diagnostic-state ok';
  $('auth-panel').classList.add('connected');
  $('connect-button').textContent = 'Подключено ✓';
}

function setWaiting() {
  $('connection').textContent = 'Не подключено';
  $('api-status-caption').textContent = 'Ожидание авторизации';
  $('side-status').textContent = 'Disconnected';
  $('side-status-caption').textContent = 'Connect to your API';
}

function renderList() {
  const processes = getProcesses();
  const persistent = getPersistent();
  const query = $('search').value.trim().toLowerCase();

  $('persistent-count').textContent = persistent.available
    ? (persistent.sessions || []).length : '—';
  $('process-count').textContent = processes.length;
  $('nav-session-count').textContent = (persistent.sessions || []).length;
  $('nav-process-count').textContent = processes.length;
  $('list-count').textContent = activeView === 'sessions'
    ? (persistent.sessions || []).length : processes.length;

  let items = processes.map((process) => ({ ...process, recordKind: 'process' }));

  if (activeView === 'sessions') {
    items = (persistent.sessions || []).map((session, index) => ({
      ...session,
      id: session.id || `persistent:${index}`,
      recordKind: 'persistent'
    }));
  }

  if (activeFilter === 'detected' && activeView !== 'sessions') {
    items = items.filter((item) => item.kind === 'process');
  }

  items = items.filter((item) => [
    item.executable, item.name, item.id, item.pid, item.cwd, item.user
  ].some((value) => String(value ?? '').toLowerCase().includes(query)));

  $('sessions').innerHTML = items.length ? items.map((item) => {
    const id = item.recordKind === 'persistent'
      ? `persistent:${item.id}` : `process:${item.pid}`;
    const title = item.executable || item.name || 'Cursor session';
    const meta = item.recordKind === 'persistent'
      ? 'Persistent session'
      : `PID ${item.pid} · ${item.elapsed || 'время неизвестно'}`;
    const path = item.cwd || item.directory || 'Рабочий каталог недоступен';
    return `
      <button type="button" class="process-item ${selectedId === id ? 'selected' : ''}"
        data-record-id="${escapeHtml(id)}">
        <span class="process-top">
          <span class="process-avatar">${item.recordKind === 'persistent' ? '▤' : '⌘'}</span>
          <span class="process-main">
            <span class="process-name">${escapeHtml(title)}</span>
            <span class="process-meta">${escapeHtml(meta)}</span>
          </span>
          <span class="process-chevron">›</span>
        </span>
        <span class="process-path">${escapeHtml(path)}</span>
        <span class="process-status"><span class="status-dot"></span>${item.recordKind === 'persistent' ? 'Persistent session' : 'Процесс обнаружен'}</span>
      </button>`;
  }).join('') : `
    <div class="empty-state">
      <span class="empty-icon">${activeView === 'sessions' ? '▤' : '⌘'}</span>
      <strong>${activeView === 'sessions' ? 'Persistent sessions не найдены' : 'Процессы не найдены'}</strong>
      <p>${query ? 'Попробуй изменить поисковый запрос.' : activeView === 'sessions' ? 'Cursor CLI пока не сообщает о сохранённых persistent sessions.' : 'Подключись к API или дождись запуска Cursor CLI.'}</p>
    </div>`;

  $('sessions').querySelectorAll('[data-record-id]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedId = button.dataset.recordId;
      activeDetailTab = 'overview';
      renderList();
      renderDetails();
    });
  });

  if (selectedId && !items.some((item) =>
    (item.recordKind === 'persistent'
      ? `persistent:${item.id}` : `process:${item.pid}`) === selectedId
  )) {
    selectedId = null;
  }

  if (!selectedId && items.length) {
    selectedId = items[0].recordKind === 'persistent'
      ? `persistent:${items[0].id}` : `process:${items[0].pid}`;
  }
  renderDetails();
}

function findSelected() {
  if (!selectedId) return null;
  if (selectedId.startsWith('process:')) {
    return getProcesses().find((item) => `process:${item.pid}` === selectedId) || null;
  }
  const id = selectedId.slice('persistent:'.length);
  return (getPersistent().sessions || []).find((item, index) =>
    String(item.id || index) === id
  ) || null;
}

function field(label, value, code = false) {
  return `<div class="detail-field"><label>${escapeHtml(label)}</label><${code ? 'code' : 'span class="field-value"'}>${escapeHtml(value ?? '—')}</${code ? 'code' : 'span'}></div>`;
}

function renderDetails() {
  const item = findSelected();
  if (!item) {
    $('detail-content').innerHTML = `
      <div class="empty-state detail-empty">
        <span class="empty-icon">◎</span><strong>Выбери процесс</strong>
        <p>Подробности появятся здесь после загрузки данных.</p>
      </div>`;
    return;
  }

  const isPersistent = selectedId.startsWith('persistent:');
  const title = item.executable || item.name || 'Cursor session';
  const tabs = [
    ['overview', 'Overview'],
    ['environment', 'Environment'],
    ['events', 'Events']
  ];

  let content = '';
  if (activeDetailTab === 'overview') {
    content = [
      field('Process ID', item.pid ? String(item.pid) : (item.id || '—'), true),
      field('Исполняемый файл', title, true),
      field('Рабочий каталог', item.cwd || item.directory || 'Недоступен', true),
      field('Пользователь', item.user || '—'),
      field('Время процесса', item.elapsed || '—'),
      field('Состояние ОС', item.state || 'Не предоставлено'),
      field('Родительский PID', item.ppid ? String(item.ppid) : '—')
    ].join('');
  } else if (activeDetailTab === 'environment') {
    content = [
      field('Рабочий каталог', item.cwd || item.directory || 'Недоступен', true),
      field('Исполняемый файл', title, true),
      field('Пользователь', item.user || '—'),
      field('Тип записи', isPersistent ? 'Persistent session' : 'Обнаруженный системный процесс')
    ].join('');
  } else {
    content = `
      <div class="detail-callout"><span>●</span><div>
        <strong>События задачи не подключены.</strong><br>
        Монитор обнаруживает процесс, но не утверждает, что агент в данный момент выполняет задачу.
      </div></div>
      ${field('Источник', isPersistent ? 'agent persist list' : 'ps process listing', true)}
      ${field('Последний сбор', snapshot?.collectedAt || '—')}`;
  }

  $('detail-content').innerHTML = `
    <div class="detail-body">
      <div class="detail-identity">
        <div class="detail-avatar">${isPersistent ? '▤' : '⌘'}</div>
        <div class="detail-identity-main">
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(item.pid ? `Process ID · ${item.pid}` : item.id || 'Session')}</p>
        </div>
      </div>
      <div class="detail-status"><span class="status-dot"></span>${isPersistent ? 'Persistent session' : 'Process detected'}</div>
      <div class="detail-tabs">
        ${tabs.map(([id, label]) => `<button class="detail-tab ${activeDetailTab === id ? 'active' : ''}" data-detail-tab="${id}">${label}</button>`).join('')}
      </div>
      <div class="detail-fields">${content}</div>
      <div class="detail-callout"><span>ⓘ</span><div>Состояние процесса ОС не является подтверждением активного выполнения задачи Cursor Agent.</div></div>
    </div>`;

  $('detail-content').querySelectorAll('[data-detail-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      activeDetailTab = button.dataset.detailTab;
      renderDetails();
    });
  });
}

function renderDiagnostics() {
  const persistent = getPersistent();
  const processes = getProcesses();
  $('diagnostic-persist').textContent = persistent.message || 'Проверка завершена';
  $('diagnostic-persist-state').textContent = persistent.available ? 'OK' : 'ERROR';
  $('diagnostic-persist-state').className = `diagnostic-state ${persistent.available ? 'ok' : 'error'}`;
  $('diagnostic-processes').textContent = processes.length
    ? `${processes.length} процесс(ов) обнаружено`
    : 'Подходящие процессы не обнаружены';
  $('diagnostic-process-state').textContent = snapshot?.processes?.available ? 'OK' : 'ERROR';
  $('diagnostic-process-state').className = `diagnostic-state ${snapshot?.processes?.available ? 'ok' : 'error'}`;

  $('persist-output').textContent = [
    `Сбор данных: ${snapshot?.collectedAt || '—'}`,
    `Источник: ${persistent.source || '—'}`,
    `Persistent sessions доступны: ${persistent.available}`,
    persistent.message || '',
    persistent.error ? `Ошибка persistent sessions: ${persistent.error}` : '',
    `Процессы доступны: ${Boolean(snapshot?.processes?.available)}`,
    `Количество процессов: ${processes.length}`,
    ...(persistent.rawLines || [])
  ].filter(Boolean).join('\n');
}

function renderView() {
  const [title, description] = viewInfo[activeView] || viewInfo.overview;
  $('page-title').textContent = title;
  $('page-description').textContent = description;
  $('breadcrumb-current').textContent = title;

  document.querySelectorAll('[data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === activeView);
  });

  $('diagnostics-panel').hidden = activeView !== 'overview' && activeView !== 'events';
  $('diagnostics-panel').style.display =
    activeView === 'overview' || activeView === 'events' ? '' : 'none';

  if (activeView === 'events') {
    $('list-title').textContent = 'Диагностика источников';
    $('list-subtitle').textContent = 'Выбери процесс слева или изучи диагностику ниже.';
  } else if (activeView === 'sessions') {
    $('list-title').textContent = 'Persistent sessions';
    $('list-subtitle').textContent = 'Сессии, возвращаемые Cursor CLI.';
  } else {
    $('list-title').textContent = 'Обнаруженные процессы';
    $('list-subtitle').textContent = 'Выбери процесс, чтобы посмотреть подробности.';
  }
  renderList();
}

async function refresh() {
  if (!token) return false;
  $('refresh').disabled = true;
  try {
    snapshot = await api('/monitor/api/sessions');
    setConnected();
    $('last-updated').textContent = new Date(snapshot.collectedAt || Date.now()).toLocaleTimeString();
    renderDiagnostics();
    renderView();
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
  if (!token) return;

  $('connect-button').disabled = true;
  $('connect-button').textContent = 'Подключение…';

  const connected = await refresh();
  if (connected) {
    $('token').value = '';
    sessionStorage.setItem('cursor-monitor-token', token);
    hideConnectModal();
    clearInterval(refreshTimer);
    refreshTimer = setInterval(refresh, 15000);
  } else {
    sessionStorage.removeItem('cursor-monitor-token');
    token = '';
    $('connect-button').textContent = 'Попробовать снова';
  }
  $('connect-button').disabled = false;
});

$('refresh').addEventListener('click', refresh);
$('search').addEventListener('input', renderList);

document.querySelectorAll('[data-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((item) =>
      item.classList.toggle('active', item === button)
    );
    renderList();
  });
});

document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => {
    activeView = button.dataset.view;
    renderView();
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
    event.preventDefault();
    $('search').focus();
  }
  if (event.key === 'Escape' && document.activeElement === $('search')) {
    $('search').value = '';
    $('search').blur();
    renderList();
  }
});

setWaiting();
renderView();

if (token) {
  refresh().then((connected) => {
    if (connected) {
      $('token').value = '';
      clearInterval(refreshTimer);
      refreshTimer = setInterval(refresh, 15000);
      hideConnectModal();
    } else {
      sessionStorage.removeItem('cursor-monitor-token');
      token = '';
      showConnectModal();
    }
  });
} else {
  showConnectModal();
}


function showConnectModal() {
  $('connect-modal').hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('token').focus(), 50);
}

function hideConnectModal() {
  $('connect-modal').hidden = true;
  document.body.style.overflow = '';
}

$('open-connect').addEventListener('click', showConnectModal);

$('close-connect').addEventListener('click', hideConnectModal);

$('connect-backdrop').addEventListener('click', hideConnectModal);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('connect-modal').hidden) {
    hideConnectModal();
  }
});

$('reset-token').addEventListener('click', () => {
  token = '';
  sessionStorage.removeItem('cursor-monitor-token');

  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }

  window.location.reload();
});
