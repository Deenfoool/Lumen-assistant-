import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceSession, normalizeVoiceText, VOICE_SESSION_DEFAULTS } from '../js/voice-session.js';

function setup() {
  const events = { commands: [], speech: [], stopped: [], cancelled: [], wake: [], status: [] };
  const session = createVoiceSession({
    onCommand: text => events.commands.push(text),
    onSpeak: (text, settings) => events.speech.push({ text, settings }),
    onStopSpeaking: reason => events.stopped.push(reason),
    onCancelPendingAction: (action, reason) => events.cancelled.push({ action, reason }),
    onWakeDetected: event => events.wake.push(event),
    onStatus: event => events.status.push(event)
  });
  return { session, events };
}

test('defaults match approved activation, short replies, interruption and 15-second continuation', () => {
  assert.equal(VOICE_SESSION_DEFAULTS.continuationMs, 15000);
  assert.deepEqual(VOICE_SESSION_DEFAULTS.wakePhrases, ['люми', 'эй люми']);
  assert.equal(VOICE_SESSION_DEFAULTS.responseStyle, 'short');
  assert.equal(VOICE_SESSION_DEFAULTS.interruptible, true);
  assert.equal(VOICE_SESSION_DEFAULTS.audioRetention, false);
  assert.equal(createVoiceSession().snapshot().micState, 'MIC_OFF');
});

test('wake requires microphone permission and explicit opt-in', () => {
  const { session, events } = setup();
  assert.deepEqual(session.enableWake(false), { ok: false, reason: 'microphone_permission_required' });
  assert.equal(session.handleTranscript('Люми', 0).status, 'ignored');
  assert.equal(events.commands.length, 0);
  assert.equal(session.enableWake(true).ok, true);
  assert.equal(session.snapshot().micState, 'WAKE_ARMED');
  assert.equal(session.handleTranscript('открой блокнот', 1).status, 'ignored');
  assert.equal(session.handleTranscript('Эй, Люми', 2).status, 'wake');
  assert.equal(events.speech.at(-1).text, 'Слушаю');
});

test('wake phrase and command in one utterance are routed once with prefix removed', () => {
  const { session, events } = setup();
  session.enableWake(true);
  const result = session.handleTranscript('Люми, открой блокнот!', 100);
  assert.deepEqual(result, { status: 'command', utterance: 'открой блокнот' });
  assert.deepEqual(events.commands, ['открой блокнот']);
  assert.equal(session.snapshot().dialogueState, 'PROCESSING');
});

test('wake word is only stripped from the start, never from the middle', () => {
  const { session, events } = setup();
  session.enableWake(true);
  session.manualActivate(true);
  session.handleTranscript('попроси люми открыть блокнот', 10);
  assert.deepEqual(events.commands, ['попроси люми открыть блокнот']);
  assert.equal(normalizeVoiceText('ЛЮМИ, ёж!'), 'люми еж');
});

test('15-second window begins after response ends and then returns to wake standby', () => {
  const { session } = setup();
  session.enableWake(true);
  session.handleTranscript('Люми', 0);
  session.finishSpeaking(1000);
  assert.equal(session.snapshot().continuationDeadline, 16000);
  session.tick(15999);
  assert.equal(session.snapshot().micState, 'ACTIVE');
  session.tick(16000);
  assert.equal(session.snapshot().micState, 'WAKE_ARMED');
});

test('speech can be interrupted without cancelling a pending action', () => {
  const { session, events } = setup();
  session.manualActivate(true);
  session.setPendingAction({ id: 'system.shutdown' });
  session.respond('Выключить компьютер?', 0);
  const result = session.handleTranscript('Стоп', 500);
  assert.equal(result.status, 'speech_stopped');
  assert.equal(session.snapshot().pendingAction.id, 'system.shutdown');
  assert.deepEqual(events.stopped, ['user_stop']);
  assert.equal(events.cancelled.length, 0);
  assert.equal(session.snapshot().continuationDeadline, 15500);
});

test('barge-in stops TTS and routes the new utterance', () => {
  const { session, events } = setup();
  session.manualActivate(true);
  session.respond('Сейчас открою окно', 0);
  session.handleTranscript('отмена', 250);
  assert.deepEqual(events.stopped, ['barge_in']);
  assert.deepEqual(events.commands, ['отмена']);
});

test('goodbye cancels pending action and returns to wake standby', () => {
  const { session, events } = setup();
  session.enableWake(true);
  session.setPendingAction({ id: 'system.shutdown' });
  session.handleTranscript('Люми, пока', 0);
  assert.equal(session.snapshot().pendingAction, null);
  assert.deepEqual(events.cancelled, [{ action: { id: 'system.shutdown' }, reason: 'session_ended' }]);
  assert.equal(session.snapshot().micState, 'WAKE_ARMED');
  assert.equal(events.speech.at(-1).text, 'До связи');
});

test('mic off is distinct from TTS mute and prevents voice reactivation', () => {
  const { session, events } = setup();
  session.enableWake(true);
  session.setPendingAction({ id: 'system.shutdown' });
  session.handleTranscript('Люми, отключи микрофон', 0);
  assert.equal(session.snapshot().micState, 'MIC_OFF');
  assert.equal(session.snapshot().pendingAction, null);
  assert.equal(session.handleTranscript('Люми', 100).status, 'ignored');
  session.setMicrophonePermission(true);
  session.setVoiceEnabled(false);
  assert.equal(session.snapshot().micState, 'MIC_OFF');
  assert.equal(session.snapshot().voiceEnabled, false);
  assert.equal(events.speech.at(-1).text, 'Микрофон отключён');
});

test('voice settings are clamped and never modify mic state', () => {
  const { session } = setup();
  session.manualActivate(true);
  session.setVoiceSettings({ volume: 200, speed: 3 });
  assert.equal(session.snapshot().volume, 100);
  assert.equal(session.snapshot().speed, 2);
  session.setVoiceSettings({ volume: -2, speed: 0.1 });
  assert.equal(session.snapshot().volume, 0);
  assert.equal(session.snapshot().speed, 0.5);
  session.setVoiceEnabled(false);
  assert.equal(session.snapshot().micState, 'ACTIVE');
});

test('permission revocation closes capture, cancels pending work and cannot be bypassed', () => {
  const { session, events } = setup();
  session.enableWake(true);
  session.setPendingAction({ id: 'system.shutdown' });
  session.setMicrophonePermission(false);
  assert.equal(session.snapshot().micState, 'MIC_OFF');
  assert.equal(session.snapshot().wakeEnabled, false);
  assert.equal(session.handleTranscript('Люми, выключи компьютер', 10).status, 'ignored');
  assert.equal(events.cancelled[0].reason, 'permission_revoked');
});
