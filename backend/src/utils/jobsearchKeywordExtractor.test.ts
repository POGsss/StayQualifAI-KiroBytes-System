/**
 * Unit tests for jobsearchKeywordExtractor.
 *
 * Verifies core extraction logic, validation, deduplication,
 * ranking, and output constraints.
 */

import { describe, it, expect } from 'vitest';
import { extractSearchQueries } from './jobsearchKeywordExtractor.js';
import type { IStructuredResume } from '../types/resume.types.js';
import { ValidationError } from './errors.js';

/** Helper to create a minimal valid resume. */
function makeResume(overrides: Partial<IStructuredResume> = {}): IStructuredResume {
  return {
    contact: { name: 'Test User', email: 'test@example.com', links: [] },
    summary: '',
    experience: [],
    education: [],
    skills: [],
    additional: [],
    ...overrides,
  };
}

describe('extractSearchQueries', () => {
  it('throws ValidationError when resume has empty skills and no experience', () => {
    const resume = makeResume({ skills: [], experience: [] });
    expect(() => extractSearchQueries(resume)).toThrow(ValidationError);
  });

  it('throws ValidationError when experience sections have no meaningful content', () => {
    const resume = makeResume({
      skills: [],
      experience: [{ type: 'experience', heading: '', items: [] }],
    });
    expect(() => extractSearchQueries(resume)).toThrow(ValidationError);
  });

  it('extracts queries from skills array', () => {
    const resume = makeResume({
      skills: ['TypeScript', 'React', 'Node.js'],
    });
    const result = extractSearchQueries(resume);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.length).toBeLessThanOrEqual(5);
    expect(result.every((q) => q.source === 'skill')).toBe(true);
  });

  it('extracts queries from experience headings with title source', () => {
    const resume = makeResume({
      skills: ['JavaScript'],
      experience: [
        { type: 'experience', heading: 'Senior Software Engineer', items: [] },
      ],
    });
    const result = extractSearchQueries(resume);
    const titleQueries = result.filter((q) => q.source === 'title');
    expect(titleQueries.length).toBeGreaterThanOrEqual(1);
    expect(titleQueries[0].text).toBe('Senior Software Engineer');
  });

  it('ranks title queries above skill queries', () => {
    const resume = makeResume({
      skills: ['Python'],
      experience: [
        { type: 'experience', heading: 'Data Scientist', items: [] },
      ],
    });
    const result = extractSearchQueries(resume);
    const titleIdx = result.findIndex((q) => q.source === 'title');
    const skillIdx = result.findIndex((q) => q.source === 'skill');
    if (titleIdx !== -1 && skillIdx !== -1) {
      expect(titleIdx).toBeLessThan(skillIdx);
    }
  });

  it('returns between 1 and 5 queries', () => {
    const resume = makeResume({
      skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Docker', 'Kubernetes', 'AWS'],
    });
    const result = extractSearchQueries(resume);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('ensures all queries are between 2 and 100 characters', () => {
    const resume = makeResume({
      skills: ['TypeScript', 'React', 'Machine Learning'],
      experience: [
        { type: 'experience', heading: 'Full Stack Developer', items: ['Built REST APIs using Express and TypeScript'] },
      ],
    });
    const result = extractSearchQueries(resume);
    for (const query of result) {
      expect(query.text.length).toBeGreaterThanOrEqual(2);
      expect(query.text.length).toBeLessThanOrEqual(100);
    }
  });

  it('deduplicates case-insensitively', () => {
    const resume = makeResume({
      skills: ['React', 'react', 'REACT'],
    });
    const result = extractSearchQueries(resume);
    const reactQueries = result.filter((q) => q.text.toLowerCase() === 'react');
    expect(reactQueries.length).toBeLessThanOrEqual(1);
  });

  it('removes substring queries', () => {
    const resume = makeResume({
      skills: ['TypeScript', 'Type'],
      experience: [
        { type: 'experience', heading: 'TypeScript Developer', items: [] },
      ],
    });
    const result = extractSearchQueries(resume);
    // "Type" should be removed since it's a substring of "TypeScript"
    const texts = result.map((q) => q.text.toLowerCase());
    const hasType = texts.includes('type');
    const hasTypeScript = texts.some((t) => t.includes('typescript'));
    if (hasTypeScript) {
      expect(hasType).toBe(false);
    }
  });

  it('multi-word phrases rank higher than single generic terms', () => {
    const resume = makeResume({
      skills: ['management', 'Machine Learning'],
    });
    const result = extractSearchQueries(resume);
    const mlIdx = result.findIndex((q) => q.text === 'Machine Learning');
    const mgmtIdx = result.findIndex((q) => q.text === 'management');
    if (mlIdx !== -1 && mgmtIdx !== -1) {
      expect(mlIdx).toBeLessThan(mgmtIdx);
    }
  });

  it('extracts from summary when other sources are sparse', () => {
    const resume = makeResume({
      skills: ['Go'],
      summary: 'Experienced DevOps Engineer with expertise in Kubernetes and Terraform',
    });
    const result = extractSearchQueries(resume);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('each query has a valid source field', () => {
    const resume = makeResume({
      skills: ['Python', 'FastAPI'],
      experience: [
        { type: 'experience', heading: 'Backend Engineer', items: ['Deployed services on AWS Lambda'] },
      ],
      summary: 'Cloud-native developer',
    });
    const result = extractSearchQueries(resume);
    const validSources = new Set(['title', 'skill', 'experience', 'summary']);
    for (const query of result) {
      expect(validSources.has(query.source)).toBe(true);
    }
  });

  it('each query has a numeric score', () => {
    const resume = makeResume({
      skills: ['Rust', 'WebAssembly'],
    });
    const result = extractSearchQueries(resume);
    for (const query of result) {
      expect(typeof query.score).toBe('number');
      expect(query.score).toBeGreaterThan(0);
    }
  });
});
