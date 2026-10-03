import { describe, expect, it } from 'vitest';
import { projectName } from '../src/index.js';

describe('MalLedgerCore', () => {
  it('loads the project successfully', () => {
    expect(projectName).toBe('MalLedgerCore');
  });
});
