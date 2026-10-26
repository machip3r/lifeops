import * as React from "react"

import { cn } from "@/lib/utils"

/** Native select with the same chrome as `Input` (keyboard + mobile pickers for free). */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-12 w-full min-w-0 rounded-lg border-2 border-(--lifeops-border) bg-(--lifeops-chrome) px-3 text-base text-(--lifeops-fg) transition-colors outline-none focus-visible:border-(--lifeops-accent) focus-visible:ring-3 focus-visible:ring-[#FBDBAC]/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Select }
