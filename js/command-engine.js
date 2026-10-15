/**
 * LUMEN Command Engine — deterministic and independent from speech, UI and OS.
 * This is infrastructure, not the approved command catalogue.
 */
const ID_RE = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*)+$/;
const SLOT_RE = /^\{([a-z][a-z0-9_]*)\}$/;
const CONFIRM = new Set(['подтверждаю', 'да подтверждаю']);
const CANCEL = new Set(['отмена', 'отмени']);
const ONES = new Map(Object.entries({ ноль: 0, один: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10, одиннадцать: 11, двенадцать: 12, тринадцать: 13, четырнадцать: 14, пятнадцать: 15, шестнадцать: 16, семнадцать: 17, восемнадцать: 18, девятнадцать: 19 }));
const TENS = new Map(Object.entries({ двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, шестьдесят: 60, семьдесят: 70, восемьдесят: 80, девяносто: 90 }));

export function normalizeUtterance(text) {
  if (typeof text !== 'string' || text.length > 500) return '';
  return text.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')
    .replace(/[.,!?;:«»"'()]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseSpokenInteger(text) {
  const value = normalizeUtterance(text);
  if (/^\d{1,9}$/.test(value)) return Number(value);
  if (value === 'сто') return 100;
  if (ONES.has(value)) return ONES.get(value);
  if (TENS.has(value)) return TENS.get(value);
  const pair = value.split(' ');
  if (pair.length === 2 && TENS.has(pair[0]) && ONES.has(pair[1]) && ONES.get(pair[1]) > 0 && ONES.get(pair[1]) < 10) {
    return TENS.get(pair[0]) + ONES.get(pair[1]);
  }
  return null;
}

const escapeRegExp = text => text.replace(/[$.*+?^{}()|[\]\\]/g, '\\$&');

function readParameter(raw, schema) {
  if (schema.type === 'integer') {
    const n = parseSpokenInteger(raw);
    return n !== null && Number.isInteger(n) && n >= schema.min && n <= schema.max ? { valid: true, value: n } : { valid: false };
  }
  const value = normalizeUtterance(raw);
  if (schema.type === 'text') return value && value.length <= schema.maxLength ? { valid: true, value } : { valid: false };
  if (schema.type === 'enum') {
    for (const [canonical, aliases] of Object.entries(schema.options)) {
      if ([canonical, ...aliases].some(alias => normalizeUtterance(alias) === value)) return { valid: true, value: canonical };
    }
    return { valid: false };
  }
  return { valid: false };
}

/** Validate the registry at startup. Patterns are anchored and slot names are standalone words. */
export function compileRegistry(definitions) {
  if (!Array.isArray(definitions)) throw new TypeError('Definitions must be an array');
  const ids = new Set();
  const patterns = new Set();
  const compiled = [];
  for (const definition of definitions) {
    if (!definition || !ID_RE.test(definition.id || '') || ids.has(definition.id)) throw new Error('Duplicate or invalid command id');
    ids.add(definition.id);
    if (typeof definition.title !== 'string' || !definition.title.trim() || typeof definition.capability !== 'string' || !definition.capability.trim()) throw new Error('Invalid metadata: ' + definition.id);
    if (!['none', 'required'].includes(definition.confirmation)) throw new Error('Invalid confirmation policy: ' + definition.id);
    if (definition.confirmation === 'required' && typeof definition.confirmationText !== 'function') throw new Error('Missing confirmation text: ' + definition.id);
    if (!Array.isArray(definition.patterns) || !definition.patterns.length) throw new Error('No phrases: ' + definition.id);
    const parameters = definition.parameters || {};
    for (const [name, schema] of Object.entries(parameters)) {
      if (!/^[a-z][a-z0-9_]*$/.test(name) || !schema || !['integer', 'text', 'enum'].includes(schema.type)) throw new Error('Invalid parameter: ' + name);
      if (schema.type === 'integer' && (!Number.isInteger(schema.min) || !Number.isInteger(schema.max) || schema.min < 0 || schema.max > 999999999 || schema.min > schema.max)) throw new Error('Invalid integer range: ' + name);
      if (schema.type === 'text' && (!Number.isInteger(schema.maxLength) || schema.maxLength < 1 || schema.maxLength > 500)) throw new Error('Invalid text limit: ' + name);
      if (schema.type === 'enum' && (!schema.options || !Object.keys(schema.options).length || Object.values(schema.options).some(a => !Array.isArray(a) || a.some(x => typeof x !== 'string')))) throw new Error('Invalid enum: ' + name);
    }
    const seenSlots = new Set();
    for (const pattern of definition.patterns) {
      if (typeof pattern !== 'string' || !pattern.trim()) throw new Error('Empty pattern');
      const tokens = pattern.trim().split(/\s+/);
      const slots = [];
      const source = tokens.map(token => {
        const match = token.match(SLOT_RE);
        if (match) {
          const name = match[1];
          if (!Object.hasOwn(parameters, name) || slots.includes(name)) throw new Error('Unknown or repeated slot: ' + name);
          slots.push(name); seenSlots.add(name);
          return '(.+?)';
        }
        const normalized = normalizeUtterance(token);
        if (!normalized || normalized.includes(' ') || token.includes('{') || token.includes('}')) throw new Error('Invalid token: ' + token);
        return escapeRegExp(normalized);
      }).join('\\s+');
      const signature = source;
      if (patterns.has(signature)) throw new Error('Colliding phrase: ' + pattern);
      patterns.add(signature);
      compiled.push({ definition, regexp: new RegExp('^' + source + '$', 'u'), slots, score: (tokens.length - slots.length) * 100 + tokens.filter(token => !SLOT_RE.test(token)).join('').length });
    }
    if (Object.keys(parameters).some(key => !seenSlots.has(key))) throw new Error('Unused parameter: ' + definition.id);
  }
  return Object.freeze(compiled);
}

export function matchCommand(compiled, utterance) {
  const value = normalizeUtterance(utterance);
  if (!value) return { status: 'unknown' };
  const candidates = [];
  let invalid = false;
  for (const entry of compiled) {
    const found = value.match(entry.regexp);
    if (!found) continue;
    const args = {};
    let valid = true;
    entry.slots.forEach((name, index) => {
      const parsed = readParameter(found[index + 1], entry.definition.parameters[name]);
      if (!parsed.valid) valid = false;
      else args[name] = parsed.value;
    });
    if (valid) candidates.push({ entry, args }); else invalid = true;
  }
  if (!candidates.length) return { status: invalid ? 'invalid_parameters' : 'unknown' };
  candidates.sort((a, b) => b.entry.score - a.entry.score);
  const best = candidates[0];
  if (candidates.some(other => other.entry.score === best.entry.score && other.entry.definition.id !== best.entry.definition.id)) return { status: 'ambiguous' };
  return { status: 'matched', commandId: best.entry.definition.id, definition: best.entry.definition, args: Object.freeze(best.args) };
}

/** Capabilities and permissions are deny-by-default. A handler must report ok:true. */
export function createCommandEngine({ definitions = [], handlers = {}, capabilities = [], permissions = [], now = () => Date.now(), confirmationWindowMs = 30000 } = {}) {
  const registry = compileRegistry(definitions);
  const available = new Set(capabilities);
  const allowed = new Set(permissions);
  if (!Number.isFinite(confirmationWindowMs) || confirmationWindowMs <= 0) throw new Error('Invalid confirmation timeout');
  let pending = null;
  const response = (status, text, extra = {}) => ({ status, text, ...extra });
  const check = definition => {
    if (!available.has(definition.capability) || typeof handlers[definition.id] !== 'function') return response('unsupported', 'Эта функция пока недоступна на данном устройстве.');
    if (!allowed.has(definition.capability)) return response('forbidden', 'Для этого действия не выдано разрешение.');
    return null;
  };
  async function execute(match) {
    try {
      const result = await handlers[match.commandId](match.args);
      if (!result || result.ok !== true || typeof result.message !== 'string' || !result.message.trim()) return response('failed', 'Действие не подтверждено системой.');
      return response('success', result.message, { commandId: match.commandId, args: match.args });
    } catch {
      return response('failed', 'Не удалось выполнить действие.');
    }
  }
  return {
    async handle(utterance) {
      const value = normalizeUtterance(utterance);
      if (pending) {
        const previous = pending;
        pending = null;
        if (CANCEL.has(value)) return response('cancelled', 'Действие отменено.');
        if (CONFIRM.has(value)) {
          if (now() > previous.expiresAt) return response('expired', 'Время подтверждения истекло. Повторите запрос.');
          const denied = check(previous.match.definition);
          return denied || execute(previous.match);
        }
        // A different utterance replaces the pending request, never confirming it.
      }
      if (CONFIRM.has(value) || CANCEL.has(value)) return response('unknown', 'Нет действия, ожидающего подтверждения.');
      const match = matchCommand(registry, value);
      if (match.status === 'unknown') return response('unknown', 'Не распознала команду. Попробуйте переформулировать.');
      if (match.status === 'invalid_parameters') return response('invalid_parameters', 'Не удалось разобрать параметры команды.');
      if (match.status === 'ambiguous') return response('ambiguous', 'Команда неоднозначна. Пожалуйста, уточните действие.');
      const denied = check(match.definition);
      if (denied) return denied;
      if (match.definition.confirmation === 'required') {
        let description;
        try { description = match.definition.confirmationText(match.args); } catch { return response('failed', 'Не удалось подготовить подтверждение.'); }
        if (typeof description !== 'string' || !description.trim()) return response('failed', 'Не удалось подготовить подтверждение.');
        pending = { match, expiresAt: now() + confirmationWindowMs };
        return response('pending_confirmation', description + ' Скажите «Подтверждаю» или «Отмена».', { commandId: match.commandId, args: match.args });
      }
      return execute(match);
    },
    cancelPending() { pending = null; },
    hasPending() { return pending !== null && now() <= pending.expiresAt; }
  };
}
