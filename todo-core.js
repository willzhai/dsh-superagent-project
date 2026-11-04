/**
 * Pure task logic for NEBULA // 待办终端.
 *
 * Kept free of DOM and storage APIs so it can be unit tested with `node --test`
 * and reused by the browser app.
 */

export const STORAGE_KEY = 'nebula-tasks.v1';

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeTitle(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

export function isValidDateKey(value) {
  if (typeof value !== 'string') return false;
  const match = DATE_KEY_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function normalizeDeadline(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const key = value.trim();
  return isValidDateKey(key) ? key : null;
}

function parseDateKey(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Calendar days between a deadline and `now` (negative means overdue). */
export function daysUntil(deadline, now = new Date()) {
  if (!isValidDateKey(deadline)) return null;
  return Math.round((parseDateKey(deadline) - startOfDay(now)) / DAY_MS);
}

/**
 * Human readable deadline label plus a tone used for styling.
 * Tones: overdue | today | soon (1-3 days) | upcoming (4-30 days) | normal.
 */
export function formatDeadline(deadline, now = new Date()) {
  if (!isValidDateKey(deadline)) return null;

  const diff = daysUntil(deadline, now);
  const date = parseDateKey(deadline);
  const month = date.getMonth() + 1;
  const day = date.getDate();

  if (diff < 0) {
    return { label: `已逾期 ${Math.abs(diff)} 天`, tone: 'overdue', diff };
  }
  if (diff === 0) {
    return { label: '今天到期', tone: 'today', diff };
  }
  if (diff === 1) {
    return { label: '明天到期', tone: 'soon', diff };
  }
  if (diff <= 3) {
    return { label: `${diff} 天后到期`, tone: 'soon', diff };
  }
  if (diff <= 30) {
    return { label: `${diff} 天后到期`, tone: 'upcoming', diff };
  }

  const prefix = date.getFullYear() === now.getFullYear() ? '' : `${date.getFullYear()} 年 `;
  return { label: `${prefix}${month} 月 ${day} 日到期`, tone: 'normal', diff };
}

export function createTask(input = {}, { now = new Date(), id = createId() } = {}) {
  const title = normalizeTitle(input.title);
  if (!title) {
    throw new Error('EMPTY_TITLE');
  }

  const rawDeadline = input.deadline;
  const deadline = normalizeDeadline(rawDeadline);
  if (rawDeadline && !deadline) {
    throw new Error('INVALID_DEADLINE');
  }

  return {
    id,
    title,
    done: false,
    deadline,
    createdAt: now.toISOString(),
    completedAt: null,
  };
}

export function addTask(tasks, input, options = {}) {
  const task = createTask(input, options);
  return { tasks: [...tasks, task], task };
}

export function findTask(tasks, id) {
  return tasks.find((task) => task.id === id) ?? null;
}

export function toggleTask(tasks, id, { now = new Date() } = {}) {
  const target = findTask(tasks, id);
  if (!target) return tasks;

  return tasks.map((task) => {
    if (task.id !== id) return task;
    const done = !task.done;
    return {
      ...task,
      done,
      completedAt: done ? now.toISOString() : null,
    };
  });
}

export function removeTask(tasks, id) {
  return tasks.some((task) => task.id === id)
    ? tasks.filter((task) => task.id !== id)
    : tasks;
}

export function getStats(tasks) {
  const total = tasks.length;
  const done = tasks.filter((task) => task.done).length;
  return {
    total,
    done,
    pending: total - done,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

/**
 * Tasks visible in a tab: "pending" (not done) or "done".
 * Pending is ordered by nearest deadline (no deadline last), then oldest first.
 * Done is ordered by most recently completed first.
 */
export function getVisibleTasks(tasks, tab) {
  const wantDone = tab === 'done';
  const visible = tasks.filter((task) => task.done === wantDone);

  visible.sort((a, b) => {
    if (!wantDone) {
      if (a.deadline && b.deadline) {
        const byDeadline = a.deadline.localeCompare(b.deadline);
        if (byDeadline !== 0) return byDeadline;
      } else if (a.deadline) {
        return -1;
      } else if (b.deadline) {
        return 1;
      }
      return a.createdAt.localeCompare(b.createdAt);
    }

    const byCompletion = (b.completedAt ?? '').localeCompare(a.completedAt ?? '');
    return byCompletion !== 0 ? byCompletion : b.createdAt.localeCompare(a.createdAt);
  });

  return visible;
}

function isIsoDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

/**
 * Parse persisted JSON defensively: malformed payloads yield an empty list and
 * malformed entries are dropped instead of breaking the app.
 */
export function parseStored(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return [];

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const seen = new Set();
  const tasks = [];

  for (const item of data) {
    if (!item || typeof item !== 'object') continue;

    const title = normalizeTitle(item.title);
    const id = typeof item.id === 'string' ? item.id : '';
    if (!title || !id || seen.has(id) || !isIsoDate(item.createdAt)) continue;

    seen.add(id);
    const done = item.done === true;
    const completedAt = done && isIsoDate(item.completedAt) ? item.completedAt : null;

    tasks.push({
      id,
      title,
      done,
      deadline: normalizeDeadline(item.deadline),
      createdAt: item.createdAt,
      completedAt,
    });
  }

  return tasks;
}

export function serializeTasks(tasks) {
  return JSON.stringify(tasks);
}
