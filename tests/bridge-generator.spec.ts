import { describe, it, expect } from 'vitest';
import { generateAppositive, generateSingleSentence } from '../src/features/manuscript/bridge-generator.js';

describe('bridge generator helpers', () => {
  it('creates appositive commas correctly', () => {
    const app = generateAppositive('Marcus', 'Marcus is team leader');
    expect(app).toContain('team');
    expect(app.startsWith(',')).toBe(true);
  });
  it('creates a single sentence from facts', () => {
    const sent = generateSingleSentence('Marcus', ['team leader', 'explosives expert']);
    expect(/Marcus is/.test(sent)).toBe(true);
    expect(sent).toMatch(/explosives/);
  });
});
