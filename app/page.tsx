"use client";

import { useEffect, useState } from "react";
import { FilesForm } from "@/components/FilesForm";
import { PlanningForm } from "@/components/PlanningForm";
import { ProjectForm } from "@/components/ProjectForm";
import { ReviewSubmit } from "@/components/ReviewSubmit";
import { SiteForm } from "@/components/SiteForm";
import { SurveyForm } from "@/components/SurveyForm";
import { buildProjectInput } from "@/lib/buildProjectInput";
import { runAnalysisEngine } from "@/lib/analysisEngine";
import { normalizePlanningInput } from "@/lib/planningNormalizer";
import type { ProjectInputV2 } from "@/lib/projectInputSchema";
import { updateRequirementsAndWorkflow } from "@/lib/updateRequirementsAndWorkflow";

const STORAGE_KEY = "dossieres.project_input_v2";

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function normalizeInput(
  seed?: Partial<ProjectInputV2>,
  options: { touch?: boolean } = {},
): ProjectInputV2 {
  return updateRequirementsAndWorkflow(
    normalizePlanningInput(buildProjectInput(seed)),
    options.touch ? new Date().toISOString() : undefined,
  );
}

export default function Home() {
  const [projectInput, setProjectInput] = useState<ProjectInputV2>(() =>
    normalizeInput(),
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setProjectInput(normalizeInput(JSON.parse(stored) as Partial<ProjectInputV2>));
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projectInput));
    }
  }, [hydrated, projectInput]);

  function commit(updater: (current: ProjectInputV2) => ProjectInputV2) {
    setProjectInput((current) => normalizeInput(updater(current), { touch: true }));
  }

  function resetProject() {
    const next = normalizeInput();
    window.localStorage.removeItem(STORAGE_KEY);
    setProjectInput(next);
  }

  function handleRunAnalysis() {
    setProjectInput((current) => {
      const analyzed = runAnalysisEngine(current);
      const refreshed = updateRequirementsAndWorkflow(
        analyzed,
        new Date().toISOString(),
      );

      return {
        ...refreshed,
        workflow: {
          ...refreshed.workflow,
          can_generate_pdf: current.workflow.can_generate_pdf,
          current_step: analyzed.workflow.current_step,
          next_action: analyzed.workflow.next_action,
          warnings: uniqueStrings([
            ...refreshed.workflow.warnings,
            ...analyzed.workflow.warnings,
          ]),
        },
        analysis: analyzed.analysis,
        graphics: analyzed.graphics,
        indesign: analyzed.indesign,
      };
    });
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1440px] px-4 py-7 sm:px-7">
      <header className="mb-6 grid gap-6 border-b border-line pb-7 lg:grid-cols-[1fr_360px] lg:items-start">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-normal text-muted">
            DOSSIERES
          </p>
          <h1 className="max-w-[720px] text-4xl font-bold leading-none tracking-normal text-ink sm:text-5xl">
            Intake arquitectónico
          </h1>
        </div>
        <div className="border border-line bg-paper p-4 shadow-soft">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="panel-label">Workflow</p>
              <p className="font-semibold text-ink">{projectInput.workflow.status}</p>
            </div>
            <div>
              <p className="panel-label">Missing</p>
              <p className="font-semibold text-ink">
                {projectInput.requirements.missing.length}
              </p>
            </div>
            <div className="col-span-2">
              <p className="panel-label">Project ID</p>
              <p className="truncate font-mono text-xs font-semibold text-ink">
                {projectInput.project.id}
              </p>
            </div>
          </div>
        </div>
      </header>

      <ProjectForm
        project={projectInput.project}
        onChange={(project) =>
          commit((current) => ({
            ...current,
            project,
          }))
        }
      />

      <SiteForm
        site={projectInput.site}
        onChange={(site) =>
          commit((current) => ({
            ...current,
            site,
          }))
        }
      />

      <FilesForm
        assets={projectInput.assets}
        onChange={(assets) =>
          commit((current) => ({
            ...current,
            assets,
          }))
        }
      />

      <SurveyForm
        projectInput={projectInput}
        onChange={(next) => commit(() => next)}
      />

      <PlanningForm
        assets={projectInput.assets}
        planning={projectInput.planning}
        site={projectInput.site}
        onChange={(next) =>
          commit((current) => ({
            ...current,
            assets: next.assets ?? current.assets,
            planning: next.planning ?? current.planning,
          }))
        }
      />

      <ReviewSubmit
        projectInput={projectInput}
        onReset={resetProject}
        onRunAnalysis={handleRunAnalysis}
      />
    </main>
  );
}
