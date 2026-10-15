// This module has no browser or network dependencies and can be tested in Node.
const normalize = input => input.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[!?.,:;]+/g, ' ').replace(/\s+/g, ' ').trim();

export function replyFor(input, now = new Date()) {
  const value = normalize(String(input).slice(0, 500));
  if (!value) return { text: 'Напишите сообщение, и я попробую помочь.' };
  if (/^(люми\s+)?(привет|здравствуй|здравствуйте|доброе утро|добрый день|добрый вечер)$/.test(value)) return { text: 'Привет! Я Люми. Сейчас работаю локально и понимаю несколько простых запросов. Напишите «Что ты умеешь?».' };
  if (/^(что ты умеешь|помощь|команды|что ты можешь|возможности|help)$/.test(value)) return { text: 'Пока я могу подсказать текущее время и дату, показать ссылки на GitHub, YouTube и Google и рассказать о возможностях LUMEN. Голосовой ввод и озвучивание зависят от браузера. Подключения к нейросети и доступа к вашему ПК пока нет.' };
  if (/(который час|сколько времени|текущее время|скажи время)/.test(value)) return { text: 'Сейчас ' + new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(now) + ' по времени вашего устройства.' };
  if (/(какое сегодня число|какая сегодня дата|сегодняшняя дата|какой сегодня день)/.test(value)) return { text: 'Сегодня ' + new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now) + ' (дата вашего устройства).' };
  const sites = [
    { matches: /\b(github|гитхаб|гитхабе)\b/, name: 'GitHub', url: 'https://github.com/' },
    { matches: /\b(youtube|ютуб|ютьюб)\b/, name: 'YouTube', url: 'https://www.youtube.com/' },
    { matches: /\b(google|гугл)\b/, name: 'Google', url: 'https://www.google.com/' }
  ];
  if (/^(открой|открыть|перейди|покажи)\b/.test(value)) {
    const site = sites.find(item => item.matches.test(value));
    if (site) return { text: 'Могу предложить ссылку на ' + site.name + '. Открытие — только по вашему нажатию.', link: { label: 'Открыть ' + site.name, url: site.url } };
    return { text: 'Веб-версия не может запускать программы или открывать произвольные сайты. Управление компьютером запланировано для LUMEN Desktop.' };
  }
  if (/(погода|новости|курс валют)/.test(value)) return { text: 'У меня пока нет доступа к актуальным данным интернета. Не хочу выдавать предположение за свежую информацию.' };
  if (/(музык|песн|звук|компьютер|программ|приложени|выключи|перезагрузи)/.test(value)) return { text: 'Управление устройством и медиасервисами появится в Desktop-версии после внедрения разрешений и подтверждений. На сайте таких прав нет.' };
  if (/(как тебя зовут|кто ты)/.test(value)) return { text: 'Я Люми — будущая персональная помощница проекта LUMEN. Сейчас перед вами ранний локальный прототип, а не подключённый облачный ИИ.' };
  if (/(спасибо|благодарю)/.test(value)) return { text: 'Пожалуйста! ✦' };
  return { text: 'Пока я не умею свободно отвечать на любые вопросы: облачный или локальный ИИ ещё не подключён. Напишите «Что ты умеешь?», чтобы увидеть доступные команды.' };
}