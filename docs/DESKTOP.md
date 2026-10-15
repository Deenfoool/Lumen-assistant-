# LUMEN Desktop 0.3.1 — Tauri 2 foundation

Это **исходный каркас**, а не подтверждённый установщик: сборка Windows/NSIS и реальный запуск WebView2 должны быть проверены на Windows. Веб-демо GitHub Pages использует те же HTML/CSS/JS из корня проекта и не содержит native-команд.

## Требования на Windows

- Node.js 20+, npm.
- Rust stable (rustup, MSVC toolchain).
- Microsoft C++ Build Tools с опцией Desktop development with C++.
- Microsoft Edge WebView2 Runtime (обычно уже установлен в современных Windows).
- NSIS-пакет создаётся встроенным Tauri bundler в процессе `tauri build`; Интернет может понадобиться для установки зависимостей и инструментов.

Официальная документация: https://v2.tauri.app/start/prerequisites/ и https://v2.tauri.app/start/create-project/.

## Запуск в PowerShell (из корня репозитория)

```powershell
npm install
npm test
npm run desktop:dev
```

Tauri автоматически вызывает `npm run build:web` и встроенным dev-сервером отдаёт `../dist`; отдельный HTTP-сервер не требуется. Для сборки установщика:

```powershell
npm run desktop:build
```

Цель NSIS на Windows. После первой успешной сборки появится файл установщика в `src-tauri/target/release/bundle/nsis/`. **Пока в репозитории нет проверенного EXE**; не указывать этот путь как готовую загрузку.

## Сборка общего UI

`npm run build:web` копирует только разрешённые assets в `dist/`. `dist/` в .gitignore. Включены лишь текущие HTML/CSS/JS, favicon и `docs/ROADMAP.md` (только потому, что ссылка на него находится в UI). Rust, данные корпуса команд, тесты, другие docs, API-ключи и исходники бэкенда в bundle не копируются. GitHub Pages продолжает работать из `main / (root)`; GitHub Actions не используются.

## Подключение native-моста

В `src-tauri/src/lib.rs` зарегистрирована ровно одна команда `runtime_info`, которая возвращает имя, версию, платформу и `systemActionsEnabled: false`. Это проверка IPC, не реальное управление компьютером. `js/platform.js` возвращает тип платформы и закрывает native-возможности при любой ошибке. `js/platform-ui.js` показывает корректный статус в общем интерфейсе.

Desktop версия **явно отключает** использование Web Speech API до подключения собственного локального STT, поскольку браузерная реализация может использовать внешний провайдер. Нет wake-word, доступа к системным действиям и генеративного ИИ. В `src-tauri/capabilities/main.json` пока не выданы разрешения shell/FS/process/power.

Требуется последующая реализация категорий 01 и 02 с тестами конечных состояний, прав и реальных OS-адаптеров до того, как интерфейс предложит такие функции как доступные.
