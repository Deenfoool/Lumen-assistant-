import test from 'node:test';
import assert from 'node:assert/strict';
import { replyFor } from '../js/commands.js';

const now = new Date('2026-10-15T06:05:00Z');

test('returns honest capabilities without claiming a model is connected', () => {
  const reply = replyFor('Что ты умеешь?', now);
  assert.match(reply.text, /нет|пока/);
  assert.match(reply.text, /нейросет/);
});
test('time and date use the passed device date', () => {
  assert.match(replyFor('Который час?', now).text, /по времени вашего устройства/);
  assert.match(replyFor('Какая сегодня дата?', now).text, /2026/);
});
test('only whitelisted links are offered after request', () => {
  assert.deepEqual(replyFor('Открой GitHub', now).link, { label: 'Открыть GitHub', url: 'https://github.com/' });
  assert.equal(replyFor('Открой example.com', now).link, undefined);
});
test('unimplemented OS commands are not claimed as working', () => {
  assert.match(replyFor('Выключи компьютер', now).text, /Desktop/);
});
test('unknown requests do not hallucinate general intelligence', () => {
  assert.match(replyFor('Докажи теорему Ферма', now).text, /не умею свободно/);
});
test('input length is bounded and harmless punctuation is normalized', () => {
  assert.match(replyFor('Привет!!!', now).text, /Привет/);
  assert.equal(typeof replyFor('x'.repeat(10000), now).text, 'string');
});