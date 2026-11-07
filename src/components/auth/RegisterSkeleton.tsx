/**
 * Register skeleton — mounted instantly while the lazy Register chunk and
 * the admin-status query resolve, so the page appears with its final
 * two-column shape instead of a bare "Loading…" flash.
 * Lightweight by design (no lucide imports) for fast first paint.
 */
export default function RegisterSkeleton() {
  return (
    <main className="register-page register-wide" aria-busy="true" aria-label="Loading">
      <div className="register-shell">
        <RegisterSkeletonBody />
      </div>
    </main>
  );
}

export function RegisterSkeletonBody() {
  return (
    <>
      <div className="reg-intro">
        <span className="reg-skel reg-skel-kicker" aria-hidden="true" />
        <span className="reg-skel reg-skel-title" aria-hidden="true" />
        <span className="reg-skel reg-skel-lede" aria-hidden="true" />
      </div>

      <div className="reg-card reg-skeleton-card">
        <div className="reg-form">
          <div className="reg-group">
            <span className="reg-skel reg-skel-group" aria-hidden="true" />
            <div className="reg-fields">
              <FieldSkel />
              <FieldSkel />
            </div>
          </div>

          <div className="reg-group">
            <span className="reg-skel reg-skel-group" aria-hidden="true" />
            <div className="reg-fields">
              <FieldSkel className="reg-span-2" />
              <FieldSkel />
              <FieldSkel />
              <FieldSkel />
              <FieldSkel />
            </div>
          </div>

          <div className="reg-group">
            <span className="reg-skel reg-skel-group" aria-hidden="true" />
            <div className="reg-fields">
              <FieldSkel />
              <FieldSkel />
              <FieldSkel className="reg-span-2" />
            </div>
          </div>

          <div className="reg-actions">
            <span className="reg-skel reg-skel-line" aria-hidden="true" />
            <span className="reg-skel reg-skel-button" aria-hidden="true" />
          </div>
        </div>
      </div>

      <p className="register-footer" aria-hidden="true">
        <span className="reg-skel reg-skel-footer" />
      </p>
    </>
  );
}

function FieldSkel({ className }: { className?: string }) {
  return (
    <div className={className ?? ""}>
      <span className="reg-skel reg-skel-label" aria-hidden="true" />
      <span className="reg-skel reg-skel-input" aria-hidden="true" />
    </div>
  );
}
