import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPlatform, readRuntimeInfo } from '../js/platform.js';

test('Web is a safe default, with no native actions', async () => {
  assert.equal(detectPlatform({}), 'web');
  assert.deepEqual(await readRuntimeInfo({}), { platform: 'web', label: 'Веб-демо', nativeReady: false, systemActionsEnabled: false });
});
test('Broken native bridge never impersonates a working Desktop app', async () => {
  const env = { __TAURI_INTERNALS__: {}, __TAURI__: {} };
  assert.equal(detectPlatform(env), 'desktop-unavailable');
  assert.equal((await readRuntimeInfo(env)).nativeReady, false);
});
test('Only validated runtime information is accepted', async () => {
  let invoked;
  const env = { __TAURI_INTERNALS__: {}, __TAURI__: { core: { invoke: async name => { invoked = name; return { appName: 'LUMEN', version: '0.3.0', os: 'windows', systemActionsEnabled: false }; } } } };
  const result = await readRuntimeInfo(env);
  assert.equal(invoked, 'runtime_info');
  assert.equal(result.nativeReady, true);
  assert.equal(result.systemActionsEnabled, false);
  assert.equal(result.os, 'windows');
});
test('Native command failures and unexpected capability grants fail closed', async () => {
  for (const invoke of [async () => { throw Error('failed'); }, async () => ({ appName: 'LUMEN', version: '0.3.0', systemActionsEnabled: true })]) {
    const result = await readRuntimeInfo({ __TAURI_INTERNALS__: {}, __TAURI__: { core: { invoke } } });
    assert.equal(result.nativeReady, false);
    assert.equal(result.systemActionsEnabled, false);
  }
});
