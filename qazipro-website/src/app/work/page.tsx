import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Code2, Store } from "lucide-react";
import { ProjectGallery } from "@/components/project-gallery";
import { pageMetadata } from "@/lib/metadata";
import { portfolioProjects } from "@/lib/portfolio-projects";

export const metadata = pageMetadata("Our Work", "Selected QaziPro restaurant, commerce and custom software work.", "/portfolio");

export default function Work() {
  return <>
    <section className="page-hero portfolio-hero"><div className="container"><span className="eyebrow">SELECTED WORK</span><h1>Digital work made<br/><span>to earn attention.</span></h1><p>Restaurant platforms, commerce experiences and custom products—designed for the business behind the screen.</p><div className="portfolio-counts"><span><strong>{portfolioProjects.length}</strong> selected projects</span><span><strong>3</strong> focused capabilities</span><span><strong>1</strong> practical approach</span></div></div></section>

    <section className="content-section flagship-work"><div className="container"><div className="section-heading split-heading"><div><span className="eyebrow">FLAGSHIP PRODUCT</span><h2>QaziPro Restaurant Platform</h2></div><p>A shared foundation spanning admin, POS, online ordering, mobile and day-to-day restaurant operations.</p></div><div className="product-gallery"><figure data-cursor="EXPLORE"><Image src="/product/restaurant-admin-dashboard.png" width={1440} height={2384} sizes="(max-width: 900px) 100vw, 60vw" alt="QaziPro restaurant administration dashboard" loading="eager"/><figcaption>Restaurant operations dashboard · staging demonstration data</figcaption></figure><figure data-cursor="EXPLORE"><Image src="/product/restaurant-ordering.png" width={1440} height={844} sizes="(max-width: 900px) 100vw, 40vw" alt="QaziPro customer ordering website"/><figcaption>Customer ordering experience · staging demonstration brand</figcaption></figure></div><div className="content-grid"><article className="content-card"><Store size={27}/><h3>Connected operations</h3><p>Distinct staff and customer experiences share branch-aware business data.</p></article><article className="content-card"><Code2 size={27}/><h3>One product foundation</h3><p>Admin, POS, storefront, kitchen and mobile workflows evolve together.</p></article><article className="content-card"><ArrowUpRight size={27}/><h3>Built for the real shift</h3><p>Interfaces focus on clarity, speed and the details people need while working.</p></article></div><div className="work-link"><Link className="text-link" href="/restaurant-platform">Explore the platform <ArrowUpRight size={19}/></Link></div></div></section>

    <section className="content-section projects-section"><div className="container"><div className="section-heading split-heading"><div><span className="eyebrow">PROJECT PORTFOLIO</span><h2>Commerce, custom software<br/>and ordering experiences.</h2></div><p>Selected work and collaborations supplied by QaziPro. Contribution scope varies by engagement; detailed responsibilities are available during a project conversation.</p></div><ProjectGallery projects={portfolioProjects}/></div></section>

    <section className="content-section portfolio-integrity"><div className="container integrity-panel"><span className="eyebrow eyebrow-light">PUBLISHING WITH CARE</span><h2>Real client feedback belongs here—once it is approved.</h2><p>QaziPro does not invent testimonials, names, profile photos or results. Verified client stories can be added as soon as approved quotes and images are supplied.</p><Link className="button button-primary" href="/get-a-quote">Discuss a project <ArrowUpRight size={18}/></Link></div></section>
  </>;
}
