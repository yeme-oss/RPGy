const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('closing a dialog cannot hide the homepage or other full-screen views', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/engine.js'), 'utf8');
  assert.doesNotMatch(source, /querySelectorAll\(['"]\.absolute\.inset-0['"]\)/);
  assert.match(source, /const RPGY_MODAL_IDS = \[/);
  assert.match(source, /'license-modal'/);
  assert.doesNotMatch(source.match(/const RPGY_MODAL_IDS = \[[\s\S]*?\];/)?.[0] || '', /world-browser|constructor-view/);
});
