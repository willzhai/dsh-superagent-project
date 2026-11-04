import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addTask,
  createTask,
  daysUntil,
  formatDeadline,
  getStats,
  getVisibleTasks,
  isValidDateKey,
  normalizeDeadline,
  normalizeTitle,
  parseStored,
  removeTask,
  serializeTasks,
  toggleTask,
  STORAGE_KEY,
} from '../todo-core.js';

const NOW = new Date(2026, 10, 4, 10, 30, 0); // 2026-11-04 10:30 local

function task(id, overrides = {}) {
  return {
    id,
    title: id,
    done: false,
    deadline: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    completedAt: null,
    ...overrides,
  };
}

test('storage key is namespaced and stable', () => {
  assert.equal(STORAGE_KEY, 'nebula-tasks.v1');
});

test('normalizeTitle trims and collapses whitespace', () => {
  assert.equal(normalizeTitle('  写   周报  '), '写 周报');
  assert.equal(normalizeTitle('换行\n内容'), '换行 内容');
  assert.equal(normalizeTitle('   '), '');
  assert.equal(normalizeTitle(null), '');
});

test('normalizeDeadline accepts real calendar dates and rejects the rest', () => {
  assert.equal(normalizeDeadline('2026-11-04'), '2026-11-04');
  assert.equal(normalizeDeadline(' 2024-02-29 '), '2024-02-29');
  assert.equal(normalizeDeadline('2023-02-29'), null);
  assert.equal(normalizeDeadline('2026-13-01'), null);
  assert.equal(normalizeDeadline('2026-11-31'), null);
  assert.equal(normalizeDeadline('2026-1-4'), null);
  assert.equal(normalizeDeadline(''), null);
  assert.equal(normalizeDeadline('not-a-date'), null);
  assert.equal(normalizeDeadline(undefined), null);
});

test('isValidDateKey checks format and real dates', () => {
  assert.equal(isValidDateKey('2026-11-04'), true);
  assert.equal(isValidDateKey('2026-02-30'), false);
  assert.equal(isValidDateKey('2026-11-04T00:00:00Z'), false);
  assert.equal(isValidDateKey(20261104), false);
});

test('createTask normalizes input and applies defaults', () => {
  const created = createTask({ title: '  写周报 ', deadline: '2026-11-05' }, { now: NOW, id: 'abc' });

  assert.deepEqual(created, {
    id: 'abc',
    title: '写周报',
    done: false,
    deadline: '2026-11-05',
    createdAt: NOW.toISOString(),
    completedAt: null,
  });
});

test('createTask makes deadline optional', () => {
  const created = createTask({ title: '无截止日期' }, { now: NOW });
  assert.equal(created.deadline, null);
  assert.ok(created.id.length > 0);
});

test('createTask rejects empty titles and invalid deadlines', () => {
  assert.throws(() => createTask({ title: '   ' }, { now: NOW }), /EMPTY_TITLE/);
  assert.throws(
    () => createTask({ title: '任务', deadline: '2026-02-30' }, { now: NOW }),
    /INVALID_DEADLINE/,
  );
});

test('addTask appends without mutating the original list', () => {
  const before = [task('a')];
  const result = addTask(before, { title: 'b' }, { now: NOW, id: 'b' });

  assert.equal(before.length, 1);
  assert.equal(result.tasks.length, 2);
  assert.equal(result.task.id, 'b');
  assert.equal(result.tasks[1].title, 'b');
});

test('toggleTask marks done and back with completion timestamps', () => {
  const doneAt = new Date(2026, 10, 5, 9, 0, 0);
  const initial = [task('a')];

  const completed = toggleTask(initial, 'a', { now: doneAt });
  assert.equal(completed[0].done, true);
  assert.equal(completed[0].completedAt, doneAt.toISOString());
  assert.equal(initial[0].done, false);
  assert.equal(initial[0].completedAt, null);

  const restored = toggleTask(completed, 'a', { now: NOW });
  assert.equal(restored[0].done, false);
  assert.equal(restored[0].completedAt, null);
});

test('toggleTask ignores unknown ids', () => {
  const initial = [task('a')];
  assert.equal(toggleTask(initial, 'missing'), initial);
});

test('removeTask removes only the matching task', () => {
  const initial = [task('a'), task('b')];
  const result = removeTask(initial, 'a');

  assert.deepEqual(result.map((item) => item.id), ['b']);
  assert.equal(initial.length, 2);
  assert.equal(removeTask(initial, 'missing'), initial);
});

test('getStats reports counts and a rounded completion rate', () => {
  assert.deepEqual(getStats([]), { total: 0, done: 0, pending: 0, percent: 0 });

  const tasks = [
    task('a', { done: true, completedAt: '2026-11-02T00:00:00.000Z' }),
    task('b', { done: true, completedAt: '2026-11-03T00:00:00.000Z' }),
    task('c'),
  ];
  assert.deepEqual(getStats(tasks), { total: 3, done: 2, pending: 1, percent: 67 });
});

test('getVisibleTasks filters by tab and sorts pending by nearest deadline', () => {
  const tasks = [
    task('later', { deadline: '2026-11-20' }),
    task('none', { deadline: null, createdAt: '2026-11-02T00:00:00.000Z' }),
    task('soon', { deadline: '2026-11-05' }),
    task('done', { done: true, completedAt: '2026-11-03T00:00:00.000Z' }),
  ];

  assert.deepEqual(getVisibleTasks(tasks, 'pending').map((item) => item.id), [
    'soon',
    'later',
    'none',
  ]);
  assert.deepEqual(getVisibleTasks(tasks, 'done').map((item) => item.id), ['done']);
});

test('getVisibleTasks breaks pending deadline ties by creation time', () => {
  const tasks = [
    task('newer', { deadline: '2026-11-05', createdAt: '2026-11-02T00:00:00.000Z' }),
    task('older', { deadline: '2026-11-05', createdAt: '2026-11-01T00:00:00.000Z' }),
  ];

  assert.deepEqual(getVisibleTasks(tasks, 'pending').map((item) => item.id), ['older', 'newer']);
});

test('getVisibleTasks sorts done by latest completion first', () => {
  const tasks = [
    task('first', { done: true, completedAt: '2026-11-01T00:00:00.000Z' }),
    task('second', { done: true, completedAt: '2026-11-03T00:00:00.000Z' }),
    task('no-completion', { done: true, completedAt: null }),
  ];

  assert.deepEqual(getVisibleTasks(tasks, 'done').map((item) => item.id), [
    'second',
    'first',
    'no-completion',
  ]);
});

test('daysUntil compares local calendar days', () => {
  assert.equal(daysUntil('2026-11-04', NOW), 0);
  assert.equal(daysUntil('2026-11-05', NOW), 1);
  assert.equal(daysUntil('2026-11-03', NOW), -1);
  assert.equal(daysUntil('2026-12-04', NOW), 30);
});

test('formatDeadline covers overdue, today, soon, upcoming and far dates', () => {
  assert.deepEqual(formatDeadline('2026-11-03', NOW), {
    label: '已逾期 1 天',
    tone: 'overdue',
    diff: -1,
  });
  assert.deepEqual(formatDeadline('2026-11-04', NOW), {
    label: '今天到期',
    tone: 'today',
    diff: 0,
  });
  assert.deepEqual(formatDeadline('2026-11-05', NOW), {
    label: '明天到期',
    tone: 'soon',
    diff: 1,
  });
  assert.deepEqual(formatDeadline('2026-11-07', NOW), {
    label: '3 天后到期',
    tone: 'soon',
    diff: 3,
  });
  assert.deepEqual(formatDeadline('2026-11-10', NOW), {
    label: '6 天后到期',
    tone: 'upcoming',
    diff: 6,
  });
  assert.deepEqual(formatDeadline('2026-12-20', NOW), {
    label: '12 月 20 日到期',
    tone: 'normal',
    diff: 46,
  });
  assert.deepEqual(formatDeadline('2027-01-02', NOW), {
    label: '2027 年 1 月 2 日到期',
    tone: 'normal',
    diff: 59,
  });
  assert.equal(formatDeadline('not-a-date', NOW), null);
});

test('parseStored tolerates corrupt payloads', () => {
  assert.deepEqual(parseStored(''), []);
  assert.deepEqual(parseStored(null), []);
  assert.deepEqual(parseStored('{oops'), []);
  assert.deepEqual(parseStored('{"tasks":[]}'), []);
});

test('parseStored drops malformed and duplicate entries', () => {
  const raw = JSON.stringify([
    {
      id: 'a',
      title: '  有效任务 ',
      done: false,
      deadline: '2026-11-05',
      createdAt: '2026-11-01T00:00:00.000Z',
      completedAt: null,
    },
    { id: 'a', title: '重复 id', createdAt: '2026-11-01T00:00:00.000Z' },
    { id: 'b', title: '   ', createdAt: '2026-11-01T00:00:00.000Z' },
    { id: 'c', title: '无创建时间' },
    { id: 'd', title: '坏 deadline', deadline: '2026-02-30', createdAt: '2026-11-01T00:00:00.000Z' },
    null,
    'nope',
  ]);

  const parsed = parseStored(raw);
  assert.deepEqual(parsed, [
    {
      id: 'a',
      title: '有效任务',
      done: false,
      deadline: '2026-11-05',
      createdAt: '2026-11-01T00:00:00.000Z',
      completedAt: null,
    },
    {
      id: 'd',
      title: '坏 deadline',
      done: false,
      deadline: null,
      createdAt: '2026-11-01T00:00:00.000Z',
      completedAt: null,
    },
  ]);
});

test('parseStored normalizes done tasks without completion timestamps', () => {
  const [parsed] = parseStored(
    JSON.stringify([
      {
        id: 'a',
        title: 'done',
        done: true,
        deadline: null,
        createdAt: '2026-11-01T00:00:00.000Z',
        completedAt: 'garbage',
      },
    ]),
  );

  assert.equal(parsed.done, true);
  assert.equal(parsed.completedAt, null);
});

test('serializeTasks round-trips through parseStored', () => {
  const tasks = [
    task('a', { deadline: '2026-11-05' }),
    task('b', { done: true, completedAt: '2026-11-03T00:00:00.000Z' }),
  ];

  assert.deepEqual(parseStored(serializeTasks(tasks)), tasks);
});
