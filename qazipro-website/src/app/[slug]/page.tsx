import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ArrowUpRight, CircleCheck } from "lucide-react";
import { ProductVisual } from "@/components/product-visual";
import { pageMetadata } from "@/lib/metadata";
import { servicePages } from "@/lib/service-pages";

export function generateStaticParams() { return Object.keys(servicePages).map((slug) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = servicePages[slug];
  return page ? pageMetadata(page.title, page.description, `/${slug}`) : {};
}
export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = servicePages[slug];
  if (!page) notFound();
  const restaurant = ["restaurant-pos", "online-ordering", "restaurant-mobile-apps", "multi-branch"].includes(slug);
  const shopify = slug.startsWith("shopify");
  return <>
    <section className="page-hero"><div className="container page-hero-grid"><div><span className="eyebrow">{page.category}</span><h1>{page.title}</h1><p>{page.description}</p><Link className="button button-primary" href={restaurant ? "/book-a-demo" : "/get-a-quote"}>{page.cta} <ArrowUpRight size={18}/></Link></div>{shopify ? <div className="shopify-hero-visual" role="img" aria-label="Shopify development"><div className="shopify-orbit"/><Image className="shopify-wordmark" src="/brand/shopify-logo.png" width={960} height={540} alt="Shopify" priority/><Image className="shopify-bag" src="/brand/shopify-mark-clean.png" width={420} height={430} alt=""/></div> : <ProductVisual compact/>}</div></section>
    <section className="content-section"><div className="container"><div className="section-heading"><span className="eyebrow">THE APPROACH</span><h2>Made to make a difference in the details.</h2><p>{page.intro}</p></div><div className="content-grid">{page.points.map(({ title, description, icon: Icon }) => <article className="content-card" key={title}><Icon size={26} strokeWidth={1.7}/><h3>{title}</h3><p>{description}</p></article>)}</div></div></section>
    <section className="content-section" id={slug === "full-stack-development" ? "business-software" : undefined}><div className="container feature-grid"><div><span className="eyebrow">CAPABILITIES</span><h2>Useful parts of one considered experience.</h2><p className="text-muted">Scope is confirmed for each project. We only present capabilities supported by the agreed QaziPro solution.</p></div><ul className="capability-list">{page.capabilities.map((capability) => <li key={capability}><CircleCheck size={18}/>{capability}</li>)}</ul></div></section>
    <section className="content-section"><div className="container"><div className="section-heading"><span className="eyebrow">HOW IT WORKS</span><h2>{page.processTitle}</h2></div><div className="process-grid">{page.process.map((item, index) => <div key={item}><span>0{index+1}</span><h3>{["Start", "Shape", "Connect", "Move forward"][index]}</h3><p>{item}</p></div>)}</div></div></section>
    <section className="content-section center-cta"><div className="container"><h2>Let&apos;s see what fits your business.</h2><p>We&apos;ll talk through your current workflow and the next useful step, without pretending every project needs the same solution.</p><Link className="button button-dark" href={restaurant ? "/book-a-demo" : "/get-a-quote"}>{page.cta} <ArrowRight size={18}/></Link></div></section>
  </>;
}
