import {
  STORAGE_KEY,
  addTask,
  formatDeadline,
  getStats,
  getVisibleTasks,
  normalizeTitle,
  parseStored,
  removeTask,
  serializeTasks,
  toggleTask,
} from './todo-core.js';

const TABS = ['pending', 'done'];
const TAB_LABELS = { pending: '未办', done: '已办' };
const STORAGE_LABEL = 'LOCAL STORAGE // 数据仅保存在本机浏览器';

const el = {
  date: document.getElementById('sys-date'),
  statPending: document.getElementById('stat-pending'),
  statDone: document.getElementById('stat-done'),
  statRate: document.getElementById('stat-rate'),
  progress: document.getElementById('progress'),
  progressBar: document.getElementById('progress-bar'),
  form: document.getElementById('add-form'),
  title: document.getElementById('task-title'),
  deadline: document.getElementById('task-deadline'),
  formError: document.getElementById('form-error'),
  tabs: [...document.querySelectorAll('[role="tab"]')],
  tablist: document.querySelector('[role="tablist"]'),
  panel: document.getElementById('panel-tasks'),
  list: document.getElementById('task-list'),
  empty: document.getElementById('empty-state'),
  emptyTitle: document.getElementById('empty-title'),
  emptyDesc: document.getElementById('empty-desc'),
  storageNote: document.getElementById('storage-note'),
  live: document.getElementById('live'),
  template: document.getElementById('task-template'),
};

const state = {
  tasks: loadTasks(),
  tab: 'pending',
  freshId: null,
};

let freshTimer = 0;
let announceTimer = 0;
let panelTimer = 0;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatToday(date) {
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${date.getFullYear()}.${pad2(date.getMonth() + 1)}.${pad2(date.getDate())} ${weekdays[date.getDay()]}`;
}

function loadTasks() {
  try {
    return parseStored(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeTasks(state.tasks));
    setStorageNote(STORAGE_LABEL, false);
  } catch {
    setStorageNote('存储不可用 // 刷新后数据将丢失', true);
  }
}

function setStorageNote(text, isError) {
  el.storageNote.textContent = text;
  el.storageNote.classList.toggle('is-error', isError);
}

function announce(message) {
  window.clearTimeout(announceTimer);
  el.live.textContent = '';
  announceTimer = window.setTimeout(() => {
    el.live.textContent = message;
  }, 30);
}

function activeTabIndex() {
  return TABS.indexOf(state.tab);
}

function playPanelAnimation() {
  el.panel.classList.remove('is-switching');
  // Force a reflow so the animation can restart on rapid switches.
  void el.panel.offsetWidth;
  el.panel.classList.add('is-switching');
  window.clearTimeout(panelTimer);
  panelTimer = window.setTimeout(() => el.panel.classList.remove('is-switching'), 400);
}

function render() {
  const stats = getStats(state.tasks);

  el.statPending.textContent = pad2(stats.pending);
  el.statDone.textContent = pad2(stats.done);
  el.statRate.textContent = `${stats.percent}%`;
  el.progressBar.style.width = `${stats.percent}%`;
  el.progress.setAttribute('aria-valuenow', String(stats.percent));
  document.title = stats.pending > 0 ? `(${stats.pending}) NEBULA // 待办终端` : 'NEBULA // 待办终端';

  for (const tabButton of el.tabs) {
    const tab = tabButton.dataset.tab;
    const active = tab === state.tab;
    tabButton.classList.toggle('is-active', active);
    tabButton.setAttribute('aria-selected', String(active));
    tabButton.tabIndex = active ? 0 : -1;
    const count = tabButton.querySelector('.tab__count');
    if (count) count.textContent = pad2(tab === 'pending' ? stats.pending : stats.done);
  }

  el.panel.setAttribute('aria-labelledby', `tab-${state.tab}`);
  renderList();
}

function renderList() {
  const tasks = getVisibleTasks(state.tasks, state.tab);
  el.list.replaceChildren();

  const empty = tasks.length === 0;
  el.list.hidden = empty;
  el.empty.hidden = !empty;

  if (empty) {
    if (state.tab === 'pending') {
      el.emptyTitle.textContent = '暂无待办任务';
      el.emptyDesc.textContent = '在上方输入任务，按 Enter 即可创建。';
    } else {
      el.emptyTitle.textContent = '还没有已办任务';
      el.emptyDesc.textContent = '完成一项待办后，它会归档到这里。';
    }
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const task of tasks) {
    fragment.append(createTaskNode(task));
  }
  el.list.append(fragment);
}

function createTaskNode(task) {
  const node = el.template.content.firstElementChild.cloneNode(true);
  node.dataset.id = task.id;
  node.classList.toggle('is-done', task.done);
  if (task.id === state.freshId) node.classList.add('is-new');

  const checkbox = node.querySelector('input[type="checkbox"]');
  checkbox.checked = task.done;
  checkbox.setAttribute(
    'aria-label',
    task.done ? `将「${task.title}」恢复为未办` : `将「${task.title}」标记为已办`,
  );

  node.querySelector('.task__title').textContent = task.title;

  const deadline = node.querySelector('.task__deadline');
  const info = task.deadline ? formatDeadline(task.deadline) : null;
  if (task.deadline && info) {
    deadline.hidden = false;
    deadline.dateTime = task.deadline;
    deadline.title = `截止日期：${task.deadline}`;
    deadline.classList.add(`is-${info.tone}`);
    node.querySelector('.task__deadline-text').textContent = info.label;
  } else {
    node.querySelector('.task__meta').remove();
  }

  node.querySelector('.task__delete').setAttribute('aria-label', `删除任务「${task.title}」`);
  return node;
}

function focusListItem(index) {
  const checkboxes = [...el.list.querySelectorAll('input[type="checkbox"]')];
  if (checkboxes.length > 0) {
    const target = checkboxes[Math.min(Math.max(index, 0), checkboxes.length - 1)];
    target.focus();
    return;
  }
  const activeTab = el.tabs[activeTabIndex()];
  if (activeTab) activeTab.focus();
}

function setTab(tab, { moveFocus = false, announceChange = true } = {}) {
  if (!TABS.includes(tab)) return;
  if (tab === state.tab) {
    if (moveFocus) el.tabs[TABS.indexOf(tab)].focus();
    return;
  }

  state.tab = tab;
  clearFormError();
  render();
  playPanelAnimation();

  if (announceChange) {
    const visible = getVisibleTasks(state.tasks, tab).length;
    announce(`已切换到${TAB_LABELS[tab]}列表，共 ${visible} 项`);
  }
  if (moveFocus) el.tabs[TABS.indexOf(tab)].focus();
}

function showFormError(message, field) {
  el.formError.textContent = message;
  el.formError.hidden = false;
  if (field) {
    field.classList.add('is-invalid');
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', 'form-error');
    field.focus();
  }
}

function clearFormError() {
  el.formError.hidden = true;
  el.formError.textContent = '';
  for (const input of [el.title, el.deadline]) {
    input.classList.remove('is-invalid');
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  }
}

function handleToggle(checkbox) {
  const node = checkbox.closest('.task');
  if (!node) return;
  const id = node.dataset.id;
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;

  const wasDone = task.done;
  const index = getVisibleTasks(state.tasks, state.tab).findIndex((item) => item.id === id);

  state.tasks = toggleTask(state.tasks, id);
  persist();
  render();

  announce(wasDone ? `已恢复「${task.title}」为未办` : `已完成「${task.title}」`);
  focusListItem(index);
}

function handleDelete(button) {
  const node = button.closest('.task');
  if (!node) return;
  const task = state.tasks.find((item) => item.id === node.dataset.id);
  if (!task) return;

  const index = getVisibleTasks(state.tasks, state.tab).findIndex((item) => item.id === task.id);
  state.tasks = removeTask(state.tasks, task.id);
  persist();
  render();

  announce(`已删除「${task.title}」`);
  focusListItem(index);
}

el.form.addEventListener('submit', (event) => {
  event.preventDefault();
  clearFormError();

  if (!normalizeTitle(el.title.value)) {
    showFormError('请输入任务内容', el.title);
    return;
  }

  let result;
  try {
    result = addTask(state.tasks, {
      title: el.title.value,
      deadline: el.deadline.value,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_DEADLINE') {
      showFormError('截止日期无效，请重新选择', el.deadline);
    } else {
      showFormError('请输入任务内容', el.title);
    }
    return;
  }

  state.tasks = result.tasks;
  state.freshId = result.task.id;
  window.clearTimeout(freshTimer);
  freshTimer = window.setTimeout(() => {
    state.freshId = null;
  }, 800);

  state.tab = 'pending';
  persist();
  el.form.reset();
  render();
  el.title.focus();
  announce(`已添加「${result.task.title}」`);
});

el.title.addEventListener('input', clearFormError);
el.deadline.addEventListener('input', clearFormError);

el.tabs.forEach((tabButton) => {
  tabButton.addEventListener('click', () => setTab(tabButton.dataset.tab));
});

el.tablist.addEventListener('keydown', (event) => {
  if (!event.target.closest('[role="tab"]')) return;

  const current = activeTabIndex();
  let next = null;

  switch (event.key) {
    case 'ArrowRight':
      next = (current + 1) % TABS.length;
      break;
    case 'ArrowLeft':
      next = (current - 1 + TABS.length) % TABS.length;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = TABS.length - 1;
      break;
    default:
      return;
  }

  event.preventDefault();
  setTab(TABS[next], { moveFocus: true });
});

el.list.addEventListener('change', (event) => {
  const checkbox = event.target.closest('input[type="checkbox"]');
  if (checkbox) handleToggle(checkbox);
});

el.list.addEventListener('click', (event) => {
  const deleteButton = event.target.closest('.task__delete');
  if (deleteButton) handleDelete(deleteButton);
});

window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY) return;
  state.tasks = event.newValue ? parseStored(event.newValue) : [];
  render();
  announce('任务已在另一个窗口更新');
});

el.date.textContent = formatToday(new Date());
setStorageNote(STORAGE_LABEL, false);
render();

window.setInterval(() => {
  el.date.textContent = formatToday(new Date());
}, 60_000);
