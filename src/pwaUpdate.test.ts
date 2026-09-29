import { describe, expect, it, vi } from 'vitest';
import { watchForUpdates } from './pwaUpdate';

class FakeContainer extends EventTarget {
  controller: object | null;
  registration = { update: vi.fn(() => Promise.resolve()) };
  constructor(controlled: boolean) {
    super();
    this.controller = controlled ? {} : null;
  }
  register = vi.fn(() => Promise.resolve(this.registration));
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('watchForUpdates', () => {
  it('registers the service worker at the given url and scope', async () => {
    const sw = new FakeContainer(true);
    watchForUpdates({
      sw,
      doc: new EventTarget() as unknown as Document,
      url: '/x/sw.js',
      scope: '/x/',
      onUpdate: () => {},
    });
    await flush();
    expect(sw.register).toHaveBeenCalledWith('/x/sw.js', { scope: '/x/' });
  });

  it('reports an update when a new worker takes over a page that already had one', () => {
    const sw = new FakeContainer(true);
    const onUpdate = vi.fn();
    watchForUpdates({
      sw,
      doc: new EventTarget() as unknown as Document,
      url: 'sw.js',
      scope: './',
      onUpdate,
    });
    sw.dispatchEvent(new Event('controllerchange'));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('stays quiet on the very first install (no previous worker: nothing is outdated)', () => {
    const sw = new FakeContainer(false);
    const onUpdate = vi.fn();
    watchForUpdates({
      sw,
      doc: new EventTarget() as unknown as Document,
      url: 'sw.js',
      scope: './',
      onUpdate,
    });
    sw.dispatchEvent(new Event('controllerchange'));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('checks for a new version when the page comes back to the foreground', async () => {
    const sw = new FakeContainer(true);
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' }) as unknown as Document;
    watchForUpdates({ sw, doc, url: 'sw.js', scope: './', onUpdate: () => {} });
    await flush();
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(sw.registration.update).toHaveBeenCalledTimes(1);
  });

  it('does nothing without service worker support', () => {
    expect(() =>
      watchForUpdates({
        sw: undefined,
        doc: new EventTarget() as unknown as Document,
        url: 'sw.js',
        scope: './',
        onUpdate: () => {},
      }),
    ).not.toThrow();
  });
});
