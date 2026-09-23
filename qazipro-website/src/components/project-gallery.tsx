"use client";

import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { useMemo, useState } from "react";
import type { PortfolioProject, ProjectCategory } from "@/lib/portfolio-projects";

const filters: Array<"All" | ProjectCategory> = ["All", "Shopify", "Custom software", "Online ordering"];

export function ProjectGallery({ projects }: { projects: PortfolioProject[] }) {
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const visible = useMemo(() => filter === "All" ? projects : projects.filter((project) => project.category === filter), [filter, projects]);

  return <>
    <div className="project-filters" role="group" aria-label="Filter projects">
      {filters.map((item) => <button type="button" key={item} className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>{item}</button>)}
    </div>
    <div className="project-grid">
      {visible.map((project, index) => <a className={`project-card ${index === 0 ? "project-card-featured" : ""}`} href={project.url} target="_blank" rel="noopener noreferrer" key={project.domain} data-cursor="VIEW">
        <div className="project-image">
          {project.image ? <Image src={project.image} alt={`${project.name} website preview`} fill sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw"/> : <div className="project-placeholder"><span>{project.name.slice(0, 2).toUpperCase()}</span></div>}
          <span className="project-open"><ArrowUpRight size={19}/></span>
        </div>
        <div className="project-meta"><span>{project.category}</span><span>{project.domain}</span></div>
        <h3>{project.name}</h3><p>{project.note}</p>
      </a>)}
    </div>
  </>;
}
