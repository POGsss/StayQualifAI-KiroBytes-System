/// <reference types="vite/client" />

/**
 * Typed Supabase Auth environment variables consumed by
 * `services/supabaseAuthClient.ts`. Declaring them here keeps access to
 * `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` strongly typed
 * (no implicit `any`) under TypeScript strict mode.
 */
interface ImportMetaEnv {
  /** Supabase project URL (public). */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase public anon key (never the service-role key). */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
