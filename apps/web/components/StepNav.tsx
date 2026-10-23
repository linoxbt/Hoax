import Link from "next/link";

/** Back and next links at the foot of an onboarding step. */
export function StepNav({ back, next, nextLabel = "Next", nextDisabled = false }: { back?: string; next?: string; nextLabel?: string; nextDisabled?: boolean }) {
  return (
    <div className="row" style={{ marginTop: 40, paddingTop: 24, borderTop: "1px solid var(--line)" }}>
      {back && (
        <Link href={back} className="pill ghost">
          ← Back
        </Link>
      )}
      {next &&
        (nextDisabled ? (
          <span className="pill" style={{ opacity: 0.4, cursor: "not-allowed" }}>
            {nextLabel} →
          </span>
        ) : (
          <Link href={next} className="pill">
            {nextLabel} →
          </Link>
        ))}
    </div>
  );
}
