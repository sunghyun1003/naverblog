import test from 'node:test';
import assert from 'node:assert/strict';
import { waitUploadedImage } from '../naver-editor.mjs';

// Execute the browser predicates against an off-screen placeholder and the
// newly uploaded image. No network, browser profile or manuscript is touched.
test('new upload accepts prior lazy placeholders but verifies the visible new image', async () => {
  const imgs = [
    { complete: true, naturalWidth: 1, src: 'data:image/gif;base64,placeholder' },
    { complete: true, naturalWidth: 1220, src: 'https://example.com/footer.jpg' },
  ];
  let scrolled = -1;
  const previous = globalThis.document;
  globalThis.document = { querySelectorAll: () => imgs };
  try {
    assert.equal(imgs.every(img => img.complete && img.naturalWidth > 0 && /^https:\/\//.test(img.src)), false);
    const frame = {
      locator: () => ({ nth: index => ({ scrollIntoViewIfNeeded: async () => { scrolled = index; } }) }),
      waitForFunction: async (fn, count) => assert.equal(fn(count), true),
    };
    await waitUploadedImage(frame, 2);
    assert.equal(scrolled, 1);
    imgs[1].src = 'data:image/gif;base64,placeholder';
    await assert.rejects(() => waitUploadedImage(frame, 2));
    imgs[1].src = 'https://example.com/footer.jpg'; imgs[1].naturalWidth = 0;
    await assert.rejects(() => waitUploadedImage(frame, 2));
    await assert.rejects(() => waitUploadedImage(frame, 3));
  } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
});
