import { describe, it, expect } from 'vitest';
import {
  normalizeForComparison,
  isListingDuplicate,
  mergeDuplicateListings,
} from './jobsearchDedup.js';
import type { IListing, IListingIngestInput } from '../types/jobsearch.types.js';

describe('normalizeForComparison', () => {
  it('converts to lowercase', () => {
    expect(normalizeForComparison('Google')).toBe('google');
    expect(normalizeForComparison('SENIOR ENGINEER')).toBe('senior engineer');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeForComparison('  Google  ')).toBe('google');
    expect(normalizeForComparison('\t hello \n')).toBe('hello');
  });

  it('collapses consecutive internal whitespace to a single space', () => {
    expect(normalizeForComparison('New   York   City')).toBe('new york city');
    expect(normalizeForComparison('a\t\tb')).toBe('a b');
  });

  it('handles empty string', () => {
    expect(normalizeForComparison('')).toBe('');
  });

  it('handles string with only whitespace', () => {
    expect(normalizeForComparison('   ')).toBe('');
  });

  it('is idempotent', () => {
    const input = '  Hello   World  ';
    const once = normalizeForComparison(input);
    const twice = normalizeForComparison(once);
    expect(once).toBe(twice);
  });
});

describe('isListingDuplicate', () => {
  it('returns true when normalized company, title, and location match', () => {
    const existing = { company: 'Google', title: 'Software Engineer', location: 'New York' };
    const incoming = { company: '  google ', title: 'software   engineer', location: 'new  york' };
    expect(isListingDuplicate(existing, incoming)).toBe(true);
  });

  it('returns false when company differs', () => {
    const existing = { company: 'Google', title: 'Software Engineer', location: 'New York' };
    const incoming = { company: 'Meta', title: 'Software Engineer', location: 'New York' };
    expect(isListingDuplicate(existing, incoming)).toBe(false);
  });

  it('returns false when title differs', () => {
    const existing = { company: 'Google', title: 'Software Engineer', location: 'New York' };
    const incoming = { company: 'Google', title: 'Product Manager', location: 'New York' };
    expect(isListingDuplicate(existing, incoming)).toBe(false);
  });

  it('returns false when location differs', () => {
    const existing = { company: 'Google', title: 'Software Engineer', location: 'New York' };
    const incoming = { company: 'Google', title: 'Software Engineer', location: 'San Francisco' };
    expect(isListingDuplicate(existing, incoming)).toBe(false);
  });

  it('is symmetric', () => {
    const a = { company: 'Google', title: 'SWE', location: 'NYC' };
    const b = { company: '  GOOGLE', title: 'swe  ', location: ' nyc ' };
    expect(isListingDuplicate(a, b)).toBe(isListingDuplicate(b, a));
  });
});

describe('mergeDuplicateListings', () => {
  const baseExisting: IListing = {
    id: 'existing-id-123',
    title: 'Software Engineer',
    company: 'Google',
    location: 'New York',
    workMode: 'Remote',
    description: 'Old description',
    sourceUrls: ['https://source1.com/job/123'],
    salaryMin: 100000,
    salaryMax: 150000,
    datePosted: '2024-01-01T00:00:00.000Z',
    dateScraped: '2024-01-15T00:00:00.000Z',
  };

  const baseIncoming: IListingIngestInput = {
    title: 'Software Engineer',
    company: 'Google',
    location: 'New York',
    workMode: 'Remote',
    description: 'New description',
    sourceUrl: 'https://source2.com/job/456',
    salaryMin: 110000,
    salaryMax: 160000,
    datePosted: '2024-01-05T00:00:00.000Z',
  };

  it('retains the existing listing id', () => {
    const merged = mergeDuplicateListings(baseExisting, baseIncoming);
    expect(merged.id).toBe('existing-id-123');
  });

  it('retains the earliest datePosted', () => {
    const merged = mergeDuplicateListings(baseExisting, baseIncoming);
    expect(merged.datePosted).toBe('2024-01-01T00:00:00.000Z');
  });

  it('uses incoming datePosted when it is earlier', () => {
    const existing = { ...baseExisting, datePosted: '2024-02-01T00:00:00.000Z' };
    const incoming = { ...baseIncoming, datePosted: '2024-01-01T00:00:00.000Z' };
    const merged = mergeDuplicateListings(existing, incoming);
    expect(merged.datePosted).toBe('2024-01-01T00:00:00.000Z');
  });

  it('appends incoming sourceUrl to sourceUrls', () => {
    const merged = mergeDuplicateListings(baseExisting, baseIncoming);
    expect(merged.sourceUrls).toContain('https://source1.com/job/123');
    expect(merged.sourceUrls).toContain('https://source2.com/job/456');
    expect(merged.sourceUrls).toHaveLength(2);
  });

  it('does not duplicate sourceUrl if already present', () => {
    const incoming = { ...baseIncoming, sourceUrl: 'https://source1.com/job/123' };
    const merged = mergeDuplicateListings(baseExisting, incoming);
    expect(merged.sourceUrls).toHaveLength(1);
    expect(merged.sourceUrls).toContain('https://source1.com/job/123');
  });

  it('uses the incoming description (most recent scrape)', () => {
    const merged = mergeDuplicateListings(baseExisting, baseIncoming);
    expect(merged.description).toBe('New description');
  });

  it('uses the incoming salary values (most recent scrape)', () => {
    const merged = mergeDuplicateListings(baseExisting, baseIncoming);
    expect(merged.salaryMin).toBe(110000);
    expect(merged.salaryMax).toBe(160000);
  });

  it('sets salaryMin/Max to null when incoming has no salary', () => {
    const incoming = { ...baseIncoming, salaryMin: undefined, salaryMax: undefined };
    const merged = mergeDuplicateListings(baseExisting, incoming);
    expect(merged.salaryMin).toBeNull();
    expect(merged.salaryMax).toBeNull();
  });

  it('updates dateScraped to now', () => {
    const before = new Date().toISOString();
    const merged = mergeDuplicateListings(baseExisting, baseIncoming);
    const after = new Date().toISOString();
    expect(merged.dateScraped >= before).toBe(true);
    expect(merged.dateScraped <= after).toBe(true);
  });
});
