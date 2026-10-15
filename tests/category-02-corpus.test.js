import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeUtterance } from '../js/command-engine.js';

// Design corpus regression. This does not assert that the Desktop OS skills exist.
const corpus = JSON.parse(readFileSync(new URL('../data/command-category-02-examples.json', import.meta.url), 'utf8'));
const commands = corpus.groups.flatMap(group => group.items);
const positive = commands.flatMap(command => command.examples.map(utterance => ({ id: command.id, utterance })));

test('category 02 has complete stable unique IDs and explicit confirmation policy', () => {
  assert.equal(corpus.schema, 1);
  assert.equal(corpus.status, 'approved-design-not-implemented');
  assert.equal(commands.length, 26);
  assert.equal(new Set(commands.map(item => item.id)).size, commands.length);
  for (const item of commands) {
    assert.match(item.id, /^(app|window|system)\.[a-z_]+$/);
    assert.equal(typeof item.confirmation, 'boolean');
    assert.ok(item.purpose.trim());
    assert.ok(item.examples.length >= 6);
  }
  for (const id of ['system.sleep','system.shutdown','system.restart','system.signout']) {
    assert.equal(commands.find(item => item.id === id)?.confirmation, true);
  }
  assert.equal(commands.find(item => item.id === 'system.lock')?.confirmation, false);
});

test('210 positive variants are bounded, distinct and do not collide across commands', () => {
  assert.equal(positive.length, 210);
  const seen = new Map();
  for (const entry of positive) {
    assert.ok(entry.utterance.length > 0 && entry.utterance.length <= 500);
    const normalized = normalizeUtterance(entry.utterance);
    assert.ok(normalized);
    assert.equal(seen.has(normalized), false, 'collision: ' + entry.utterance + ' vs ' + seen.get(normalized));
    seen.set(normalized, entry.id);
  }
});
test('negative phrase corpus stays separate from approved positive examples', () => {
  assert.equal(corpus.negative.length, 14);
  const approved = new Set(positive.map(entry => normalizeUtterance(entry.utterance)));
  for (const entry of corpus.negative) {
    assert.ok(entry.reason.trim());
    assert.equal(approved.has(normalizeUtterance(entry.utterance)), false, 'unsafe overlap: ' + entry.utterance);
  }
});
test('all 4 intended groups remain present', () => {
  assert.deepEqual(corpus.groups.map(g => g.items.length), [8,9,5,4]);
});
