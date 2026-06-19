/**
 * Keyword utilities for the ATS_Scanner (Requirements 4.1, 4.2, 4.3).
 *
 * Implements deterministic, network-free normalized lexical matching as
 * described in the design's "Keyword Matching Rationale":
 *   lowercase -> strip punctuation -> tokenize -> remove stopwords ->
 *   reduce each token to its Porter stem.
 *
 * A term is considered "present" in a resume when its stem belongs to the
 * resume's stemmed token set. The JD-minus-resume difference therefore yields
 * the significant job-description stems that are absent from the resume.
 *
 * The Porter stemmer is implemented in-process (no external dependency) to
 * keep this module pure, deterministic, and free of any network call so it can
 * run on every scan without consuming AI quota.
 *
 * Named exports only. No `any`.
 */

/**
 * English stopwords removed before stemming so that only significant terms
 * contribute to keyword matching. Kept intentionally compact — common
 * function words that carry no ATS signal.
 */
const STOPWORDS: ReadonlySet<string> = new Set<string>([
  'a',
  'about',
  'above',
  'after',
  'again',
  'against',
  'all',
  'am',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'because',
  'been',
  'before',
  'being',
  'below',
  'between',
  'both',
  'but',
  'by',
  'can',
  'cannot',
  'could',
  'did',
  'do',
  'does',
  'doing',
  'down',
  'during',
  'each',
  'few',
  'for',
  'from',
  'further',
  'had',
  'has',
  'have',
  'having',
  'he',
  'her',
  'here',
  'hers',
  'herself',
  'him',
  'himself',
  'his',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'itself',
  'me',
  'more',
  'most',
  'my',
  'myself',
  'no',
  'nor',
  'not',
  'of',
  'off',
  'on',
  'once',
  'only',
  'or',
  'other',
  'ought',
  'our',
  'ours',
  'ourselves',
  'out',
  'over',
  'own',
  'same',
  'she',
  'should',
  'so',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'theirs',
  'them',
  'themselves',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'to',
  'too',
  'under',
  'until',
  'up',
  'very',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
  'yours',
  'yourself',
  'yourselves',
]);

/**
 * Normalizes text to a lowercase form with punctuation replaced by spaces.
 * Letters, digits, and whitespace are preserved; everything else collapses to
 * a single space so it acts purely as a token boundary.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokenizes text into an ordered list of word tokens after normalization.
 * Returns an empty array for empty or whitespace-only input.
 */
export function tokenize(text: string): string[] {
  const normalized: string = normalize(text);
  if (normalized.length === 0) {
    return [];
  }
  return normalized.split(' ');
}

/**
 * Returns true when a (already lowercased) token is an English stopword.
 */
export function isStopword(token: string): boolean {
  return STOPWORDS.has(token);
}

// --- Porter stemmer ---------------------------------------------------------
// Adapted from Martin Porter's reference algorithm. The regular-expression
// fragments below encode the consonant/vowel measure rules (m).

const CONSONANT_SEQ = '[^aeiou][^aeiouy]*';
const VOWEL_SEQ = '[aeiouy][aeiou]*';

const MGR0 = new RegExp('^(' + CONSONANT_SEQ + ')?' + VOWEL_SEQ + CONSONANT_SEQ);
const MEQ1 = new RegExp(
  '^(' + CONSONANT_SEQ + ')?' + VOWEL_SEQ + CONSONANT_SEQ + '(' + VOWEL_SEQ + ')?$'
);
const MGR1 = new RegExp(
  '^(' + CONSONANT_SEQ + ')?' + VOWEL_SEQ + CONSONANT_SEQ + VOWEL_SEQ + CONSONANT_SEQ
);
const S_V = new RegExp('^(' + CONSONANT_SEQ + ')?[aeiouy]');

const STEP2_LIST: Readonly<Record<string, string>> = {
  ational: 'ate',
  tional: 'tion',
  enci: 'ence',
  anci: 'ance',
  izer: 'ize',
  bli: 'ble',
  alli: 'al',
  entli: 'ent',
  eli: 'e',
  ousli: 'ous',
  ization: 'ize',
  ation: 'ate',
  ator: 'ate',
  alism: 'al',
  iveness: 'ive',
  fulness: 'ful',
  ousness: 'ous',
  aliti: 'al',
  iviti: 'ive',
  biliti: 'ble',
  logi: 'log',
};

const STEP3_LIST: Readonly<Record<string, string>> = {
  icate: 'ic',
  ative: '',
  alize: 'al',
  iciti: 'ic',
  ical: 'ic',
  ful: '',
  ness: '',
};

/**
 * Safely reads a capture group from an exec result, returning '' when absent.
 */
function group(match: RegExpExecArray | null, index: number): string {
  return match?.[index] ?? '';
}

/**
 * Reduces a single token to its Porter stem. Tokens shorter than three
 * characters are returned unchanged. The input is assumed to be lowercase.
 */
export function porterStem(token: string): string {
  let w: string = token;
  if (w.length < 3) {
    return w;
  }

  let firstChIsY = false;
  if (w.startsWith('y')) {
    firstChIsY = true;
    w = 'Y' + w.slice(1);
  }

  // Step 1a
  const re1a = /^(.+?)(ss|i)es$/;
  const re1aAlt = /^(.+?)([^s])s$/;
  if (re1a.test(w)) {
    w = w.replace(re1a, '$1$2');
  } else if (re1aAlt.test(w)) {
    w = w.replace(re1aAlt, '$1$2');
  }

  // Step 1b
  const re1bEed = /^(.+?)eed$/;
  const re1bEdIng = /^(.+?)(ed|ing)$/;
  if (re1bEed.test(w)) {
    const fp = re1bEed.exec(w);
    if (MGR0.test(group(fp, 1))) {
      w = w.slice(0, -1);
    }
  } else if (re1bEdIng.test(w)) {
    const fp = re1bEdIng.exec(w);
    const stem = group(fp, 1);
    if (S_V.test(stem)) {
      w = stem;
      const atbliz = /(at|bl|iz)$/;
      const doubleCons = /([^aeiouylsz])\1$/;
      const cvc = new RegExp('^' + CONSONANT_SEQ + '[aeiouy][^aeiouwxy]$');
      if (atbliz.test(w)) {
        w = w + 'e';
      } else if (doubleCons.test(w)) {
        w = w.slice(0, -1);
      } else if (cvc.test(w)) {
        w = w + 'e';
      }
    }
  }

  // Step 1c
  const re1c = /^(.+?)y$/;
  if (re1c.test(w)) {
    const fp = re1c.exec(w);
    const stem = group(fp, 1);
    if (S_V.test(stem)) {
      w = stem + 'i';
    }
  }

  // Step 2
  const re2 =
    /^(.+?)(ational|tional|enci|anci|izer|bli|alli|entli|eli|ousli|ization|ation|ator|alism|iveness|fulness|ousness|aliti|iviti|biliti|logi)$/;
  if (re2.test(w)) {
    const fp = re2.exec(w);
    const stem = group(fp, 1);
    const suffix = group(fp, 2);
    if (MGR0.test(stem)) {
      w = stem + (STEP2_LIST[suffix] ?? '');
    }
  }

  // Step 3
  const re3 = /^(.+?)(icate|ative|alize|iciti|ical|ful|ness)$/;
  if (re3.test(w)) {
    const fp = re3.exec(w);
    const stem = group(fp, 1);
    const suffix = group(fp, 2);
    if (MGR0.test(stem)) {
      w = stem + (STEP3_LIST[suffix] ?? '');
    }
  }

  // Step 4
  const re4 =
    /^(.+?)(al|ance|ence|er|ic|able|ible|ant|ement|ment|ent|ou|ism|ate|iti|ous|ive|ize)$/;
  const re4Ion = /^(.+?)(s|t)(ion)$/;
  if (re4.test(w)) {
    const fp = re4.exec(w);
    const stem = group(fp, 1);
    if (MGR1.test(stem)) {
      w = stem;
    }
  } else if (re4Ion.test(w)) {
    const fp = re4Ion.exec(w);
    const stem = group(fp, 1) + group(fp, 2);
    if (MGR1.test(stem)) {
      w = stem;
    }
  }

  // Step 5a
  const re5 = /^(.+?)e$/;
  if (re5.test(w)) {
    const fp = re5.exec(w);
    const stem = group(fp, 1);
    const cvc = new RegExp('^' + CONSONANT_SEQ + '[aeiouy][^aeiouwxy]$');
    if (MGR1.test(stem) || (MEQ1.test(stem) && !cvc.test(stem))) {
      w = stem;
    }
  }

  // Step 5b
  if (/ll$/.test(w) && MGR1.test(w)) {
    w = w.slice(0, -1);
  }

  // Restore an initial capital Y to lowercase.
  if (firstChIsY) {
    w = 'y' + w.slice(1);
  }

  return w;
}

/**
 * Produces the set of significant Porter stems for a body of text:
 * normalized, tokenized, stopword-filtered, and stemmed.
 */
export function stemSet(text: string): Set<string> {
  const stems = new Set<string>();
  for (const token of tokenize(text)) {
    if (isStopword(token)) {
      continue;
    }
    const stem: string = porterStem(token);
    if (stem.length > 0) {
      stems.add(stem);
    }
  }
  return stems;
}

/**
 * Computes the JD-minus-resume stem difference: the significant job-description
 * stems that are absent from the resume's stem set.
 *
 * The returned stems preserve first-appearance order within the job
 * description and contain no duplicates. When the resume already covers every
 * significant job-description stem, the result is an empty array
 * (Requirements 4.2, 4.3).
 */
export function keywordDifference(jobDescription: string, resumeText: string): string[] {
  const resumeStems: Set<string> = stemSet(resumeText);
  const seen = new Set<string>();
  const difference: string[] = [];

  for (const token of tokenize(jobDescription)) {
    if (isStopword(token)) {
      continue;
    }
    const stem: string = porterStem(token);
    if (stem.length === 0 || resumeStems.has(stem) || seen.has(stem)) {
      continue;
    }
    seen.add(stem);
    difference.push(stem);
  }

  return difference;
}
