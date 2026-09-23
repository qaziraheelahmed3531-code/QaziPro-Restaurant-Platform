"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { WhatsAppSupportLink } from "@/components/whatsapp-support-link";

export type HelpTopic = { title: string; description: string; href: string };

export function HelpCenter({ restaurantName, topics }: { restaurantName: string; topics: HelpTopic[] }) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => topics.filter(topic => `${topic.title} ${topic.description}`.toLowerCase().includes(query.trim().toLowerCase())), [query, topics]);
  return <div className="help-center">
    <section className="help-center__hero">
      <span className="eyebrow">QAZIPRO SUPPORT</span>
      <h1>How can we help?</h1>
      <p>Find the right workflow, or talk with our support team.</p>
      <div className="help-center__hero-actions"><label><Search aria-hidden="true" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search help topics" aria-label="Search help topics" /></label><WhatsAppSupportLink restaurantName={restaurantName} className="help-center__contact" /></div>
    </section>
    <section className="help-center__section" aria-labelledby="help-topics-title"><div className="page-heading"><div><h2 id="help-topics-title">Guides by task</h2><p>Go straight to the screen where the work happens.</p></div></div>
      {visible.length ? <div className="help-center__grid">{visible.map(topic => <Link key={topic.href} href={topic.href} className="help-center__topic"><strong>{topic.title}</strong><p>{topic.description}</p><span>Open guide <ArrowUpRight aria-hidden="true" /></span></Link>)}</div> : <div className="state-box">No matching guides. Try another search or contact support.</div>}
    </section>
    <section className="help-center__section" aria-labelledby="help-shortcuts-title"><div className="page-heading"><div><h2 id="help-shortcuts-title">Keyboard shortcuts</h2><p>Shortcuts work outside form fields.</p></div></div><div className="help-center__shortcuts"><span>Open command palette</span><kbd>Ctrl K</kbd><span>Dashboard / Orders / Menu</span><kbd>Ctrl 1 / 2 / 3</kbd><span>Reports / Customers / Settings</span><kbd>Ctrl 4 / 5 / 6</kbd><span>Navigate commands</span><kbd>↑ ↓ Enter Esc</kbd></div></section>
    <section className="help-center__section" aria-labelledby="help-faq-title"><div className="page-heading"><div><h2 id="help-faq-title">Common questions</h2></div></div><div className="help-center__faq"><details><summary>Why is online ordering paused?</summary><p>Check the selected outlet, opening hours and its ordering status. Authorized staff can resume a temporary pause from the top bar.</p></details><details><summary>Where do I update menu prices?</summary><p>Open Menu, edit the product, then check any branch-specific price override before saving.</p></details><details><summary>How do I see an order in the kitchen?</summary><p>Open Orders to confirm the order, then use Kitchen for the permitted preparation steps. The server enforces legal status transitions.</p></details><details><summary>Why can’t I see a page?</summary><p>Your access depends on your restaurant role and assigned branches. Ask your owner or manager to review your permissions.</p></details></div></section>
  </div>;
}
