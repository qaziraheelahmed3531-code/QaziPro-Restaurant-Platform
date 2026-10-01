import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Blocks,
  ChefHat,
  CircleCheck,
  Code2,
  Globe2,
  Layers3,
  MonitorSmartphone,
  ShoppingBag,
  Smartphone,
  Store,
  Workflow,
} from "lucide-react";
import { ProductVisual } from "@/components/product-visual";
import { Faq, faqs } from "@/components/faq";
import { TechStack } from "@/components/tech-stack";
import { portfolioProjects } from "@/lib/portfolio-projects";
import { getPublishedDocument } from "@/lib/platform-cms";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { url: "/" },
};

const ecosystem = [
  {
    icon: Store,
    title: "Restaurant POS",
    detail: "Web and desktop workflows for the pace of service.",
  },
  {
    icon: Globe2,
    title: "Online ordering",
    detail: "Your menu, your brand, your direct customer relationship.",
  },
  {
    icon: Smartphone,
    title: "Branded mobile apps",
    detail: "Android and iOS experiences on a shared foundation.",
  },
  {
    icon: ChefHat,
    title: "Kitchen & operations",
    detail: "Orders, preparation, stock and teams kept in context.",
  },
  {
    icon: BarChart3,
    title: "Multi-branch insight",
    detail: "See the whole business without losing local detail.",
  },
  {
    icon: Layers3,
    title: "One source of truth",
    detail: "Changes made once can flow through connected channels.",
  },
];

const marqueeItems = [
  "RESTAURANT SYSTEMS",
  "COMMERCE",
  "CUSTOM SOFTWARE",
  "CONNECTED OPERATIONS",
];
const marqueeLoopItems = [...marqueeItems, ...marqueeItems, ...marqueeItems];

export default async function Home() {
  const home = await getPublishedDocument("home", {
    eyebrow: "SOFTWARE BUILT AROUND YOUR BUSINESS",
    title: "One connected system.",
    description:
      "QaziPro brings restaurant operations, online ordering and branded apps together—and builds custom digital products for businesses ready to move forward.",
    primaryCtaLabel: "Book a demo",
    primaryCtaHref: "/book-a-demo",
  });
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
  const featuredProjects = portfolioProjects
    .filter((project) => project.image)
    .slice(0, 3);
  return (
    <>
      <section className="hero">
        <div className="hero-grid-lines" aria-hidden="true" />
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="eyebrow-line" /> {String(home.eyebrow)}
            </span>
            <h1>
              <span className="hero-line">
                <span>{String(home.title)}</span>
              </span>
              <span className="hero-line">
                <em>More room to grow.</em>
              </span>
            </h1>
            <p>{String(home.description)}</p>
            <div className="hero-actions">
              <Link className="button button-primary" href={String(home.primaryCtaHref)}>
                {String(home.primaryCtaLabel)} <ArrowUpRight size={19} />
              </Link>
              <Link className="button button-outline" href="/services">
                Explore what we build <ArrowRight size={19} />
              </Link>
            </div>
            <div className="hero-proof">
              <span>
                <CircleCheck size={17} /> Designed for real operations
              </span>
              <span>
                <CircleCheck size={17} /> Built to scale across branches
              </span>
            </div>
          </div>
          <ProductVisual />
        </div>
        <div className="hero-bottom-line">
          <div className="marquee-track">
            {[0, 1].map((group) => (
              <div
                className="marquee-group"
                aria-hidden={group === 1 ? true : undefined}
                key={group}
              >
                {marqueeLoopItems.map((item, index) => (
                  <span
                    className="marquee-item"
                    key={`${group}-${index}-${item}`}
                  >
                    <b>{item}</b>
                    <i aria-hidden="true">✦</i>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="section section-intro">
        <div className="container">
          <div className="section-heading split-heading">
            <div>
              <span className="eyebrow">WHAT WE DO</span>
              <h2>
                Technology that fits
                <br />
                <span className="serif-accent">the way you work.</span>
              </h2>
            </div>
            <p>
              We build practical systems with a polished customer experience.
              From one restaurant counter to a tailored web product, every piece
              should work together—not add another layer of complexity.
            </p>
          </div>
          <div className="offer-grid">
            <Link
              href="/restaurant-platform"
              className="offer-card offer-card-featured"
            >
              <span className="offer-number">01 / RESTAURANT TECHNOLOGY</span>
              <div className="offer-icon">
                <Store size={29} />
              </div>
              <h3>
                Run the restaurant.
                <br />
                Delight the customer.
              </h3>
              <p>
                POS, online ordering, kitchen, inventory, websites, apps and
                branches connected through one platform.
              </p>
              <span className="offer-link">
                Explore the platform <ArrowUpRight size={18} />
              </span>
            </Link>
            <Link href="/shopify-development" className="offer-card">
              <span className="offer-number">02 / COMMERCE</span>
              <div className="offer-icon">
                <ShoppingBag size={28} />
              </div>
              <h3>
                Make your store
                <br />
                feel like your brand.
              </h3>
              <p>
                Shopify development and custom themes designed for a better
                buying experience.
              </p>
              <span className="offer-link">
                Explore Shopify <ArrowUpRight size={18} />
              </span>
            </Link>
            <Link href="/full-stack-development" className="offer-card">
              <span className="offer-number">03 / CUSTOM DEVELOPMENT</span>
              <div className="offer-icon">
                <Code2 size={28} />
              </div>
              <h3>
                Build the product
                <br />
                you actually need.
              </h3>
              <p>
                Web apps, APIs and integrations planned as dependable business
                systems.
              </p>
              <span className="offer-link">
                Explore development <ArrowUpRight size={18} />
              </span>
            </Link>
          </div>
        </div>
      </section>
      <section className="section platform-section">
        <div className="container">
          <div className="platform-heading">
            <div>
              <span className="eyebrow eyebrow-light">
                THE QAZIPRO RESTAURANT PLATFORM
              </span>
              <h2>
                Your operation moves.
                <br />
                <span>Your systems should move together.</span>
              </h2>
            </div>
            <p>
              A menu update should not mean changing five tools. QaziPro
              connects the touchpoints your team and customers use every day.
            </p>
          </div>
          <div className="ecosystem-grid">
            {ecosystem.map(({ icon: Icon, title, detail }, index) => (
              <div className="ecosystem-item" key={title}>
                <span className="ecosystem-index">0{index + 1}</span>
                <Icon size={24} strokeWidth={1.6} />
                <h3>{title}</h3>
                <p>{detail}</p>
              </div>
            ))}
          </div>
          <Link href="/restaurant-platform" className="text-link light-link">
            See how it all connects <ArrowUpRight size={19} />
          </Link>
        </div>
      </section>
      <section className="section feature-section">
        <div className="container feature-grid">
          <div className="feature-art">
            <div className="feature-art-panel">
              <div className="feature-art-top">
                <span>
                  <i />
                  <i />
                  <i />
                </span>
                <strong>One update. Every channel.</strong>
              </div>
              <div className="feature-node feature-node-main">
                <Layers3 size={24} />
                <div>
                  <strong>Restaurant Admin</strong>
                  <small>Menu · pricing · availability</small>
                </div>
              </div>
              <div className="feature-connector" />
              <div className="feature-node-grid">
                <div className="feature-node">
                  <MonitorSmartphone size={22} />
                  <strong>Website</strong>
                </div>
                <div className="feature-node">
                  <Store size={22} />
                  <strong>POS</strong>
                </div>
                <div className="feature-node">
                  <Smartphone size={22} />
                  <strong>Apps</strong>
                </div>
                <div className="feature-node">
                  <ChefHat size={22} />
                  <strong>Kitchen</strong>
                </div>
              </div>
            </div>
          </div>
          <div className="feature-copy">
            <span className="eyebrow">CONNECTED BY DESIGN</span>
            <h2>
              Keep the detail.
              <br />
              Lose the duplication.
            </h2>
            <p>
              Update products, prices and availability in the restaurant system.
              Connected customer and staff experiences read from the same
              business data, with branch context where it matters.
            </p>
            <ul className="check-list">
              <li>
                <CircleCheck size={19} /> One restaurant identity across
                channels
              </li>
              <li>
                <CircleCheck size={19} /> Branch-aware ordering and operations
              </li>
              <li>
                <CircleCheck size={19} /> Built for people at the counter and on
                the go
              </li>
            </ul>
            <Link className="text-link" href="/online-ordering">
              Discover online ordering <ArrowUpRight size={19} />
            </Link>
          </div>
        </div>
      </section>
      <section className="section development-section">
        <div className="container">
          <div className="section-heading split-heading">
            <div>
              <span className="eyebrow">BEYOND RESTAURANTS</span>
              <h2>
                Websites, software and systems.
                <br />
                Built as one experience.
              </h2>
            </div>
            <p>
              QaziPro designs the interface customers see and engineers the
              backend, data and integrations that keep the business running.
            </p>
          </div>
          <div className="development-grid">
            <Link href="/shopify-development" className="development-card">
              <div className="development-icon shopify-card-icon">
                <Image
                  src="/brand/shopify-mark-clean.png"
                  width={38}
                  height={39}
                  alt="Shopify"
                />
              </div>
              <span>SHOPIFY COMMERCE</span>
              <h3>Shopify, shaped around your business.</h3>
              <p>
                Stores, custom themes and conversion-focused experiences built
                for the way customers buy.
              </p>
              <ArrowUpRight size={20} />
            </Link>
            <Link href="/full-stack-development" className="development-card">
              <div className="development-icon">
                <Blocks size={25} />
              </div>
              <span>FULL-STACK WEB</span>
              <h3>Frontend clarity. Backend confidence.</h3>
              <p>
                Corporate websites, web apps, dashboards, APIs, databases and
                authentication engineered together.
              </p>
              <ArrowUpRight size={20} />
            </Link>
            <Link
              href="/full-stack-development#business-software"
              className="development-card"
            >
              <div className="development-icon">
                <Workflow size={25} />
              </div>
              <span>BUSINESS SOFTWARE</span>
              <h3>Software shaped around the work.</h3>
              <p>
                SaaS products, internal portals, workflow automation and custom
                integrations for real operations.
              </p>
              <ArrowUpRight size={20} />
            </Link>
          </div>
        </div>
      </section>
      <section className="section home-work">
        <div className="container">
          <div className="section-heading split-heading">
            <div>
              <span className="eyebrow">SELECTED WORK</span>
              <h2>
                Built for real brands.
                <br />
                Made for real people.
              </h2>
            </div>
            <p>
              Selected commerce and software work, with live experiences you can
              explore.
            </p>
          </div>
          <div className="home-work-grid">
            {featuredProjects.map((project) => (
              <a
                href={project.url}
                target="_blank"
                rel="noopener noreferrer"
                className="home-work-card"
                key={project.domain}
                data-cursor="VIEW"
              >
                <div>
                  <Image
                    src={project.image!}
                    alt={`${project.name} website preview`}
                    fill
                    sizes="(max-width: 720px) 100vw, 33vw"
                  />
                </div>
                <span>
                  {project.category} · {project.domain}
                </span>
                <h3>{project.name}</h3>
              </a>
            ))}
          </div>
          <Link className="text-link home-work-link" href="/portfolio">
            See all selected work <ArrowUpRight size={19} />
          </Link>
        </div>
      </section>
      <section className="section process-section">
        <div className="container">
          <div className="section-heading">
            <span className="eyebrow">HOW WE WORK</span>
            <h2>Thoughtful from the first conversation.</h2>
            <p>
              Good software starts by understanding the work it needs to
              support.
            </p>
          </div>
          <div className="process-grid">
            <div>
              <span>01</span>
              <h3>Understand</h3>
              <p>
                We listen to the business, the people and the existing workflow.
              </p>
            </div>
            <div>
              <span>02</span>
              <h3>Design</h3>
              <p>
                We shape a clear experience before committing to implementation.
              </p>
            </div>
            <div>
              <span>03</span>
              <h3>Build</h3>
              <p>
                We develop, test and refine the parts that make the system
                dependable.
              </p>
            </div>
            <div>
              <span>04</span>
              <h3>Improve</h3>
              <p>We support the launch and learn from real use.</p>
            </div>
          </div>
        </div>
      </section>
      <section className="section stack-section">
        <div className="container">
          <div className="section-heading split-heading">
            <div>
              <span className="eyebrow">TECHNOLOGY, WITH A PURPOSE</span>
              <h2>
                A modern foundation.
                <br />
                Chosen for the work.
              </h2>
            </div>
            <p>
              Our stack supports responsive products, secure server-side
              workflows and connected data. Tools are selected for the
              problem—not placed on the page as decoration.
            </p>
          </div>
          <TechStack />
        </div>
      </section>
      <section className="section faq-section">
        <div className="container feature-grid">
          <div>
            <span className="eyebrow">COMMON QUESTIONS</span>
            <h2>A few useful answers before we talk.</h2>
            <p className="text-muted">
              Project scope, timing and services are confirmed after a real
              conversation—never assumed from a generic package.
            </p>
            <Link className="text-link" href="/contact">
              Ask another question <ArrowUpRight size={18} />
            </Link>
          </div>
          <Faq />
        </div>
      </section>
      <section className="section closing-section">
        <div className="container closing-panel">
          <div>
            <span className="eyebrow eyebrow-light">LET&apos;S TALK</span>
            <h2>
              Have an operation to connect
              <br />
              or an idea to build?
            </h2>
            <p>
              Tell us where you are now. We&apos;ll help map the next sensible
              step.
            </p>
          </div>
          <div className="closing-actions">
            <Link className="button button-primary" href="/book-a-demo">
              Book a demo <ArrowUpRight size={19} />
            </Link>
            <Link className="button button-light-outline" href="/get-a-quote">
              Start a project <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqSchema).replace(/</g, "\\u003c"),
        }}
      />
    </>
  );
}
