import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, JSX } from 'react';

import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { KpiCard } from '../../components/KpiCard';
import { Panel } from '../../components/Panel';
import { ProjectCard } from '../../components/Upskilling/ProjectCard';
import type { ISaveProjectInput } from '../../services/upskilling.service';
import { useUpskillingStore } from '../../stores/upskilling.store';
import type { IGenerateProjectsInput, IProjectSuggestion } from '../../types/upskilling.types';

/**
 * ProjectsTab — Role-Based Project Generator, presented as an AI career-growth
 * dashboard (Bauhaus redesign, see docs/GLOBAL_REDESIGN.md §4).
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  KPI cards (Technical · Portfolio · Career · Industry)         │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  Generate project ideas (target role + focus skills)           │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  Recommendations — 3-column responsive grid of project cards   │
 *   │  Saved projects   — 3-column responsive grid of project cards  │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Lets the user enter a target role plus optional focus skills, generate 3–5 AI
 * portfolio-project suggestions, save the ones they like, view details inline,
 * and review/delete previously saved suggestions. Loading and error states are
 * surfaced from the shared Zustand store (Req 1.1, 1.3, 2.1, 2.2, 2.4).
 */

/** Derived career-growth metrics rendered in the KPI row (all 0–100). */
interface IUpskillingMetrics {
  technicalSkillScore: number;
  portfolioReadiness: number;
  careerReadiness: number;
  industryAlignment: number;
}

/**
 * Derive the four dashboard KPI scores from the suggestions currently in view.
 * There is no dedicated metrics endpoint yet, so these are computed
 * client-side: a larger, more advanced, well-saved portfolio reads as higher
 * career readiness. All values are clamped to 0–100.
 */
function computeMetrics(
  saved: IProjectSuggestion[],
  generated: IProjectSuggestion[],
): IUpskillingMetrics {
  const all = [...saved, ...generated];
  const uniqueSkills = new Set(all.flatMap((project) => project.demonstratedSkills));
  const advancedCount = all.filter((project) => project.difficulty === 'Advanced').length;

  const technicalSkillScore = Math.min(100, uniqueSkills.size * 8);
  const portfolioReadiness = Math.min(100, saved.length * 20);
  const industryAlignment =
    all.length === 0 ? 0 : Math.round((advancedCount / all.length) * 100);
  const careerReadiness = Math.round(
    (technicalSkillScore + portfolioReadiness + industryAlignment) / 3,
  );

  return { technicalSkillScore, portfolioReadiness, careerReadiness, industryAlignment };
}

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

  const metrics = useMemo(
    () => computeMetrics(savedProjects, generatedProjects),
    [savedProjects, generatedProjects],
  );

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
      {/* Generator toolbar — mirrors the Job Search "Search Job" toolbar */}
      <Panel aria-label="Generate project ideas" title="Generate Project Ideas">
        <form
          className="grid items-center gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]"
          onSubmit={handleGenerate}
        >
          <Input
            type="text"
            value={targetRole}
            aria-label="Target role"
            placeholder="Target role (e.g. Senior Backend Engineer)"
            maxLength={100}
            onChange={(e): void => setTargetRole(e.target.value)}
          />

          <Input
            type="text"
            value={focusSkills}
            aria-label="Focus skills"
            placeholder="Focus skills (comma separated, optional)"
            onChange={(e): void => setFocusSkills(e.target.value)}
          />

          <Button type="submit" disabled={!canGenerate}>
            {isLoading ? 'Generating…' : 'Generate'}
          </Button>
        </form>
      </Panel>

      {/* KPI row — career-growth metrics */}
      <section
        aria-label="Career growth metrics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <KpiCard
          label="Technical Skill Score"
          value={metrics.technicalSkillScore}
          tone="blue"
          unit="%"
        />
        <KpiCard
          label="Portfolio Readiness"
          value={metrics.portfolioReadiness}
          tone="yellow"
          unit="%"
        />
        <KpiCard
          label="Career Readiness"
          value={metrics.careerReadiness}
          tone="red"
          unit="%"
        />
        <KpiCard
          label="Industry Alignment Score"
          value={metrics.industryAlignment}
          tone="red"
          unit="%"
        />
      </section>

      {/* Error banner (dismissible) */}
      {error !== null && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-2xl bg-accent-red/10 p-4"
        >
          <p className="text-sm text-accent-red">{error.message}</p>
          <button
            type="button"
            onClick={clearError}
            aria-label="Dismiss error"
            className="shrink-0 rounded-md p-1 text-accent-red transition-colors hover:bg-accent-red/10
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-red/40"
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

      {/* Generated suggestions — 3-column responsive grid */}
      {generatedProjects.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-ink">Recommendations</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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
        <Panel aria-label="Loading projects" className="text-center">
          <p className="text-sm text-muted">Working on it…</p>
        </Panel>
      )}

      {/* Saved suggestions — 3-column responsive grid */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">Saved projects</h2>
        {savedProjects.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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
          <Panel aria-label="No saved projects" className="text-center">
            <p className="text-sm text-muted">
              No saved projects yet. Generate some ideas and save the ones you like.
            </p>
          </Panel>
        )}
      </section>
    </div>
  );
}
