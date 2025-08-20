import { describe, it, expect } from 'vitest';
import { buildPublicId, toLabel, htmlEscape } from '../reveal-id.js';

describe('reveal-id helpers', () => {
  it('buildPublicId formats with leading zeros', () => {
    expect(buildPublicId('ch17_s01', 0)).toBe('R-ch17_s01-01');
    expect(buildPublicId('ch17_s01', 9)).toBe('R-ch17_s01-10');
  });

  it('toLabel truncates after 8 words with ellipsis', () => {
    const text = 'This is Agent Fiona Gile from the northern enclave speaking';
    const label = toLabel(text, 8);
    expect(label).toBe('This is Agent Fiona Gile from the northern…');
  });

  it('toLabel leaves short sentences intact', () => {
    const text = 'Short reveal here';
    expect(toLabel(text, 8)).toBe('Short reveal here');
  });

  it('htmlEscape escapes critical chars', () => {
    expect(htmlEscape(`Tom & Jerry < " ' >`)).toBe('Tom &amp; Jerry &lt; &quot; &#39; &gt;');
  });
});
