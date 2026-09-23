"use client";

import { useEffect, useState } from "react";
import { ChefHat, Globe2, MapPin, Monitor, ShoppingBag, Truck, UtensilsCrossed } from "lucide-react";

const stories = [
  { title: "Online ordering", text: "Your menu, orders and updates in one place.", icon: Globe2 },
  { title: "In-store POS", text: "Keep counter service moving, even on busy days.", icon: Monitor },
  { title: "Dine-in", text: "Help the floor and kitchen work together.", icon: UtensilsCrossed },
  { title: "Pickup", text: "A clear path from order to collection.", icon: ShoppingBag },
  { title: "Delivery", text: "Manage delivery work from the right outlet.", icon: Truck },
  { title: "Kitchen", text: "See what is preparing and what is ready.", icon: ChefHat },
  { title: "Multi-branch", text: "One view of the locations you manage.", icon: MapPin },
] as const;

export function LoginStories() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActive(value => (value + 1) % stories.length), 5000);
    return () => window.clearInterval(timer);
  }, []);
  const story = stories[active];
  const Icon = story.icon;
  return <section className="login-stories" aria-label="QaziPro restaurant operations">
    <div className="login-stories__top"><strong>QaziPro</strong><span>RESTAURANT OPERATIONS</span></div>
    <div className="login-stories__scene" aria-hidden="true"><div className="login-stories__scene-header"><span /><span /><span /></div><div className="login-stories__scene-body"><span className="login-stories__scene-icon"><Icon /></span><div><i /><i /><i /></div></div><div className="login-stories__scene-footer"><span /><span /><span /></div></div>
    <div className="login-stories__copy" aria-live="off"><span>ONE CONNECTED WORKSPACE</span><h2 key={story.title}>{story.title}</h2><p>{story.text}</p></div>
    <div className="login-stories__dots" role="group" aria-label="Product capabilities">{stories.map((item, index) => <button key={item.title} type="button" aria-label={`Show ${item.title}`} aria-pressed={index === active} onClick={() => setActive(index)} />)}</div>
  </section>;
}
