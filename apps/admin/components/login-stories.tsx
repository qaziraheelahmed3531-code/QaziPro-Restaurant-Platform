"use client";

import { useEffect, useState } from "react";
import { useReducedMotionPreference } from "@/lib/use-reduced-motion";
import { ArrowDown, ArrowUpRight, Check, ChefHat, ChevronLeft, ChevronRight, Globe2, Monitor, Pause, Play, ShoppingBag, Truck, UtensilsCrossed } from "lucide-react";

const stories = [
  { title: "From menu to moment.", name: "Online ordering", text: "Your menu. Your brand. A direct connection to your customers.", icon: Globe2, steps: ["Browse the menu", "Make it yours", "Order confirmed"], badge: "Your own storefront", detail: "A seamless ordering journey" },
  { title: "A calmer busy hour.", name: "Counter POS", text: "Keep the counter moving with one clear view of every order.", icon: Monitor, steps: ["Build an order", "Confirm payment", "Send to kitchen"], badge: "Counter to kitchen", detail: "Built around your service" },
  { title: "Every table, connected.", name: "Dine-in", text: "Bring your floor team and kitchen onto the same page.", icon: UtensilsCrossed, steps: ["Select the table", "Take the order", "Prepare the bill"], badge: "Table service", detail: "One connected floor" },
  { title: "Ready when they are.", name: "Pickup", text: "A clear handoff from the first order to the final collection.", icon: ShoppingBag, steps: ["Order received", "Freshly prepared", "Ready to collect"], badge: "Pickup & takeaway", detail: "Keep every handoff clear" },
  { title: "The last mile, in view.", name: "Delivery", text: "Keep dispatch, riders and order progress in sync.", icon: Truck, steps: ["Assign a rider", "Out for delivery", "Delivered"], badge: "Delivery operations", detail: "From your door to theirs" },
  { title: "A kitchen in rhythm.", name: "Kitchen", text: "Give your kitchen a focused view of what needs to happen next.", icon: ChefHat, steps: ["Confirm ticket", "Start preparing", "Mark ready"], badge: "Kitchen display", detail: "Clarity through every service" },
] as const;

export function LoginStories() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(true);
  const reduced = useReducedMotionPreference();
  const playing = reduced === false && !paused && !hovered && visible;
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setActive(value => (value + 1) % stories.length), 2200);
    return () => window.clearInterval(timer);
  }, [playing]);
  const story = stories[active];
  function select(index: number) { setPaused(true); setActive((index + stories.length) % stories.length); }
  return <section className="login-showcase" aria-roledescription="carousel" aria-label="Restaurant operations showcase"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={event => { if (!(event.target as HTMLElement).closest("[data-rotation-control]")) setPaused(true); }}>
    <header className="login-showcase__top"><span><i/>ONE CONNECTED WORKSPACE</span>
      <button data-rotation-control type="button" aria-label={paused || reduced ? "Start showcase rotation" : "Pause showcase rotation"}
        disabled={Boolean(reduced)} onClick={() => setPaused(value => !value)}>
        {paused || reduced ? <Play aria-hidden="true"/> : <Pause aria-hidden="true"/>}
      </button>
    </header>
    <div className="login-showcase__stage" aria-hidden="true">
      <div className="login-showcase__orbit"/><div className="login-showcase__backplate"/>
      {stories.map((item, index) => {
        const Icon = item.icon;
        return <div key={item.name} className={`login-showcase__slide ${active === index ? "is-active" : ""}`}>
          <div className="login-showcase__window">
            <div className="login-showcase__windowbar"><span><i/><i/><i/></span><small>QaziPro / {item.name}</small><ArrowUpRight/></div>
            <div className="login-showcase__workspace"><span className="login-showcase__module-icon"><Icon/></span><small>CONNECTED OPERATIONS</small><strong>{item.name}</strong><p>{item.detail}</p>
              <div className="login-showcase__steps">{item.steps.map((step, i) => <div key={step}><span>{i === 2 ? <Check/> : String(i + 1).padStart(2, "0")}</span><b>{step}</b>{i < 2 && <ArrowDown/>}</div>)}</div>
            </div>
          </div>
          <div className="login-showcase__floating"><span><Icon/></span><div><small>DESIGNED TO CONNECT</small><strong>{item.badge}</strong></div><Check/></div>
          <div className="login-showcase__ticket"><span>THE NEXT STEP</span><strong>{item.steps[2]}</strong><div/><small>QAZIPRO · OPERATIONS</small></div>
        </div>;
      })}
      <span className="login-showcase__preview-label">PRODUCT WORKFLOW PREVIEW</span>
    </div>
    <div className="login-showcase__copy" aria-live={playing ? "off" : "polite"} aria-atomic="true">
      <span>{String(active + 1).padStart(2, "0")} / {String(stories.length).padStart(2, "0")} — {story.name}</span>
      <div role="group" aria-roledescription="slide" aria-label={story.name}><h2 key={story.title}>{story.title}</h2><p>{story.text}</p></div>
    </div>
    <div className="login-showcase__controls">
      <div className="login-showcase__dots" role="group" aria-label="Choose an operation">{stories.map((item, index) => <button key={item.name} type="button" aria-label={`Show ${item.name}`} aria-pressed={index === active} onClick={() => select(index)}><span/></button>)}</div>
      <div className="login-showcase__arrows"><button type="button" aria-label="Previous operation" onClick={() => select(active - 1)}><ChevronLeft/></button><button type="button" aria-label="Next operation" onClick={() => select(active + 1)}><ChevronRight/></button></div>
    </div>
  </section>;
}
