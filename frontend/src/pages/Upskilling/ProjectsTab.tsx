import { useEffect, useState } from 'react';
import type { FormEvent, JSX } from 'react';

import { ProjectCard } from '../../components/Upskilling/ProjectCard';
import type { ISaveProjectInput } from '../../services/upskilling.service';
import { useUpskillingStore } from '../../stores/upskilling.store';
import type { IGenerateProjectsInput, IProjectSuggestion } from '../../types/upskilling.types';

/**
 * ProjectsTab — Role-Based Project Generator.
 *
 * Lets the user enter a target role plus an optional comma-separated list of
 * focus skills, generate 3–5 AI portfolio-project suggestions, save the ones
 * they like, and review/delete previously saved suggestions. Loading and error
 * states are surfaced from the shared Zustand store (Req 1.1, 1.3, 2.1, 2.2, 2.4).
 */

/**
 * Parse the comma-separated focus-skills field into a trimmed, de-empties
 * list. Returns `undefined` when nothing meaningful was entered so the request
 * omits the optional field entirely.
 */
function parseFocusSkills(raw: string): string[] | undefined {
  const skills = raw
    .split(',')
    .map((skill) => skill.trim())
    .filter((skill) => skill.length > 0);
  return skills.length > 0 ? skills : undefined;
}

/** Build the save payload from a generated suggestion's fields. */
function toSaveInput(suggestion: IProjectSuggestion): ISaveProjectInput {
  return {
    targetRole: suggestion.targetRole,
    title: suggestion.title,
    description: suggestion.description,
    demonstratedSkills: suggestion.demonstratedSkills,
    difficulty: suggestion.difficulty,
    estimatedEffortHours: suggestion.estimatedEffortHours,
  };
}

export function ProjectsTab(): JSX.Element {
  const generatedProjects = useUpskillingStore((s) => s.generatedProjects);
  const savedProjects = useUpskillingStore((s) => s.savedProjects);
  const status = useUpskillingStore((s) => s.status);
  const error = useUpskillingStore((s) => s.error);
  const generateProjects = useUpskillingStore((s) => s.generateProjects);
  const saveProject = useUpskillingStore((s) => s.saveProject);
  const fetchProjects = useUpskillingStore((s) => s.fetchProjects);
  const deleteProject = useUpskillingStore((s) => s.deleteProject);
  const clearError = useUpskillingStore((s) => s.clearError);

  const [targetRole, setTargetRole] = useState('');
  const [focusSkills, setFocusSkills] = useState('');
  // Track the in-flight item so only its button shows a pending label.
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load the user's saved suggestions on mount (Req 2.2).
  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const isLoading = status === 'loading';
  const canGenerate = targetRole.trim().length >= 2 && !isLoading;

  const handleGenerate = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!canGenerate) {
      return;
    }
    const input: IGenerateProjectsInput = { targetRole: targetRole.trim() };
    const skills = parseFocusSkills(focusSkills);
    if (skills !== undefined) {
      input.focusSkills = skills;
    }
    void generateProjects(input);
  };

  const handleSave = (suggestion: IProjectSuggestion, index: number): void => {
    setSavingIndex(index);
    void saveProject(toSaveInput(suggestion)).finally(() => {
      setSavingIndex(null);
    });
  };

  const handleDelete = (id: string): void => {
    setDeletingId(id);
    void deleteProject(id).finally(() => {
      setDeletingId(null);
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Generator form */}
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Generate project ideas</h2>
        <p className="mt-1 text-sm text-gray-500">
          Describe the role you&apos;re targeting and we&apos;ll suggest portfolio projects
          that showcase the right skills.
        </p>

        <form className="mt-4 flex flex-col gap-4" onSubmit={handleGenerate}>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="target-role" className="text-sm font-medium text-gray-700">
              Target role
            </label>
            <input
              id="target-role"
              type="text"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder="e.g. Senior Backend Engineer"
              maxLength={100}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900
                placeholder:text-gray-400 transition-colors
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                focus-visible:border-primary"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="focus-skills" className="text-sm font-medium text-gray-700">
              Focus skills <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              id="focus-skills"
              type="text"
              value={focusSkills}
              onChange={(e) => setFocusSkills(e.target.value)}
              placeholder="e.g. PostgreSQL, Docker, GraphQL"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900
                placeholder:text-gray-400 transition-colors
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                focus-visible:border-primary"
            />
            <p className="text-xs text-gray-400">Separate skills with commas.</p>
          </div>

          <div>
            <button
              type="submit"
              disabled={!canGenerate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5
                text-sm font-medium text-white transition-colors hover:bg-primary/90
                disabled:cursor-not-allowed disabled:opacity-50
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                focus-visible:ring-offset-2"
            >
              {isLoading ? 'Generating…' : 'Generate projects'}
            </button>
          </div>
        </form>
      </section>

      {/* Error banner (dismissible) */}
      {error !== null && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-2xl bg-red-50 p-4"
        >
          <p className="text-sm text-red-600">{error.message}</p>
          <button
            type="button"
            onClick={clearError}
            aria-label="Dismiss error"
            className="shrink-0 rounded-md p-1 text-red-500 transition-colors hover:bg-red-100
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
      )}

      {/* Generated suggestions */}
      {generatedProjects.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Suggestions</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {generatedProjects.map((suggestion, index) => (
              <ProjectCard
                key={`${suggestion.title}-${index}`}
                suggestion={suggestion}
                variant="generated"
                onAction={() => handleSave(suggestion, index)}
                pending={savingIndex === index}
              />
            ))}
          </div>
        </section>
      )}

      {/* Loading placeholder */}
      {isLoading && generatedProjects.length === 0 && (
        <div
          className="rounded-2xl bg-white p-6 text-center shadow-sm"
          aria-label="Loading projects"
        >
          <p className="text-sm text-gray-500">Working on it…</p>
        </div>
      )}

      {/* Saved suggestions */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Saved projects</h2>
        {savedProjects.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {savedProjects.map((suggestion) => (
              <ProjectCard
                key={suggestion.id}
                suggestion={suggestion}
                variant="saved"
                onAction={() => handleDelete(suggestion.id)}
                pending={deletingId === suggestion.id}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <p className="text-sm text-gray-500">
              No saved projects yet. Generate some ideas and save the ones you like.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
