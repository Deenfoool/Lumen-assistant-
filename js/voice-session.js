const DEFAULT_CONTINUATION_MS = 15_000;

export function normalizeVoiceText(input) {
  return String(input ?? '').slice(0, 500).normalize('NFKC')
    .toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function parseWakePrefix(text) {
  const match = text.match(/^(?:эй\s+)?люми(?:\s+(.*))?$/u);
  return match ? { command: (match[1] || '').trim() } : null;
}

/** Deterministic coordinator only: no audio capture, ASR/TTS runtime or OS actions. */
export function createVoiceSession(callbacks = {}, options = {}) {
  const continuationMs = Number.isFinite(options.continuationMs) && options.continuationMs >= 0
    ? options.continuationMs : DEFAULT_CONTINUATION_MS;
  const clock = typeof options.now === 'function' ? options.now : () => Date.now();
  const state = {
    micState: 'MIC_OFF', dialogueState: 'IDLE', wakeEnabled: false,
    permissionGranted: false, voiceEnabled: true, volume: 80, speed: 1.0,
    continuationDeadline: null, pendingAction: null, lastResponse: '', lastUtterance: ''
  };
  const snapshot = () => ({ ...state });
  const status = (type, extra = {}) => callbacks.onStatus?.({ type, ...extra, state: snapshot() });
  const stopSpeech = reason => {
    if (state.dialogueState === 'SPEAKING') callbacks.onStopSpeaking?.(reason);
    if (state.dialogueState === 'SPEAKING') state.dialogueState = 'IDLE';
  };
  const cancelPending = reason => {
    if (state.pendingAction === null) return false;
    const pending = state.pendingAction;
    state.pendingAction = null;
    callbacks.onCancelPendingAction?.(pending, reason);
    return true;
  };
  const enterStandby = () => {
    state.dialogueState = 'IDLE';
    state.continuationDeadline = null;
    state.micState = state.wakeEnabled ? 'WAKE_ARMED' : (state.permissionGranted ? 'MANUAL_IDLE' : 'MIC_OFF');
  };
  const respond = (text, at = clock()) => {
    const message = String(text ?? '').trim().slice(0, 500);
    if (!message) return { spoken: false, status: 'empty' };
    state.lastResponse = message;
    callbacks.onResponse?.(message, snapshot());
    if (state.voiceEnabled && typeof callbacks.onSpeak === 'function') {
      state.dialogueState = 'SPEAKING';
      state.continuationDeadline = null;
      callbacks.onSpeak(message, { language: 'ru-RU', volume: state.volume, speed: state.speed });
      status('speaking');
      return { spoken: true, status: 'speaking' };
    }
    state.dialogueState = 'IDLE';
    state.continuationDeadline = state.micState === 'ACTIVE' ? at + continuationMs : null;
    status('text_response', { text: message });
    return { spoken: false, status: 'text_response' };
  };
  const route = (utterance, at) => {
    const text = normalizeVoiceText(utterance);
    if (!text) { respond('Слушаю', at); return { status: 'ready' }; }
    if (/^(?:стоп|замолчи|хватит)$/u.test(text)) {
      stopSpeech('user_stop');
      state.dialogueState = 'IDLE';
      if (state.micState === 'ACTIVE') state.continuationDeadline = at + continuationMs;
      status('speech_stopped');
      return { status: 'speech_stopped', pendingActionPreserved: state.pendingAction !== null };
    }
    if (/^(?:отдыхай|до связи|пока|пока люми)$/u.test(text)) {
      stopSpeech('session_ended');
      cancelPending('session_ended');
      state.dialogueState = 'IDLE';
      state.continuationDeadline = null;
      state.micState = state.wakeEnabled ? 'WAKE_ARMED' : (state.permissionGranted ? 'MANUAL_IDLE' : 'MIC_OFF');
      respond('До связи', at);
      status('session_ended');
      return { status: 'session_ended' };
    }
    if (/^(?:отключи микрофон|не слушай меня)$/u.test(text)) {
      stopSpeech('microphone_disabled');
      cancelPending('microphone_disabled');
      state.wakeEnabled = false;
      state.micState = 'MIC_OFF';
      state.dialogueState = 'IDLE';
      state.continuationDeadline = null;
      respond('Микрофон отключён', at);
      status('microphone_disabled');
      return { status: 'microphone_disabled' };
    }
    if (state.dialogueState === 'SPEAKING') stopSpeech('barge_in');
    state.micState = 'ACTIVE';
    state.dialogueState = 'PROCESSING';
    state.continuationDeadline = null;
    state.lastUtterance = text;
    callbacks.onCommand?.(text, { source: 'voice', state: snapshot() });
    status('command_received', { utterance: text });
    return { status: 'command', utterance: text };
  };
  const handleTranscript = (raw, at = clock()) => {
    const text = normalizeVoiceText(raw);
    if (!text || state.micState === 'MIC_OFF' || state.micState === 'MANUAL_IDLE') return { status: 'ignored' };
    if (state.micState === 'WAKE_ARMED') {
      const wake = parseWakePrefix(text);
      if (!wake) return { status: 'ignored' };
      state.micState = 'ACTIVE';
      state.dialogueState = 'IDLE';
      state.continuationDeadline = null;
      callbacks.onWakeDetected?.({ utterance: text, combinedCommand: Boolean(wake.command) });
      status('wake_detected', { combinedCommand: Boolean(wake.command) });
      if (!wake.command) return { status: 'wake', response: respond('Слушаю', at) };
      return route(wake.command, at);
    }
    if (state.micState !== 'ACTIVE') return { status: 'ignored' };
    if (state.dialogueState === 'IDLE' && state.continuationDeadline !== null && at >= state.continuationDeadline) {
      enterStandby();
      status('session_expired');
      return handleTranscript(text, at);
    }
    const wake = parseWakePrefix(text);
    return route(wake ? wake.command : text, at);
  };

  return {
    snapshot,
    enableWake(permissionGranted) {
      state.permissionGranted = Boolean(permissionGranted);
      if (!state.permissionGranted) {
        state.wakeEnabled = false; state.micState = 'MIC_OFF'; state.dialogueState = 'IDLE'; state.continuationDeadline = null;
        status('permission_required');
        return { ok: false, reason: 'microphone_permission_required' };
      }
      state.wakeEnabled = true; state.micState = 'WAKE_ARMED'; state.dialogueState = 'IDLE'; state.continuationDeadline = null;
      status('wake_armed');
      return { ok: true };
    },
    disableWake() {
      state.wakeEnabled = false;
      if (state.micState === 'WAKE_ARMED') state.micState = state.permissionGranted ? 'MANUAL_IDLE' : 'MIC_OFF';
      status('wake_disabled');
      return snapshot();
    },
    manualActivate(permissionGranted = state.permissionGranted) {
      state.permissionGranted = Boolean(permissionGranted);
      if (!state.permissionGranted) {
        state.micState = 'MIC_OFF'; state.dialogueState = 'IDLE'; state.continuationDeadline = null;
        status('permission_required');
        return { ok: false, reason: 'microphone_permission_required' };
      }
      state.wakeEnabled = false; state.micState = 'ACTIVE'; state.dialogueState = 'LISTENING'; state.continuationDeadline = null;
      status('manual_listening');
      return { ok: true };
    },
    setMicrophonePermission(granted) {
      state.permissionGranted = Boolean(granted);
      if (!state.permissionGranted) {
        stopSpeech('permission_revoked'); cancelPending('permission_revoked');
        state.wakeEnabled = false; state.micState = 'MIC_OFF'; state.dialogueState = 'IDLE'; state.continuationDeadline = null;
      }
      status(state.permissionGranted ? 'permission_granted' : 'permission_revoked');
      return snapshot();
    },
    disableMicrophone(at = clock()) {
      stopSpeech('microphone_disabled'); cancelPending('microphone_disabled');
      state.wakeEnabled = false; state.micState = 'MIC_OFF'; state.dialogueState = 'IDLE'; state.continuationDeadline = null;
      respond('Микрофон отключён', at);
      status('microphone_disabled');
      return snapshot();
    },
    handleTranscript,
    respond,
    finishSpeaking(at = clock()) {
      if (state.dialogueState !== 'SPEAKING') return snapshot();
      state.dialogueState = 'IDLE';
      state.continuationDeadline = state.micState === 'ACTIVE' ? at + continuationMs : null;
      status('response_finished');
      return snapshot();
    },
    interruptSpeech(at = clock()) {
      stopSpeech('barge_in');
      if (state.micState === 'ACTIVE') state.continuationDeadline = at + continuationMs;
      status('speech_interrupted');
      return snapshot();
    },
    tick(at = clock()) {
      if (state.micState === 'ACTIVE' && state.dialogueState === 'IDLE' && state.continuationDeadline !== null && at >= state.continuationDeadline) {
        enterStandby(); status('session_expired');
      }
      return snapshot();
    },
    setPendingAction(action) {
      state.pendingAction = action ?? null;
      status(state.pendingAction ? 'pending_action' : 'pending_action_cleared');
      return snapshot();
    },
    cancelPendingAction(reason = 'user_cancelled') {
      const cancelled = cancelPending(reason);
      status(cancelled ? 'pending_action_cancelled' : 'no_pending_action');
      return cancelled;
    },
    setVoiceEnabled(enabled) {
      state.voiceEnabled = Boolean(enabled);
      if (!state.voiceEnabled && state.dialogueState === 'SPEAKING') {
        stopSpeech('voice_muted');
        if (state.micState === 'ACTIVE') state.continuationDeadline = clock() + continuationMs;
      }
      status(state.voiceEnabled ? 'voice_enabled' : 'voice_muted');
      return snapshot();
    },
    setVoiceSettings({ volume = state.volume, speed = state.speed } = {}) {
      state.volume = Math.max(0, Math.min(100, Number.isFinite(volume) ? volume : state.volume));
      state.speed = Math.max(0.5, Math.min(2, Number.isFinite(speed) ? speed : state.speed));
      status('voice_settings_changed');
      return snapshot();
    }
  };
}

export const VOICE_SESSION_DEFAULTS = Object.freeze({
  continuationMs: DEFAULT_CONTINUATION_MS,
  wakePhrases: ['люми', 'эй люми'],
  responseStyle: 'short',
  interruptible: true,
  audioRetention: false
});
