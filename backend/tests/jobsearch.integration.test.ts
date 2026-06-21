/**
 * Job Search Module — Backend Integration Tests
 *
 * Tests end-to-end flows through the service layer with mocked Supabase and
 * AI provider dependencies. Validates:
 *   - Full listing ingest with deduplication (Requirements 3.1, 3.2)
 *   - AI cover letter generation within timeout and word count (Requirements 6.1, 6.3)
 *   - LinkedIn outreach message ≤300 chars (Requirements 7.1, 7.2)
 *   - Follow-up email generation within timeout (Requirement 8.1)
 *   - Database error during dedup rejects ingestion (Requirement 3.6)
 *   - Stage update failure handling (Requirement 4.6)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ingestListing } from '../src/services/jobsearchListing.service.js';
import { updateStage } from '../src/services/jobsearchTracker.service.js';
import {
  generateCoverLetter,
  generateLinkedInOutreach,
  generateFollowUpEmail,
} from '../src/services/jobsearchAiWriter.service.js';
import { InternalError, AiProviderError, NotFoundError } from '../src/utils/errors.js';
import type { IListingIngestInput } from '../src/types/jobsearch.types.js';

// ---------------------------------------------------------------------------
// Mock the AI provider module
// ---------------------------------------------------------------------------
vi.mock('../src/services/aiProvider.service.js', () => ({
  generateJson: vi.fn(),
}));

import { generateJson } from '../src/services/aiProvider.service.js';
const mockGenerateJson = vi.mocked(generateJson);

// ---------------------------------------------------------------------------
// Supabase mock helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock Supabase client with chainable query builder methods.
 * Each call to `.from()` returns a fresh builder whose terminal methods
 * (`select`, `insert`, `update`, `delete`) can be configured via the
 * `results` map.
 */
function createMockSupabase(config: {
  fromResults?: Record<string, { data?: unknown; error?: { message: string; code?: string } | null; count?: number | null }>;
}) {
  const { fromResults = {} } = config;

  const createBuilder = (tableName: string) => {
    const defaultResult = fromResults[tableName] ?? { data: null, error: null };

    const builder: Record<string, unknown> = {};

    // All chainable methods return the builder
    const chainMethods = [
      'select', 'insert', 'update', 'delete',
      'eq', 'neq', 'ilike', 'or', 'order', 'range', 'limit', 'single', 'maybeSingle',
    ];

    for (const method of chainMethods) {
      builder[method] = vi.fn().mockReturnValue(builder);
    }

    // Terminal methods that resolve the query — we override select/insert/update/delete
    // to still return the builder (for chaining) but make the builder itself thenable
    // by attaching data/error when awaited
    builder.then = (resolve: (value: unknown) => void) => {
      resolve({ ...defaultResult });
    };

    return builder;
  };

  return {
    from: vi.fn((tableName: string) => createBuilder(tableName)),
  };
}

/**
 * Creates a more granular mock Supabase that can return different results
 * based on the table and method chain.
 */
function createDetailedMockSupabase(handlers: {
  [table: string]: {
    select?: { data?: unknown; error?: unknown; count?: number | null };
    insert?: { data?: unknown; error?: unknown };
    update?: { data?: unknown; error?: unknown };
  };
}) {
  return {
    from: vi.fn((tableName: string) => {
      const tableConfig = handlers[tableName] ?? {};

      const makeTerminal = (result: { data?: unknown; error?: unknown; count?: number | null }) => {
        const builder: Record<string, unknown> = {};
        const chainMethods = ['eq', 'neq', 'ilike', 'or', 'order', 'range', 'limit', 'single', 'maybeSingle', 'select'];
        for (const m of chainMethods) {
          builder[m] = vi.fn().mockReturnValue(builder);
        }
        builder.then = (resolve: (value: unknown) => void) => {
          resolve(result);
        };
        return builder;
      };

      const rootBuilder: Record<string, unknown> = {};
      const chainMethods = ['eq', 'neq', 'ilike', 'or', 'order', 'range', 'limit', 'single', 'maybeSingle'];

      // select returns a builder with the select result
      rootBuilder.select = vi.fn().mockReturnValue(
        (() => {
          const inner = makeTerminal(tableConfig.select ?? { data: null, error: null });
          return inner;
        })()
      );

      // insert returns a builder with the insert result
      rootBuilder.insert = vi.fn().mockReturnValue(
        (() => {
          const inner = makeTerminal(tableConfig.insert ?? { data: null, error: null });
          return inner;
        })()
      );

      // update returns a builder with the update result
      rootBuilder.update = vi.fn().mockReturnValue(
        (() => {
          const inner = makeTerminal(tableConfig.update ?? { data: null, error: null });
          return inner;
        })()
      );

      // delete
      rootBuilder.delete = vi.fn().mockReturnValue(
        (() => {
          const inner = makeTerminal({ data: null, error: null });
          return inner;
        })()
      );

      for (const m of chainMethods) {
        rootBuilder[m] = vi.fn().mockReturnValue(rootBuilder);
      }

      return rootBuilder;
    }),
  };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const validListingInput: IListingIngestInput = {
  title: 'Software Engineer',
  company: 'Acme Corp',
  location: 'New York, NY',
  workMode: 'Remote',
  description: 'We are looking for a talented software engineer to join our team.',
  sourceUrl: 'https://jobs.example.com/se-123',
  salaryMin: 120000,
  salaryMax: 180000,
  datePosted: '2024-06-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Job Search Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Full listing ingest — duplicate exists → merge
  // Requirements: 3.1, 3.2
  // -------------------------------------------------------------------------
  describe('Listing ingest with deduplication — duplicate exists', () => {
    it('merges source URLs and retains earliest datePosted when duplicate is detected', async () => {
      const existingRow = {
        id: 'existing-uuid-001',
        title: 'Software Engineer',
        company: 'Acme Corp',
        location: 'New York, NY',
        work_mode: 'Remote',
        description: 'Old description from earlier scrape.',
        source_urls: ['https://otherjobboard.com/se-001'],
        salary_min: 100000,
        salary_max: 160000,
        date_posted: '2024-05-15T00:00:00.000Z', // earlier than incoming
        date_scraped: '2024-05-20T00:00:00.000Z',
      };

      const mergedRow = {
        ...existingRow,
        description: validListingInput.description,
        source_urls: ['https://otherjobboard.com/se-001', 'https://jobs.example.com/se-123'],
        salary_min: validListingInput.salaryMin,
        salary_max: validListingInput.salaryMax,
        date_posted: '2024-05-15T00:00:00.000Z', // kept earliest
      };

      // Track call order to from('jobsearch_listings')
      let fromCallCount = 0;

      const mockSupabase = {
        from: vi.fn((_table: string) => {
          fromCallCount++;
          const currentCall = fromCallCount;

          const makeChainable = (terminalResult: { data: unknown; error: unknown }) => {
            const b: Record<string, unknown> = {};
            const methods = ['eq', 'neq', 'ilike', 'or', 'order', 'range', 'limit', 'single', 'maybeSingle', 'select', 'update', 'insert', 'delete'];
            for (const m of methods) {
              b[m] = vi.fn().mockReturnValue(b);
            }
            b.then = (resolve: (v: unknown) => void) => {
              resolve(terminalResult);
            };
            return b;
          };

          if (currentCall === 1) {
            // First from() call: dedup lookup select — returns existing rows
            return makeChainable({ data: [existingRow], error: null });
          }
          // Second from() call: update with select — returns merged result
          return makeChainable({ data: mergedRow, error: null });
        }),
      };

      const result = await ingestListing(mockSupabase as never, validListingInput);

      // Should retain earliest datePosted
      expect(result.datePosted).toBe('2024-05-15T00:00:00.000Z');
      // Should contain both source URLs
      expect(result.sourceUrls).toContain('https://otherjobboard.com/se-001');
      expect(result.sourceUrls).toContain('https://jobs.example.com/se-123');
      expect(result.sourceUrls).toHaveLength(2);
      // Should use the incoming (newer) description
      expect(result.description).toBe(validListingInput.description);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Full listing ingest — no duplicate → creates new
  // Requirements: 3.1
  // -------------------------------------------------------------------------
  describe('Listing ingest with deduplication — no duplicate', () => {
    it('creates a new listing when no duplicate exists', async () => {
      const insertedRow = {
        id: 'new-uuid-002',
        title: validListingInput.title,
        company: validListingInput.company,
        location: validListingInput.location,
        work_mode: validListingInput.workMode,
        description: validListingInput.description,
        source_urls: [validListingInput.sourceUrl],
        salary_min: validListingInput.salaryMin,
        salary_max: validListingInput.salaryMax,
        date_posted: validListingInput.datePosted,
        date_scraped: new Date().toISOString(),
      };

      let callCount = 0;
      const mockSupabase = {
        from: vi.fn((_table: string) => {
          const builder: Record<string, unknown> = {};
          const chain = ['eq', 'neq', 'ilike', 'or', 'order', 'range', 'limit', 'single', 'maybeSingle'];

          for (const m of chain) {
            builder[m] = vi.fn().mockReturnValue(builder);
          }

          builder.select = vi.fn().mockImplementation(() => {
            callCount++;
            const inner: Record<string, unknown> = {};
            for (const m of chain) {
              inner[m] = vi.fn().mockReturnValue(inner);
            }
            inner.select = vi.fn().mockReturnValue(inner);
            if (callCount === 1) {
              // First select: dedup lookup — no duplicates found
              inner.then = (resolve: (v: unknown) => void) => {
                resolve({ data: [], error: null });
              };
            } else {
              // After insert select
              inner.then = (resolve: (v: unknown) => void) => {
                resolve({ data: insertedRow, error: null });
              };
            }
            return inner;
          });

          builder.insert = vi.fn().mockReturnValue(builder);

          builder.then = (resolve: (v: unknown) => void) => {
            resolve({ data: insertedRow, error: null });
          };

          return builder;
        }),
      };

      const result = await ingestListing(mockSupabase as never, validListingInput);

      expect(result.id).toBe('new-uuid-002');
      expect(result.title).toBe(validListingInput.title);
      expect(result.company).toBe(validListingInput.company);
      expect(result.sourceUrls).toEqual([validListingInput.sourceUrl]);
    });
  });

  // -------------------------------------------------------------------------
  // 3. AI cover letter generation — 250–500 words
  // Requirements: 6.1, 6.3
  // -------------------------------------------------------------------------
  describe('AI cover letter generation', () => {
    it('returns a cover letter between 250 and 500 words', async () => {
      // Generate a cover letter with exactly ~300 words
      const words = Array.from({ length: 300 }, (_, i) => `word${i}`).join(' ');
      mockGenerateJson.mockResolvedValueOnce({ text: words });

      const mockSupabase = {
        from: vi.fn((table: string) => {
          const builder: Record<string, unknown> = {};
          const chain = ['eq', 'neq', 'ilike', 'or', 'order', 'range', 'limit', 'single', 'maybeSingle', 'select'];

          for (const m of chain) {
            builder[m] = vi.fn().mockReturnValue(builder);
          }

          if (table === 'jobsearch_applications') {
            builder.then = (resolve: (v: unknown) => void) => {
              resolve({
                data: { id: 'app-001', user_id: 'user-001', listing_id: 'listing-001', stage: 'Applied' },
                error: null,
              });
            };
          } else if (table === 'jobsearch_listings') {
            builder.then = (resolve: (v: unknown) => void) => {
              resolve({
                data: {
                  id: 'listing-001',
                  title: 'Senior Developer',
                  company: 'TechCo',
                  location: 'Remote',
                  work_mode: 'Remote',
                  description: 'Looking for 5+ years experience in TypeScript and React.',
                },
                error: null,
              });
            };
          } else if (table === 'resume_versions') {
            builder.then = (resolve: (v: unknown) => void) => {
              resolve({
                data: {
                  id: 'resume-001',
                  content: {
                    contact: { name: 'Jane Doe', email: 'jane@test.com', phone: '555-0100' },
                    summary: 'Experienced developer with 7 years in TypeScript.',
                    experience: [{ heading: 'Senior Dev at StartupX', items: ['Built React apps'] }],
                    education: [{ heading: 'BS Computer Science', items: ['MIT 2015'] }],
                    skills: ['TypeScript', 'React', 'Node.js'],
                  },
                },
                error: null,
              });
            };
          }

          return builder;
        }),
      };

      const result = await generateCoverLetter(mockSupabase as never, 'user-001', 'app-001');

      const wordCount = result.split(/\s+/).filter((w) => w.length > 0).length;
      expect(wordCount).toBeGreaterThanOrEqual(250);
      expect(wordCount).toBeLessThanOrEqual(500);
      expect(mockGenerateJson).toHaveBeenCalledTimes(1);
    });

    it('throws AiProviderError when AI times out (15s timeout)', async () => {
      mockGenerateJson.mockRejectedValue(
        new AiProviderError('The AI provider request timed out after 15000ms.')
      );

      const mockSupabase = {
        from: vi.fn((table: string) => {
          const builder: Record<string, unknown> = {};
          const chain = ['eq', 'neq', 'ilike', 'or', 'order', 'range', 'limit', 'single', 'maybeSingle', 'select'];

          for (const m of chain) {
            builder[m] = vi.fn().mockReturnValue(builder);
          }

          if (table === 'jobsearch_applications') {
            builder.then = (resolve: (v: unknown) => void) => {
              resolve({
                data: { id: 'app-001', user_id: 'user-001', listing_id: 'listing-001', stage: 'Applied' },
                error: null,
              });
            };
          } else if (table === 'jobsearch_listings') {
            builder.then = (resolve: (v: unknown) => void) => {
              resolve({
                data: {
                  id: 'listing-001',
                  title: 'Developer',
                  company: 'Corp',
                  location: 'NYC',
                  work_mode: 'Onsite',
                  description: 'Must know JavaScript and Python.',
                },
                error: null,
              });
            };
          } else if (table === 'resume_versions') {
            builder.then = (resolve: (v: unknown) => void) => {
              resolve({
                data: {
                  id: 'resume-001',
                  content: {
                    contact: { name: 'John', email: 'j@t.com', phone: '555' },
                    summary: 'Dev',
                    experience: [],
                    education: [],
                    skills: ['JS'],
                  },
                },
                error: null,
              });
            };
          }

          return builder;
        }),
      };

      await expect(
        generateCoverLetter(mockSupabase as never, 'user-001', 'app-001')
      ).rejects.toThrow(AiProviderError);

      await expect(
        generateCoverLetter(mockSupabase as never, 'user-001', 'app-001')
      ).rejects.toThrow(/timed out/);
    });
  });

  // -------------------------------------------------------------------------
  // 4. LinkedIn outreach message — ≤300 characters
  // Requirements: 7.1, 7.2
  // -------------------------------------------------------------------------
  describe('AI LinkedIn outreach message generation', () => {
    it('generates a message constrained to ≤300 characters', async () => {
      const linkedInMessage = 'Hi Sarah, I noticed TechCo is hiring for the Senior Developer role. With my background in distributed systems, I would love to connect and learn more about the team. Looking forward to connecting!';
      mockGenerateJson.mockResolvedValueOnce({ text: linkedInMessage });

      const mockSupabase = {
        from: vi.fn((table: string) => {
          const builder: Record<string, unknown> = {};
          const chain = ['eq', 'neq', 'ilike', 'or', 'order', 'range', 'limit', 'single', 'maybeSingle', 'select'];

          for (const m of chain) {
            builder[m] = vi.fn().mockReturnValue(builder);
          }

          if (table === 'jobsearch_applications') {
            builder.then = (resolve: (v: unknown) => void) => {
              resolve({
                data: { id: 'app-002', user_id: 'user-001', listing_id: 'listing-002', stage: 'Wishlist' },
                error: null,
              });
            };
          } else if (table === 'jobsearch_listings') {
            builder.then = (resolve: (v: unknown) => void) => {
              resolve({
                data: {
                  id: 'listing-002',
                  title: 'Senior Developer',
                  company: 'TechCo',
                  location: 'San Francisco',
                  work_mode: 'Hybrid',
                  description: 'Building next-gen platforms.',
                },
                error: null,
              });
            };
          }

          return builder;
        }),
      };

      const result = await generateLinkedInOutreach(
        mockSupabase as never,
        'user-001',
        'app-002',
        'Sarah',
        'Engineering Manager'
      );

      expect(result.length).toBeLessThanOrEqual(300);
      expect(result.length).toBeGreaterThan(0);
      expect(mockGenerateJson).toHaveBeenCalledTimes(1);

      // Verify the prompt requests ≤300 chars constraint
      const callArgs = mockGenerateJson.mock.calls[0][0];
      expect(callArgs.prompt).toContain('300 characters');
      expect(callArgs.timeoutMs).toBe(15_000);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Follow-up email generation — within timeout, references company/title
  // Requirement: 8.1
  // -------------------------------------------------------------------------
  describe('AI follow-up email generation', () => {
    it('generates a follow-up email that references company and title for Applied stage', async () => {
      const emailText = `Subject: Following Up on My Application - Senior Developer at TechCo\n\nDear Hiring Team,\n\nI recently submitted my application for the Senior Developer position at TechCo and wanted to express my continued interest in this opportunity.\n\nI am excited about the possibility of contributing to TechCo's engineering team and believe my experience aligns well with the role requirements.\n\nThank you for your time and consideration.\n\nBest regards,\nJane`;
      mockGenerateJson.mockResolvedValueOnce({ text: emailText });

      const mockSupabase = {
        from: vi.fn((table: string) => {
          const builder: Record<string, unknown> = {};
          const chain = ['eq', 'neq', 'ilike', 'or', 'order', 'range', 'limit', 'single', 'maybeSingle', 'select'];

          for (const m of chain) {
            builder[m] = vi.fn().mockReturnValue(builder);
          }

          if (table === 'jobsearch_applications') {
            builder.then = (resolve: (v: unknown) => void) => {
              resolve({
                data: { id: 'app-003', user_id: 'user-001', listing_id: 'listing-003', stage: 'Applied' },
                error: null,
              });
            };
          } else if (table === 'jobsearch_listings') {
            builder.then = (resolve: (v: unknown) => void) => {
              resolve({
                data: {
                  id: 'listing-003',
                  title: 'Senior Developer',
                  company: 'TechCo',
                  location: 'Austin, TX',
                  work_mode: 'Remote',
                  description: 'We need a senior developer.',
                },
                error: null,
              });
            };
          }

          return builder;
        }),
      };

      const result = await generateFollowUpEmail(mockSupabase as never, 'user-001', 'app-003');

      expect(result).toContain('TechCo');
      expect(result).toContain('Senior Developer');
      expect(result.length).toBeGreaterThan(0);

      // Verify the timeout is set to 15s
      const callArgs = mockGenerateJson.mock.calls[0][0];
      expect(callArgs.timeoutMs).toBe(15_000);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Database error during dedup rejects ingestion
  // Requirement: 3.6
  // -------------------------------------------------------------------------
  describe('Database error during deduplication', () => {
    it('throws InternalError when the dedup query fails', async () => {
      const mockSupabase = {
        from: vi.fn((_table: string) => {
          const builder: Record<string, unknown> = {};
          const chain = ['eq', 'neq', 'ilike', 'or', 'order', 'range', 'limit', 'single', 'maybeSingle'];

          for (const m of chain) {
            builder[m] = vi.fn().mockReturnValue(builder);
          }

          builder.select = vi.fn().mockReturnValue(builder);

          // Simulate database error during the dedup select
          builder.then = (resolve: (v: unknown) => void) => {
            resolve({
              data: null,
              error: { message: 'connection refused', code: '08006' },
            });
          };

          return builder;
        }),
      };

      await expect(
        ingestListing(mockSupabase as never, validListingInput)
      ).rejects.toThrow(InternalError);

      await expect(
        ingestListing(mockSupabase as never, validListingInput)
      ).rejects.toThrow(/Deduplication check failed/);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Stage update failure handling
  // Requirement: 4.6
  // -------------------------------------------------------------------------
  describe('Stage update failure handling', () => {
    it('throws NotFoundError when DB returns error during stage update', async () => {
      const mockSupabase = {
        from: vi.fn((_table: string) => {
          const builder: Record<string, unknown> = {};
          const chain = ['eq', 'neq', 'ilike', 'or', 'order', 'range', 'limit', 'single', 'maybeSingle', 'select'];

          for (const m of chain) {
            builder[m] = vi.fn().mockReturnValue(builder);
          }

          builder.update = vi.fn().mockReturnValue(builder);

          // Simulate DB error on stage update
          builder.then = (resolve: (v: unknown) => void) => {
            resolve({
              data: null,
              error: { message: 'network timeout', code: '57P01' },
            });
          };

          return builder;
        }),
      };

      await expect(
        updateStage(mockSupabase as never, 'user-001', 'app-001', 'Interviewing')
      ).rejects.toThrow(NotFoundError);

      await expect(
        updateStage(mockSupabase as never, 'user-001', 'app-001', 'Applied')
      ).rejects.toThrow(/not found|permission/i);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Cover letter timeout scenario — confirms 15s timeout enforcement
  // Requirements: 6.3
  // -------------------------------------------------------------------------
  describe('AI generation timeout enforcement', () => {
    it('passes 15000ms timeout to the AI provider for cover letter generation', async () => {
      const words = Array.from({ length: 280 }, (_, i) => `text${i}`).join(' ');
      mockGenerateJson.mockResolvedValueOnce({ text: words });

      const mockSupabase = {
        from: vi.fn((table: string) => {
          const builder: Record<string, unknown> = {};
          const chain = ['eq', 'neq', 'ilike', 'or', 'order', 'range', 'limit', 'single', 'maybeSingle', 'select'];

          for (const m of chain) {
            builder[m] = vi.fn().mockReturnValue(builder);
          }

          if (table === 'jobsearch_applications') {
            builder.then = (resolve: (v: unknown) => void) => {
              resolve({
                data: { id: 'app-t1', user_id: 'user-t1', listing_id: 'listing-t1', stage: 'Applied' },
                error: null,
              });
            };
          } else if (table === 'jobsearch_listings') {
            builder.then = (resolve: (v: unknown) => void) => {
              resolve({
                data: {
                  id: 'listing-t1',
                  title: 'Engineer',
                  company: 'BigCo',
                  location: 'LA',
                  work_mode: 'Remote',
                  description: 'Need strong coding skills and teamwork abilities.',
                },
                error: null,
              });
            };
          } else if (table === 'resume_versions') {
            builder.then = (resolve: (v: unknown) => void) => {
              resolve({
                data: {
                  id: 'rv-1',
                  content: {
                    contact: { name: 'Dev', email: 'd@e.com', phone: '555' },
                    summary: 'Full stack developer',
                    experience: [{ heading: 'Dev at Co', items: ['Built APIs'] }],
                    education: [],
                    skills: ['Python', 'Go'],
                  },
                },
                error: null,
              });
            };
          }

          return builder;
        }),
      };

      await generateCoverLetter(mockSupabase as never, 'user-t1', 'app-t1');

      // Verify generateJson was called with 15s timeout
      expect(mockGenerateJson).toHaveBeenCalledTimes(1);
      const params = mockGenerateJson.mock.calls[0][0];
      expect(params.timeoutMs).toBe(15_000);
    });
  });
});
