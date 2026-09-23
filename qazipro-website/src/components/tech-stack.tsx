import Image from "next/image";
import type { SimpleIcon } from "simple-icons";
import {
  siExpo,
  siFigma,
  siGithub,
  siNextdotjs,
  siNodedotjs,
  siPostgresql,
  siReact,
  siShopify,
  siSupabase,
  siTypescript,
  siVercel,
} from "simple-icons";

type StackItem = {
  name: string;
  icon?: SimpleIcon;
  image?: string;
};

const stack: StackItem[] = [
  { name: "Next.js", icon: siNextdotjs },
  { name: "React", icon: siReact },
  { name: "TypeScript", icon: siTypescript },
  { name: "Node.js", icon: siNodedotjs },
  { name: "Supabase", icon: siSupabase },
  { name: "PostgreSQL", icon: siPostgresql },
  { name: "Shopify", icon: siShopify },
  { name: "Liquid", image: "/brand/liquid-mark.png" },
  { name: "Expo", icon: siExpo },
  { name: "Vercel", icon: siVercel },
  { name: "Figma", icon: siFigma },
  { name: "GitHub", icon: siGithub },
];

function StackMark({ item }: { item: StackItem }) {
  if (item.image) {
    return <Image className="stack-brand-image" src={item.image} width={25} height={25} alt={`${item.name} logo`} />;
  }

  if (item.icon) {
    return (
      <svg
        className="stack-brand-icon"
        viewBox="0 0 24 24"
        role="img"
        aria-label={`${item.name} logo`}
        style={{ color: `#${item.icon.hex}` }}
      >
        <path fill="currentColor" d={item.icon.path} />
      </svg>
    );
  }

  return null;
}

export function TechStack() {
  return (
    <div className="stack-list">
      {stack.map((item) => (
        <div className="stack-item" key={item.name}>
          <span className="stack-icon-shell"><StackMark item={item} /></span>
          <strong>{item.name}</strong>
        </div>
      ))}
    </div>
  );
}
