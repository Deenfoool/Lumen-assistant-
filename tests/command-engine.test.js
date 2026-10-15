import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUtterance, parseSpokenInteger, compileRegistry, matchCommand, createCommandEngine } from '../js/command-engine.js';

// TEST FIXTURES ONLY: these are not proposed or approved LUMEN voice commands.
const definitions = [
  { id: 'fixture.volume', title: 'Test volume', capability: 'audio', confirmation: 'none', patterns: ['громкость {level}', 'установи громкость {level} процентов'], parameters: { level: { type: 'integer', min: 0, max: 100 } } },
  { id: 'fixture.open', title: 'Test open', capability: 'browser', confirmation: 'none', patterns: ['открой {target}'], parameters: { target: { type: 'enum', options: { github: ['гитхаб'], youtube: ['ютуб'] } } } },
  { id: 'fixture.shutdown', title: 'Test shutdown', capability: 'system', confirmation: 'required', confirmationText: () => 'Подтвердите тестовое действие выключения.', patterns: ['выключи устройство'] }
];
const registry = compileRegistry(definitions);

test('normalizes text deterministically and bounds input', () => {
  assert.equal(normalizeUtterance('  ЁЖ,  ПРИВЕТ! '), 'еж привет');
  assert.equal(normalizeUtterance('x'.repeat(501)), '');
});
test('parses numbers as digits or spoken Russian without false positives', () => {
  for (const [text, expected] of [['0', 0], ['ноль', 0], ['сто', 100], ['тридцать пять', 35], ['девяносто девять', 99], ['одна', 1]]) assert.equal(parseSpokenInteger(text), expected);
  for (const text of ['сорок сорок', 'тридцать двадцать', '-5', 'пятьдесят сто', 'сто пять']) assert.equal(parseSpokenInteger(text), null);
});
test('matches and validates slot values; exact utterances only', () => {
  assert.equal(matchCommand(registry, 'Громкость тридцать пять!').args.level, 35);
  assert.equal(matchCommand(registry, 'Установи громкость 101 процентов').status, 'invalid_parameters');
  assert.equal(matchCommand(registry, 'открой неизвестный сайт').status, 'invalid_parameters');
  assert.equal(matchCommand(registry, 'громкость 35 и выключи устройство').status, 'invalid_parameters');
  assert.equal(matchCommand(registry, 'открой Гитхаб').args.target, 'github');
});
test('rejects malformed, duplicate and unsafe registries', () => {
  assert.throws(() => compileRegistry([...definitions, definitions[0]]), /id/);
  assert.throws(() => compileRegistry([{ ...definitions[0], id: 'fixture.other', patterns: ['громкость {level}'] }, definitions[0]]), /Colliding/);
  assert.throws(() => compileRegistry([{ ...definitions[0], patterns: ['громкость {missing}'] }]), /Unknown/);
  assert.throws(() => compileRegistry([{ ...definitions[2], confirmationText: undefined }]), /Missing/);
  assert.throws(() => compileRegistry([{ ...definitions[0], parameters: { level: { type: 'integer', min: 0, max: 1000000000 } } }]), /range/);
});
test('capability and permission are denied by default', async () => {
  let calls = 0;
  const handlers = { 'fixture.volume': async () => { calls++; return { ok: true, message: 'changed' }; } };
  const notAvailable = createCommandEngine({ definitions, handlers });
  assert.equal((await notAvailable.handle('громкость 40')).status, 'unsupported');
  const notAllowed = createCommandEngine({ definitions, handlers, capabilities: ['audio'] });
  assert.equal((await notAllowed.handle('громкость 40')).status, 'forbidden');
  assert.equal(calls, 0);
});
test('success requires a verified handler result; errors do not falsely report success', async () => {
  const opts = { definitions, capabilities: ['audio'], permissions: ['audio'] };
  assert.equal((await createCommandEngine({ ...opts, handlers: { 'fixture.volume': () => ({ ok: false, message: 'oops' }) } }).handle('громкость 35')).status, 'failed');
  assert.equal((await createCommandEngine({ ...opts, handlers: { 'fixture.volume': () => { throw Error('private stack'); } } }).handle('громкость 35')).text, 'Не удалось выполнить действие.');
  const result = await createCommandEngine({ ...opts, handlers: { 'fixture.volume': args => ({ ok: true, message: String(args.level) }) } }).handle('громкость сорок пять');
  assert.equal(result.status, 'success'); assert.equal(result.text, '45');
});
test('sensitive actions require explicit confirmation and can be cancelled', async () => {
  let calls = 0;
  const opts = { definitions, capabilities: ['system'], permissions: ['system'], handlers: { 'fixture.shutdown': () => { calls++; return { ok: true, message: 'done' }; } } };
  const engine = createCommandEngine(opts);
  assert.equal((await engine.handle('выключи устройство')).status, 'pending_confirmation');
  assert.equal(calls, 0);
  assert.equal((await engine.handle('да')).status, 'unknown');
  assert.equal(calls, 0);
  assert.equal((await engine.handle('выключи устройство')).status, 'pending_confirmation');
  assert.equal((await engine.handle('отмена')).status, 'cancelled');
  assert.equal(calls, 0);
  assert.equal((await engine.handle('выключи устройство')).status, 'pending_confirmation');
  assert.equal((await engine.handle('подтверждаю')).status, 'success');
  assert.equal(calls, 1);
  assert.equal((await engine.handle('подтверждаю')).status, 'unknown');
});
test('confirmation expires; new request clears previous pending action', async () => {
  let time = 1000; let calls = 0;
  const engine = createCommandEngine({ definitions, capabilities: ['system','audio'], permissions: ['system','audio'], now: () => time, confirmationWindowMs: 30, handlers: { 'fixture.shutdown': () => { calls++; return { ok: true, message: 'done' }; }, 'fixture.volume': () => ({ ok: true, message: 'volume set' }) } });
  await engine.handle('выключи устройство'); time = 1031;
  assert.equal((await engine.handle('подтверждаю')).status, 'expired');
  assert.equal(calls, 0);
  await engine.handle('выключи устройство');
  assert.equal((await engine.handle('громкость 10')).status, 'success');
  assert.equal((await engine.handle('подтверждаю')).status, 'unknown');
  assert.equal(calls, 0);
});
