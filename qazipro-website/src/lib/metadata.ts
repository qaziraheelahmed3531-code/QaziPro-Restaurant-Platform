import type { Metadata } from "next";

const socialImage = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "QaziPro — connected restaurant technology and custom software",
};

export function pageMetadata(
  title: string,
  description: string,
  path: string,
  robots?: Metadata["robots"],
): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, images: [socialImage] },
    twitter: { card: "summary_large_image", title, description, images: [socialImage.url] },
    ...(robots ? { robots } : {}),
  };
}
