"use client";

import type { ProjectBlock } from "@/lib/projectInputSchema";

interface ProjectFormProps {
  project: ProjectBlock;
  onChange: (project: ProjectBlock) => void;
}

export function ProjectForm({ project, onChange }: ProjectFormProps) {
  return (
    <section className="section" id="project">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-muted">
            01
          </p>
          <h2 className="text-2xl font-semibold text-ink">Crear proyecto</h2>
        </div>
        <div className="rounded-md border border-line bg-soft px-3 py-2 text-xs text-muted">
          ID: <span className="font-mono text-ink">{project.id}</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label>
          <span className="label">Título</span>
          <input
            className="field"
            value={project.title}
            onChange={(event) =>
              onChange({ ...project, title: event.target.value })
            }
          />
        </label>

        <label>
          <span className="label">Cliente</span>
          <input
            className="field"
            value={project.client_name}
            onChange={(event) =>
              onChange({ ...project, client_name: event.target.value })
            }
          />
        </label>

        <label>
          <span className="label">Fase</span>
          <input
            className="field"
            value={project.phase}
            onChange={(event) =>
              onChange({ ...project, phase: event.target.value })
            }
          />
        </label>

        <label>
          <span className="label">Fecha</span>
          <input
            className="field"
            type="date"
            value={project.date}
            onChange={(event) =>
              onChange({ ...project, date: event.target.value })
            }
          />
        </label>

        <label>
          <span className="label">Idioma</span>
          <select
            className="field"
            value={project.language}
            onChange={(event) =>
              onChange({ ...project, language: event.target.value })
            }
          >
            <option value="es">es</option>
            <option value="ca">ca</option>
            <option value="en">en</option>
          </select>
        </label>

        <label>
          <span className="label">Template</span>
          <input
            className="field bg-soft"
            value={project.template_version}
            readOnly
          />
        </label>
      </div>
    </section>
  );
}
