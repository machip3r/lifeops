import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full min-w-0 rounded-lg border-2 border-(--lifeops-border) bg-(--lifeops-chrome) px-2.5 py-2 text-base text-(--lifeops-fg) transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-(--lifeops-accent) focus-visible:ring-3 focus-visible:ring-[#FBDBAC]/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm resize-y",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
