"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Check, Download, LoaderCircle, RotateCcw } from "lucide-react";
import {
  calculatePricing,
  type OnboardingDefinition,
  type OnboardingField,
} from "@/lib/onboarding";

type Result = { reference: string; pdfUrl: string };

function InputField({
  field,
  value,
  onChange,
}: {
  field: OnboardingField;
  value: string;
  onChange: (value: string) => void;
}) {
  const common = {
    id: `field-${field.id}`,
    name: field.id,
    required: field.required,
    value,
    onChange: (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => onChange(event.target.value),
    placeholder: field.placeholder || undefined,
  };
  if (field.type === "textarea") return <textarea {...common} rows={3} />;
  if (field.type === "select" || field.type === "radio")
    return (
      <select {...common}>
        <option value="">Select</option>
        {field.options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    );
  if (field.type === "checkbox")
    return (
      <input
        id={common.id}
        name={common.name}
        required={common.required}
        checked={value === "true"}
        onChange={(event) => onChange(String(event.target.checked))}
        type="checkbox"
      />
    );
  const type = field.type === "phone" ? "tel" : field.type;
  return <input {...common} type={type} />;
}

function SignaturePad({ onChange }: { onChange: (value: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (event.currentTarget.width / rect.width),
      y:
        (event.clientY - rect.top) * (event.currentTarget.height / rect.height),
    };
  };
  const start = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = point(event),
      ctx = event.currentTarget.getContext("2d");
    ctx?.beginPath();
    ctx?.moveTo(p.x, p.y);
  };
  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const p = point(event),
      ctx = event.currentTarget.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#16151a";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const finish = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const element = canvas.current;
    if (element) onChange(element.toDataURL("image/png"));
  };
  const clear = () => {
    const element = canvas.current,
      ctx = element?.getContext("2d");
    if (element && ctx) ctx.clearRect(0, 0, element.width, element.height);
    onChange("");
  };
  return (
    <div className="signature-field">
      <canvas
        ref={canvas}
        width={900}
        height={220}
        aria-label="Draw your signature"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
      <div>
        <small>Draw with your finger, mouse or pen.</small>
        <button type="button" onClick={clear}>
          <RotateCcw size={15} /> Clear signature
        </button>
      </div>
    </div>
  );
}

export function ClientOnboardingForm({
  definition,
  version,
  available,
}: {
  definition: OnboardingDefinition;
  version: number;
  available: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({
    locations: "1",
  });
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [packageId, setPackageId] = useState<string | null>(
    definition.packages.find((item) => item.active)?.id ?? null,
  );
  const [signature, setSignature] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const requestKey = useRef<string>("");
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);
  const services = definition.services
    .filter((item) => item.active)
    .sort((a, b) => a.order - b.order);
  const packages = definition.packages
    .filter((item) => item.active)
    .sort((a, b) => a.order - b.order);
  const fields = definition.fields
    .filter((item) => item.enabled)
    .sort((a, b) => a.order - b.order);
  const locations = Math.min(
    10000,
    Math.max(1, Number.parseInt(values.locations || "1", 10) || 1),
  );
  const pricing = useMemo(
    () => calculatePricing(definition, packageId, serviceIds, locations),
    [definition, packageId, serviceIds, locations],
  );
  const configuredSections = definition.sections.map((item, index) => ({
    ...item,
    order: item.order ?? index + 1,
  }));
  const section = (id: string, title: string, order: number) =>
    configuredSections.find((item) => item.id === id) ?? {
      id,
      title,
      enabled: true,
      order,
    };
  const clientSection = section("client", "Client Information", 1);
  const servicesSection = section("services", "Services to Avail", 2);
  const agreementSection = section("agreement", "Package Agreed", 3);
  const termsSection = section("terms", "Terms & Notes", 4);
  const signatureSection = section("signature", "Client Signature", 5);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!signature) {
      setError("Please add your signature before submitting.");
      return;
    }
    if (!consent) {
      setError("Please confirm the agreement checkbox.");
      return;
    }
    setPending(true);
    setError("");
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
    try {
      const response = await fetch("/api/client-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKey: requestKey.current,
          values,
          serviceIds,
          packageId,
          signature,
          consent,
          website: "",
          startedAt: startedAt.current,
        }),
      });
      const body = (await response.json()) as {
        message?: string;
        reference?: string;
        pdfUrl?: string;
      };
      if (!response.ok || !body.reference || !body.pdfUrl)
        throw new Error(
          body.message ||
            "We couldn't submit your form. Your information is still here. Please try again.",
        );
      setResult({ reference: body.reference, pdfUrl: body.pdfUrl });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We couldn't submit your form. Your information is still here. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  if (result)
    return (
      <section className="onboarding-success" aria-live="polite">
        <span>
          <Check />
        </span>
        <p className="eyebrow">APPLICATION SUBMITTED</p>
        <h2>Thank you. Your signed copy is ready.</h2>
        <p>
          Reference <strong>{result.reference}</strong>. The QaziPro team will
          review the submitted scope and contact you about the next step.
        </p>
        <div>
          <a className="button button-primary" href={result.pdfUrl}>
            <Download size={18} /> Download signed PDF
          </a>
          <button
            className="button button-outline"
            type="button"
            onClick={() => window.print()}
          >
            Print confirmation
          </button>
        </div>
      </section>
    );

  return (
    <form
      className="client-onboarding-form"
      onSubmit={submit}
      aria-busy={pending}
    >
      <header>
        <p className="eyebrow">FORM VERSION {version || "PREVIEW"}</p>
        <h2>{definition.title}</h2>
        <p>{definition.intro}</p>
      </header>
      {clientSection.enabled ? <section style={{order:clientSection.order}}>
        <h3>{String(clientSection.order).padStart(2,"0")}. {clientSection.title}</h3>
        <div className="onboarding-fields">
          {fields.map((field) => (
            <label
              key={field.id}
              className={field.type === "textarea" ? "wide" : ""}
              htmlFor={`field-${field.id}`}
            >
              <span>
                {field.label}
                {field.required ? <b aria-hidden="true"> *</b> : null}
              </span>
              <InputField
                field={field}
                value={values[field.id] ?? ""}
                onChange={(value) =>
                  setValues((current) => ({ ...current, [field.id]: value }))
                }
              />
            </label>
          ))}
        </div>
        <label className="form-honeypot" aria-hidden="true">
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </section> : null}
      {servicesSection.enabled ? <section style={{order:servicesSection.order}}>
        <h3>{String(servicesSection.order).padStart(2,"0")}. {servicesSection.title}</h3>
        <div className="service-selection">
          {services.map((item) => {
            const checked = serviceIds.includes(item.id);
            return (
              <label className={checked ? "selected" : ""} key={item.id}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setServiceIds((current) =>
                      checked
                        ? current.filter((id) => id !== item.id)
                        : [...current, item.id],
                    )
                  }
                />
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                </span>
                <Check size={18} />
              </label>
            );
          })}
        </div>
      </section> : null}
      {agreementSection.enabled ? <section style={{order:agreementSection.order}}>
        <h3>{String(agreementSection.order).padStart(2,"0")}. {agreementSection.title}</h3>
        <div className="package-selection">
          {packages.map((item) => (
            <label
              className={packageId === item.id ? "selected" : ""}
              key={item.id}
            >
              <input
                type="radio"
                name="package"
                checked={packageId === item.id}
                onChange={() => setPackageId(item.id)}
              />
              <strong>{item.name}</strong>
              <span>{item.description}</span>
              <b>
                {item.monthlyFee == null
                  ? "Custom Quote"
                  : `${item.currency} ${item.monthlyFee.toLocaleString()}/month`}
              </b>
            </label>
          ))}
        </div>
        <div className="pricing-summary">
          <div>
            <span>Monthly</span>
            <strong>
              {pricing.hasQuotedPrice
                ? `${pricing.currency} ${pricing.monthly.toLocaleString()}`
                : "Custom quote"}
            </strong>
          </div>
          <div>
            <span>Setup</span>
            <strong>
              {pricing.hasQuotedPrice
                ? `${pricing.currency} ${pricing.setup.toLocaleString()}`
                : "To be confirmed"}
            </strong>
          </div>
          <div>
            <span>Location fees</span>
            <strong>
              {pricing.hasQuotedPrice
                ? `${pricing.currency} ${pricing.locationFee.toLocaleString()}`
                : "To be confirmed"}
            </strong>
          </div>
        </div>
        <p className="form-note">
          Final amounts are calculated again on the server from the currently
          published package—not from browser values.
        </p>
      </section> : null}
      {termsSection.enabled ? <section style={{order:termsSection.order}}>
        <h3>{String(termsSection.order).padStart(2,"0")}. {termsSection.title}</h3>
        <ul className="terms-list">
          {definition.terms
            .filter((item) => item.active)
            .sort((a, b) => a.order - b.order)
            .map((item) => (
              <li key={item.id}>{item.text}</li>
            ))}
        </ul>
      </section> : null}
      {signatureSection.enabled ? <section style={{order:signatureSection.order}}>
        <h3>{String(signatureSection.order).padStart(2,"0")}. {signatureSection.title}</h3>
        <SignaturePad onChange={setSignature} />
        <label className="consent-row">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          <span>{definition.consentText}</span>
        </label>
      </section> : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {!available ? (
        <p className="form-error" role="alert">
          The published onboarding service is not available in this environment
          yet.
        </p>
      ) : null}
      <button
        className="button button-primary onboarding-submit"
        type="submit"
        disabled={pending || !available}
      >
        {pending ? (
          <>
            <LoaderCircle className="spinner" /> Submitting…
          </>
        ) : (
          "Submit Application"
        )}
      </button>
      <p className="privacy-note">
        Your signature and contact details are used only for QaziPro onboarding
        and are not exposed through public APIs.
      </p>
    </form>
  );
}
