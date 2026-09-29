// Service worker registration that tells the page when a new version has taken over.

/** The parts of `navigator.serviceWorker` this needs (small, so tests can fake it). */
export interface WorkerContainer {
  controller: unknown;
  register(url: string, options: { scope: string }): Promise<{ update(): Promise<unknown> }>;
  addEventListener(type: 'controllerchange', listener: () => void): void;
}

export interface UpdateWatchOptions {
  sw: WorkerContainer | undefined;
  doc: { visibilityState: string; addEventListener(type: 'visibilitychange', listener: () => void): void };
  url: string;
  scope: string;
  /** A new version now controls the page; the code running in it is the old one until a reload. */
  onUpdate: () => void;
}

/**
 * Registers the service worker. It activates new versions at once (skipWaiting + clientsClaim), so a
 * `controllerchange` on a page that already had a worker means this page is running outdated code.
 */
export function watchForUpdates({ sw, doc, url, scope, onUpdate }: UpdateWatchOptions): void {
  if (!sw) return;
  const hadWorker = sw.controller !== null;
  sw.addEventListener('controllerchange', () => {
    if (hadWorker) onUpdate();
  });
  void sw.register(url, { scope }).then(
    (registration) => {
      // Browsers only look for a new sw.js on navigation; an installed app can stay open for days.
      doc.addEventListener('visibilitychange', () => {
        if (doc.visibilityState === 'visible') void registration.update().catch(() => {});
      });
    },
    () => {
      // No offline support (e.g. private mode): the app still works.
    },
  );
}
