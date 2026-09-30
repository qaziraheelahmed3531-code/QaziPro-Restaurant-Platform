// This boundary sits ABOVE the authenticated dashboard layout. Segment-level
// loading.tsx files cannot stream while their parent layout resolves access.
// Only public platform copy is rendered here; all restaurant data stays gated.
export default function Loading() {
  return (
    <main className="state-box" aria-busy="true" aria-label="Opening QaziPRO">
      <h1>QaziPRO</h1>
      <p role="status">Checking your access and opening your workspace…</p>
    </main>
  );
}
