/**
 * Job Search Module — Backend Unit Tests
 *
 * Tests cover:
 * 1. Default pagination returns max 20 items (Req 1.2)
 * 2. Source URL is included in listing response (Req 1.4)
 * 3. AI cover letter throws AiProviderError on Gemini failure (Req 6.4)
 * 4. AI cover letter throws ValidationError when user has no resume (Req 6.6)
 * 5. AI cover letter throws ValidationError when listing has empty description (Req 6.7)
 * 6. AI LinkedIn outreach throws AiProviderError on API failure (Req 7.4)
 * 7. AI follow-up email throws AiProviderError on API failure (Req 8.6)
 * 8. deleteApplication throws NotFoundError for non-existent application (Req 9.4)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getListings } from '../src/services/jobsearchListing.service.js';
import { deleteApplication } from '../src/services/jobsearchTracker.service.js';
import {
  generateCoverLetter,
  generateLinkedInOutreach,
  generateFollowUpEmail,
} from '../src/services/jobsearchAiWriter.service.js';
import {
  AiProviderError,
  NotFoundError,
  ValidationError,
} from '../src/utils/errors.js';

// ---------------------------------------------------------------------------
// Mock: aiProvider.service (used by AI writer)
// ---------------------------------------------------------------------------
vi.mock('../src/services/aiProvider.service.js', () => ({
  generateJson: vi.fn(),
}));

import { generateJson } from '../src/services/aiProvider.service.js';
const mockGenerateJson = vi.mocked(generateJson);

// ---------------------------------------------------------------------------
// Helper: create a mock Supabase client
// ---------------------------------------------------------------------------

interface MockQueryBuilder {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
}

function createMockQueryBuilder(resolvedValue: {
  data: unknown;
  error: unknown;
  count?: number | null;
}): MockQueryBuilder {
  const builder: MockQueryBuilder = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    ilike: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    limit: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
  };

  // Every method returns the builder (chaining), except terminal calls
  // which resolve the promise
  const chainable = () => builder;
  builder.select.mockReturnValue(builder);
  builder.insert.mockReturnValue(builder);
  builder.update.mockReturnValue(builder);
  builder.delete.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.ilike.mockReturnValue(builder);
  builder.or.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  builder.single.mockReturnValue(Promise.resolve(resolvedValue));
  builder.maybeSingle.mockReturnValue(Promise.resolve(resolvedValue));

  // range is terminal for getListings
  builder.range.mockReturnValue(Promise.resolve(resolvedValue));

  return builder;
}

function createMockSupabase(builders: Record<string, MockQueryBuilder>) {
  return {
    from: vi.fn((table: string) => builders[table]),
  } as unknown;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Job Search Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Default pagination returns max 20 (Req 1.2)
  // -------------------------------------------------------------------------
  describe('getListings — default pagination', () => {
    it('should return at most 20 items when default pageSize is used', async () => {
      // Create 25 mock listing rows
      const mockRows = Array.from({ length: 25 }, (_, i) => ({
        id: `listing-${String(i)}`,
        title: `Job ${String(i)}`,
        company: `Company ${String(i)}`,
        location: `City ${String(i)}`,
        work_mode: 'Remote',
        description: `Description ${String(i)}`,
        source_urls: [`https://example.com/job/${String(i)}`],
        salary_min: 50000,
        salary_max: 100000,
        date_posted: '2025-01-01T00:00:00Z',
        date_scraped: '2025-01-15T00:00:00Z',
      }));

      // The service uses range(0, 19) for pageSize=20, so Supabase returns first 20
      const first20 = mockRows.slice(0, 20);

      const listingsBuilder = createMockQueryBuilder({
        data: first20,
        error: null,
        count: 25,
      });

      const supabase = createMockSupabase({
        jobsearch_listings: listingsBuilder,
      });

      const result = await getListings(
        supabase as any,
        {},
        { page: 1, pageSize: 20 }
      );

      expect(result.items).toHaveLength(20);
      expect(result.meta.totalCount).toBe(25);
      expect(result.meta.currentPage).toBe(1);
      expect(result.meta.totalPages).toBe(2);
      expect(result.meta.hasNextPage).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Source URL included in response (Req 1.4)
  // -------------------------------------------------------------------------
  describe('getListings — sourceUrls in response', () => {
    it('should include sourceUrls field in each listing response', async () => {
      const mockRow = {
        id: 'listing-1',
        title: 'Frontend Developer',
        company: 'Acme Corp',
        location: 'New York, NY',
        work_mode: 'Hybrid',
        description: 'Build great UIs',
        source_urls: ['https://linkedin.com/jobs/123', 'https://indeed.com/jobs/456'],
        salary_min: 80000,
        salary_max: 120000,
        date_posted: '2025-01-10T00:00:00Z',
        date_scraped: '2025-01-12T00:00:00Z',
      };

      const listingsBuilder = createMockQueryBuilder({
        data: [mockRow],
        error: null,
        count: 1,
      });

      const supabase = createMockSupabase({
        jobsearch_listings: listingsBuilder,
      });

      const result = await getListings(
        supabase as any,
        {},
        { page: 1, pageSize: 20 }
      );

      expect(result.items[0]!.sourceUrls).toEqual([
        'https://linkedin.com/jobs/123',
        'https://indeed.com/jobs/456',
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // 3. generateCoverLetter throws AiProviderError on Gemini failure (Req 6.4)
  // -------------------------------------------------------------------------
  describe('generateCoverLetter — AI error handling', () => {
    it('should throw AiProviderError when Gemini API fails', async () => {
      // Mock application lookup
      const appBuilder = createMockQueryBuilder({
        data: {
          id: 'app-1',
          user_id: 'user-1',
          listing_id: 'listing-1',
          stage: 'Applied',
        },
        error: null,
      });

      // Mock listing lookup (with description present)
      const listingBuilder = createMockQueryBuilder({
        data: {
          id: 'listing-1',
          title: 'Software Engineer',
          company: 'TechCo',
          location: 'Remote',
          work_mode: 'Remote',
          description: 'We need someone who knows TypeScript and React.',
        },
        error: null,
      });

      // Mock resume lookup (returns a valid resume)
      const resumeBuilder = createMockQueryBuilder({
        data: {
          id: 'resume-1',
          content: {
            contact: { name: 'Jane Doe', email: 'jane@test.com', phone: '', location: '' },
            summary: 'Experienced developer',
            experience: [{ heading: 'Senior Dev at X', items: ['Built stuff'] }],
            education: [],
            skills: ['TypeScript', 'React'],
          },
        },
        error: null,
      });

      const supabase = {
        from: vi.fn((table: string) => {
          if (table === 'jobsearch_applications') return appBuilder;
          if (table === 'jobsearch_listings') return listingBuilder;
          if (table === 'resume_versions') return resumeBuilder;
          return appBuilder;
        }),
      };

      // Make AI provider throw AiProviderError
      mockGenerateJson.mockRejectedValueOnce(
        new AiProviderError('The AI provider request failed.')
      );

      await expect(
        generateCoverLetter(supabase as any, 'user-1', 'app-1')
      ).rejects.toThrow(AiProviderError);
    });
  });

  // -------------------------------------------------------------------------
  // 4. generateCoverLetter throws ValidationError when no resume (Req 6.6)
  // -------------------------------------------------------------------------
  describe('generateCoverLetter — no resume validation', () => {
    it('should throw ValidationError when user has no stored resume', async () => {
      const appBuilder = createMockQueryBuilder({
        data: {
          id: 'app-1',
          user_id: 'user-1',
          listing_id: 'listing-1',
          stage: 'Applied',
        },
        error: null,
      });

      const listingBuilder = createMockQueryBuilder({
        data: {
          id: 'listing-1',
          title: 'Software Engineer',
          company: 'TechCo',
          location: 'Remote',
          work_mode: 'Remote',
          description: 'We need a developer.',
        },
        error: null,
      });

      // Resume lookup returns null (no resume)
      const resumeBuilder = createMockQueryBuilder({
        data: null,
        error: null,
      });

      const supabase = {
        from: vi.fn((table: string) => {
          if (table === 'jobsearch_applications') return appBuilder;
          if (table === 'jobsearch_listings') return listingBuilder;
          if (table === 'resume_versions') return resumeBuilder;
          return appBuilder;
        }),
      };

      await expect(
        generateCoverLetter(supabase as any, 'user-1', 'app-1')
      ).rejects.toThrow(ValidationError);

      await expect(
        generateCoverLetter(supabase as any, 'user-1', 'app-1')
      ).rejects.toThrow('A resume must be uploaded before generating a cover letter.');
    });
  });

  // -------------------------------------------------------------------------
  // 5. generateCoverLetter throws ValidationError on empty description (Req 6.7)
  // -------------------------------------------------------------------------
  describe('generateCoverLetter — empty description validation', () => {
    it('should throw ValidationError when listing description is empty', async () => {
      const appBuilder = createMockQueryBuilder({
        data: {
          id: 'app-1',
          user_id: 'user-1',
          listing_id: 'listing-1',
          stage: 'Applied',
        },
        error: null,
      });

      // Listing with empty description
      const listingBuilder = createMockQueryBuilder({
        data: {
          id: 'listing-1',
          title: 'Software Engineer',
          company: 'TechCo',
          location: 'Remote',
          work_mode: 'Remote',
          description: '',
        },
        error: null,
      });

      const supabase = {
        from: vi.fn((table: string) => {
          if (table === 'jobsearch_applications') return appBuilder;
          if (table === 'jobsearch_listings') return listingBuilder;
          return appBuilder;
        }),
      };

      await expect(
        generateCoverLetter(supabase as any, 'user-1', 'app-1')
      ).rejects.toThrow(ValidationError);

      await expect(
        generateCoverLetter(supabase as any, 'user-1', 'app-1')
      ).rejects.toThrow(
        'A listing description is required for cover letter generation.'
      );
    });
  });

  // -------------------------------------------------------------------------
  // 6. generateLinkedInOutreach throws AiProviderError on API failure (Req 7.4)
  // -------------------------------------------------------------------------
  describe('generateLinkedInOutreach — AI error handling', () => {
    it('should throw AiProviderError when Gemini API fails', async () => {
      const appBuilder = createMockQueryBuilder({
        data: {
          id: 'app-1',
          user_id: 'user-1',
          listing_id: 'listing-1',
          stage: 'Applied',
        },
        error: null,
      });

      const listingBuilder = createMockQueryBuilder({
        data: {
          id: 'listing-1',
          title: 'Product Manager',
          company: 'BigCorp',
          location: 'San Francisco, CA',
          work_mode: 'Hybrid',
          description: 'Lead product strategy.',
        },
        error: null,
      });

      const supabase = {
        from: vi.fn((table: string) => {
          if (table === 'jobsearch_applications') return appBuilder;
          if (table === 'jobsearch_listings') return listingBuilder;
          return appBuilder;
        }),
      };

      mockGenerateJson.mockRejectedValueOnce(
        new AiProviderError('The AI provider request timed out after 15000ms.')
      );

      await expect(
        generateLinkedInOutreach(supabase as any, 'user-1', 'app-1')
      ).rejects.toThrow(AiProviderError);
    });
  });

  // -------------------------------------------------------------------------
  // 7. generateFollowUpEmail throws AiProviderError on API failure (Req 8.6)
  // -------------------------------------------------------------------------
  describe('generateFollowUpEmail — AI error handling', () => {
    it('should throw AiProviderError when Gemini API fails', async () => {
      const appBuilder = createMockQueryBuilder({
        data: {
          id: 'app-1',
          user_id: 'user-1',
          listing_id: 'listing-1',
          stage: 'Applied', // Valid stage for follow-up
        },
        error: null,
      });

      const listingBuilder = createMockQueryBuilder({
        data: {
          id: 'listing-1',
          title: 'Data Scientist',
          company: 'DataCo',
          location: 'Austin, TX',
          work_mode: 'Remote',
          description: 'Analyze data and build models.',
        },
        error: null,
      });

      const supabase = {
        from: vi.fn((table: string) => {
          if (table === 'jobsearch_applications') return appBuilder;
          if (table === 'jobsearch_listings') return listingBuilder;
          return appBuilder;
        }),
      };

      mockGenerateJson.mockRejectedValueOnce(
        new AiProviderError('The AI provider request failed.')
      );

      await expect(
        generateFollowUpEmail(supabase as any, 'user-1', 'app-1')
      ).rejects.toThrow(AiProviderError);
    });
  });

  // -------------------------------------------------------------------------
  // 8. deleteApplication throws NotFoundError for non-existent app (Req 9.4)
  // -------------------------------------------------------------------------
  describe('deleteApplication — non-existent application', () => {
    it('should throw NotFoundError when application does not exist', async () => {
      // The initial select to verify existence returns null
      const appBuilder = createMockQueryBuilder({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });

      const supabase = createMockSupabase({
        jobsearch_applications: appBuilder,
      });

      await expect(
        deleteApplication(supabase as any, 'user-1', 'non-existent-id')
      ).rejects.toThrow(NotFoundError);

      await expect(
        deleteApplication(supabase as any, 'user-1', 'non-existent-id')
      ).rejects.toThrow(
        'Application not found or you do not have permission to delete it.'
      );
    });
  });
});
