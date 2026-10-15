import { replyFor } from './commands.js';
import { detectPlatform } from './platform.js';

const STORAGE_KEY = 'lumen.messages.v1';
const TTS_KEY = 'lumen.tts.v1';
const $ = id => document.getElementById(id);
const messages = $('messages');
const input = $('prompt');
const micButton = $('mic-button');
const voiceStatus = $('voice-status');
const ttsInput = $('tts-enabled');
// The browser provider may process audio externally; Desktop requires separately approved local STT.
const SpeechRecognitionClass = detectPlatform() === 'web' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
let recognizing = false;
let recognition = null;
let log = [];

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  if (Array.isArray(saved)) log = saved.filter(entry => entry && (entry.role === 'user' || entry.role === 'assistant') && typeof entry.text === 'string' && entry.text.length <= 1000 && typeof entry.at === 'number').slice(-50);
  ttsInput.checked = localStorage.getItem(TTS_KEY) === '1' && 'speechSynthesis' in window;
} catch { log = []; }

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(log)); } catch { voiceStatus.textContent = 'Не удалось сохранить историю в этом браузере.'; }
}
function makeMessage(entry) {
  const row = document.createElement('div');
  row.className = 'message ' + entry.role;
  const avatar = document.createElement('span');
  avatar.className = 'avatar';
  avatar.textContent = entry.role === 'assistant' ? '✦' : '●';
  const body = document.createElement('div');
  body.className = 'message-body';
  const label = document.createElement('small');
  label.textContent = entry.role === 'assistant' ? 'Люми' : 'Вы';
  const p = document.createElement('p');
  p.textContent = entry.text;
  body.append(label, p);
  if (entry.link && ['https://github.com/', 'https://www.youtube.com/', 'https://www.google.com/'].includes(entry.link.url)) {
    const a = document.createElement('a');
    a.className = 'message-link';
    a.href = entry.link.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = entry.link.label;
    body.append(a);
  }
  row.append(avatar, body);
  return row;
}
function render() {
  messages.replaceChildren();
  if (!log.length) messages.append(makeMessage({ role: 'assistant', text: 'Привет! Я ранняя версия Люми. Спросите, который час, чем я могу помочь, или попробуйте голосовой ввод.' }));
  else log.forEach(entry => messages.append(makeMessage(entry)));
  messages.scrollTop = messages.scrollHeight;
  const history = $('history-entries');
  history.replaceChildren();
  if (!log.length) {
    const empty = document.createElement('p'); empty.className = 'empty-history'; empty.textContent = 'История пока пуста.'; history.append(empty);
  } else {
    log.forEach(entry => {
      const item = document.createElement('div'); item.className = 'history-entry';
      const label = document.createElement('small');
      label.textContent = (entry.role === 'assistant' ? 'Люми' : 'Вы') + ' · ' + new Date(entry.at).toLocaleString('ru-RU');
      const p = document.createElement('p'); p.textContent = entry.text;
      item.append(label, p); history.append(item);
    });
  }
}
function speak(text) {
  if (!ttsInput.checked || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ru-RU'; utterance.rate = 1; utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}
function send(text) {
  const value = text.trim().slice(0, 500);
  if (!value) return;
  const now = Date.now();
  const response = replyFor(value, new Date(now));
  log.push({ role: 'user', text: value, at: now });
  log.push({ role: 'assistant', text: response.text, link: response.link, at: now + 1 });
  log = log.slice(-50);
  save(); render(); speak(response.text);
  input.value = '';
}
$('composer').addEventListener('submit', event => { event.preventDefault(); send(input.value); });
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => { showView('home'); send(button.dataset.prompt); }));
function showView(name) {
  document.querySelectorAll('.view').forEach(view => { view.hidden = view.id !== 'view-' + name; });
  document.querySelectorAll('[data-view]').forEach(button => {
    const active = button.dataset.view === name;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  $('page-title').textContent = ({ home: 'Люми', history: 'История', settings: 'Настройки' })[name] || 'Люми';
  if (name === 'home') input.focus();
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
function clearMessages() {
  if (!log.length) return;
  if (!window.confirm('Удалить историю диалога из этого браузера?')) return;
  log = []; save(); render();
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
$('clear-chat').addEventListener('click', clearMessages);
$('clear-history').addEventListener('click', clearMessages);
ttsInput.addEventListener('change', () => {
  if (!('speechSynthesis' in window)) { ttsInput.checked = false; voiceStatus.textContent = 'Озвучивание не поддерживается браузером.'; return; }
  try { localStorage.setItem(TTS_KEY, ttsInput.checked ? '1' : '0'); } catch {}
  if (!ttsInput.checked) window.speechSynthesis.cancel();
});
if (!('speechSynthesis' in window)) ttsInput.disabled = true;
$('speech-support').textContent = SpeechRecognitionClass ? 'Распознавание доступно по нажатию на микрофон. В отдельных браузерах запись может обрабатываться внешним провайдером.' : 'Распознавание речи не поддерживается этим браузером. Текстовый ввод доступен.';
if (!SpeechRecognitionClass) {
  micButton.disabled = true; micButton.title = 'Голосовой ввод недоступен в этом браузере';
  micButton.setAttribute('aria-label', micButton.title);
}
micButton.addEventListener('click', () => {
  if (!SpeechRecognitionClass) return;
  if (recognizing) { recognition?.stop(); return; }
  recognition = new SpeechRecognitionClass();
  recognition.lang = 'ru-RU';
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.onresult = event => { const heard = event.results?.[0]?.[0]?.transcript; if (heard) send(heard); };
  recognition.onerror = event => { voiceStatus.textContent = 'Не удалось распознать речь: ' + (event.error || 'ошибка') + '. Можно написать текстом.'; };
  recognition.onend = () => { recognizing = false; micButton.classList.remove('listening'); micButton.setAttribute('aria-pressed', 'false'); };
  try {
    recognition.start();
    recognizing = true; micButton.classList.add('listening'); micButton.setAttribute('aria-pressed', 'true');
    voiceStatus.textContent = 'Слушаю... Нажмите на микрофон повторно, чтобы остановить запись.';
  } catch { voiceStatus.textContent = 'Микрофон недоступен. Проверьте разрешение в браузере.'; }
});
render();