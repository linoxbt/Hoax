import { Btn } from "./Ui";

/** Back and next at the foot of an onboarding step. */
export function StepNav({ back, next, nextLabel = "Next", nextDisabled = false }: { back?: string; next?: string; nextLabel?: string; nextDisabled?: boolean }) {
  return (
    <div className="row stepnav">
      {back && (
        <Btn href={back} arrow="w">
          Back
        </Btn>
      )}
      {next &&
        (nextDisabled ? (
          <Btn disabled fill>
            {nextLabel}
          </Btn>
        ) : (
          <Btn href={next} fill>
            {nextLabel}
          </Btn>
        ))}
    </div>
  );
}
