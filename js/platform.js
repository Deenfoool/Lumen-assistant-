/** Shared UI adapter: native commands never become callable on GitHub Pages. */
export function detectPlatform(environment = globalThis) {
  const internals = environment?.__TAURI_INTERNALS__;
  if (!internals) return 'web';
  if (typeof environment?.__TAURI__?.core?.invoke !== 'function') return 'desktop-unavailable';
  return 'desktop';
}

export async function readRuntimeInfo(environment = globalThis) {
  const platform = detectPlatform(environment);
  if (platform === 'web') return { platform: 'web', label: 'Веб-демо', nativeReady: false, systemActionsEnabled: false };
  if (platform !== 'desktop') return { platform, label: 'Desktop · мост недоступен', nativeReady: false, systemActionsEnabled: false };
  try {
    const info = await environment.__TAURI__.core.invoke('runtime_info');
    if (!info || info.appName !== 'LUMEN' || typeof info.version !== 'string' || info.systemActionsEnabled !== false) throw new Error('Invalid native response');
    return { platform: 'desktop', label: 'Desktop · прототип', nativeReady: true, systemActionsEnabled: false, version: info.version, os: info.os };
  } catch {
    return { platform: 'desktop-unavailable', label: 'Desktop · ошибка подключения', nativeReady: false, systemActionsEnabled: false };
  }
}
