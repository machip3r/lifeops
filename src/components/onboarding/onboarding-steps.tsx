import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Step indicator for the onboarding stepper. */
export function OnboardingSteps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Pasos del registro">
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li
            key={label}
            className="flex min-w-0 flex-1 items-center gap-2"
            aria-current={active ? "step" : undefined}
          >
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold",
                done && "border-(--lifeops-accent) bg-(--lifeops-accent) text-(--lifeops-on-accent)",
                active && "border-(--lifeops-accent) text-(--lifeops-accent)",
                !done && !active && "border-(--lifeops-border) text-(--lifeops-muted)",
              )}
            >
              {done ? <Check className="h-4 w-4" aria-hidden /> : index + 1}
            </span>
            <span
              className={cn(
                "hidden truncate text-sm sm:block",
                active ? "font-medium text-(--lifeops-fg)" : "text-(--lifeops-muted)",
              )}
            >
              {label}
            </span>
            {index < steps.length - 1 ? (
              <span className="h-0.5 min-w-4 flex-1 bg-(--lifeops-border)" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
