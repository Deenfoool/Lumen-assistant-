import { readRuntimeInfo } from './platform.js';

const pill = document.querySelector('.mode-pill');
readRuntimeInfo().then(info => {
  if (!pill) return;
  const dot = document.createElement('i');
  dot.setAttribute('aria-hidden', 'true');
  pill.replaceChildren(dot, document.createTextNode(' ' + info.label));
  pill.title = info.platform === 'web'
    ? 'Веб-демо не управляет системой Windows'
    : info.nativeReady
      ? 'Нативная оболочка подключена. Системные команды пока отключены.'
      : 'Нативный мост недоступен. Системные команды отключены.';
  const version = document.querySelector('.sidebar-foot strong');
  if (version && info.nativeReady && info.version) version.textContent = info.version;
  if (info.platform !== 'web') {
    // Web Speech API may send audio to a browser provider. Do not silently enable it in Desktop.
    const mic = document.getElementById('mic-button');
    if (mic) {
      mic.disabled = true;
      mic.title = 'Локальный голосовой движок Desktop пока не подключён';
      mic.setAttribute('aria-label', mic.title);
    }
    const voiceStatus = document.getElementById('voice-status');
    if (voiceStatus) voiceStatus.textContent = 'Локальный голосовой движок Desktop ещё не подключён. Пока используйте текст.';
    const support = document.getElementById('speech-support');
    if (support) support.textContent = 'Локальный Desktop STT в разработке. Встроенное распознавание браузера здесь отключено.';
    const voiceFeature = document.querySelectorAll('.feature')[1];
    if (voiceFeature) {
      const subtitle = voiceFeature.querySelector('small');
      const marker = voiceFeature.querySelector('b');
      if (subtitle) subtitle.textContent = 'Локальный Desktop STT в разработке';
      if (marker) { marker.textContent = '—'; marker.classList.remove('ready'); }
    }
  }
});
