export type ProjectCategory = "Shopify" | "Custom software" | "Online ordering";

export type PortfolioProject = {
  name: string;
  domain: string;
  url: string;
  category: ProjectCategory;
  image?: string;
  note: string;
};

export const portfolioProjects: PortfolioProject[] = [
  { name: "Allbirds", domain: "allbirds.com", url: "https://www.allbirds.com/", category: "Shopify", image: "/projects/allbirds.jpg", note: "Global commerce experience" },
  { name: "Function18", domain: "function18.com", url: "https://www.function18.com/", category: "Shopify", image: "/projects/function18.jpg", note: "Performance retail storefront" },
  { name: "SuitShop", domain: "suitshop.com", url: "https://suitshop.com/", category: "Shopify", image: "/projects/suitshop.jpg", note: "Fashion commerce experience" },
  { name: "Gymshark", domain: "gymshark.com", url: "https://www.gymshark.com/", category: "Shopify", image: "/projects/gymshark.jpg", note: "High-scale retail experience" },
  { name: "SWATI", domain: "swati.com", url: "https://www.swati.com/", category: "Shopify", image: "/projects/swati.jpg", note: "International beauty commerce" },
  { name: "Beard & Blade", domain: "beardandblade.com.au", url: "https://www.beardandblade.com.au/", category: "Shopify", image: "/projects/beard-and-blade.jpg", note: "Specialist retail storefront" },
  { name: "LAQ Store", domain: "laqstore.com", url: "https://laqstore.com/", category: "Shopify", note: "Protected commerce storefront" },
  { name: "Ainak Wear", domain: "ainakwear.com", url: "https://ainakwear.com/", category: "Shopify", image: "/projects/ainakwear.jpg", note: "Eyewear commerce experience" },
  { name: "GlassizMart", domain: "glassizmart.pk", url: "https://glassizmart.pk/", category: "Shopify", image: "/projects/glassizmart.jpg", note: "Eyewear commerce storefront" },
  { name: "VYRO", domain: "vyro.pk", url: "https://vyro.pk/", category: "Shopify", image: "/projects/vyro.jpg", note: "Pakistan retail storefront" },
  { name: "LandEarly", domain: "landearly.com", url: "https://www.landearly.com/", category: "Custom software", image: "/projects/landearly.jpg", note: "SaaS-style web experience" },
  { name: "Hire AI Score", domain: "hireaiscore.com", url: "https://www.hireaiscore.com/", category: "Custom software", image: "/projects/hireaiscore.jpg", note: "AI product experience" },
  { name: "Lords School", domain: "lordsschool.edu.pk", url: "https://lordsschool.edu.pk/", category: "Custom software", image: "/projects/lords-school.jpg", note: "Education website" },
  { name: "ALFSS", domain: "alfss.edu.pk", url: "https://alfss.edu.pk/", category: "Custom software", image: "/projects/alfss.jpg", note: "Education platform" },
  { name: "The Academy", domain: "theacademy.net.pk", url: "https://www.theacademy.net.pk/", category: "Custom software", image: "/projects/the-academy.jpg", note: "Learning experience" },
  { name: "DAG Clinic", domain: "dagclinic.com", url: "https://www.dagclinic.com/", category: "Custom software", image: "/projects/dag-clinic.jpg", note: "Healthcare website" },
  { name: "Dental Professionals", domain: "dentalprofessionals.pk", url: "https://www.dentalprofessionals.pk/", category: "Custom software", image: "/projects/dental-professionals.jpg", note: "Healthcare website" },
  { name: "ST Media", domain: "thestmedia.com", url: "https://thestmedia.com/", category: "Custom software", image: "/projects/st-media.jpg", note: "Creative agency website" },
  { name: "Nuqta Creative Studio", domain: "nuqtacreativestudio.com", url: "https://www.nuqtacreativestudio.com/", category: "Custom software", image: "/projects/nuqta-creative-studio.jpg", note: "Studio portfolio experience" },
  { name: "Muncho Bites", domain: "munchobites.com", url: "https://munchobites.com/", category: "Online ordering", image: "/projects/muncho-bites.jpg", note: "Restaurant ordering website" },
  { name: "Legend Cafe", domain: "legendcafe.pk", url: "https://www.legendcafe.pk/", category: "Online ordering", note: "Restaurant ordering website" },
];
