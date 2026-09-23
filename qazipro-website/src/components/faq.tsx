export const faqs = [
  { question: "Can QaziPro provide only the restaurant POS?", answer: "Yes. The final scope is based on the restaurant's needs and agreed services. Additional connected modules can be planned separately." },
  { question: "Can more branches be added later?", answer: "Yes. QaziPro's restaurant architecture supports multiple branches under one restaurant identity, with branch-specific operational context." },
  { question: "Can Android or iOS apps be added later?", answer: "Yes. Mobile apps are optional services. Store release still requires the restaurant's approved branding, identifiers, credentials and publishing review." },
  { question: "How long does restaurant setup take?", answer: "It depends on the selected services, number of branches, menu data, branding and external credentials. QaziPro confirms a realistic schedule after reviewing the scope." },
  { question: "Does QaziPro build custom Shopify themes?", answer: "Yes. QaziPro can design and develop responsive Shopify theme experiences and reusable sections around an agreed storefront scope." },
  { question: "Can QaziPro maintain an existing project?", answer: "Potentially. We first review the codebase, hosting, security, dependencies and ownership so we can confirm whether ongoing work is responsible and practical." },
];

export function Faq() {
  return <div className="faq-list">{faqs.map((item) => <details key={item.question}><summary>{item.question}<span aria-hidden="true">+</span></summary><p>{item.answer}</p></details>)}</div>;
}
