'use strict';
// Статический замок (регрессия 2026-10-13): виртуальный роутер index.html обязан
// передавать `headers` в КАЖДУЮ точку вызова handler(). Host-гейт www.js (7da5c99)
// отвечает 403 на запросы без headers — без этого демо молча получало пустой журнал
// (0 задач; после фикса headers в обеих точках — 6 задач/55 строк, headless Chromium).
// Тест не требует браузера: статический разбор index.html.
// Запуск: node --test tests/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Сбалансированный объектный литерал, начинающийся с '{' на позиции i (пропускает строки).
function skipString(s, i) {
  const q = s[i];
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue; }
    if (s[j] === q) return j;
  }
  return s.length;
}
function objectAt(s, i) {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '"' || c === "'" || c === '`') { j = skipString(s, j); continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return s.slice(i, j + 1); }
  }
  return null;
}

test('virtual router: every handler() call site passes an object with headers', () => {
  const sites = [...SRC.matchAll(/(?<![A-Za-z0-9_$.])handler\(/g)];
  assert.ok(sites.length >= 2, 'ожидалось >=2 точек handler(, найдено ' + sites.length);
  for (const m of sites) {
    const open = m.index + m[0].length;
    const after = SRC.slice(open);
    const firstArg = after.trimStart();
    let obj = null, source = '';
    if (firstArg.startsWith('{')) {
      obj = objectAt(SRC, open + (after.length - firstArg.length));
      source = 'inline-объект в ' + JSON.stringify(firstArg.slice(0, 40));
    } else {
      const id = /^([A-Za-z_$][\w$]*)/.exec(firstArg);
      assert.ok(id, 'первый аргумент handler( — не объект и не идентификатор');
      const decl = new RegExp('(?:const|let|var)\\s+' + id[1] + '\\s*=\\s*\\{').exec(SRC);
      assert.ok(decl, 'не найдено объявление ' + id[1]);
      obj = objectAt(SRC, SRC.indexOf('{', decl.index));
      source = 'объект ' + id[1];
    }
    assert.ok(obj, 'не удалось извлечь объект: ' + source);
    assert.match(obj, /\bheaders\s*:/, source + ' обязан содержать headers (Host-гейт www.js даёт 403 без headers)');
  }
});
