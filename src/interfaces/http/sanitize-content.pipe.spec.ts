import { SanitizeContentPipe } from './sanitize-content.pipe.ts';

const pipe = new SanitizeContentPipe();
const meta = { type: 'body' as const, metatype: Object, data: undefined };

describe('SanitizeContentPipe', () => {
  it('strips markup from content', () => {
    const out = pipe.transform({ content: 'hi <b>there</b>' }, meta);
    expect(out.content).toBe('hi there');
  });

  it('reduces a script-only message to the empty string', () => {
    expect(pipe.transform({ content: '<script>alert(1)</script>' }, meta).content).toBe('');
  });

  it('leaves a body without content untouched', () => {
    expect(pipe.transform({ q: 'term' }, meta)).toEqual({ q: 'term' });
  });
});
