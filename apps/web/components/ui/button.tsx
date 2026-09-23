import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] px-4 text-sm font-semibold transition-[background-color,color,border-color,transform] duration-200 ease-out disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-white hover:bg-primary-hover",
        secondary: "border border-border bg-background text-foreground hover:bg-surface",
        ghost: "text-foreground hover:bg-surface-strong",
        destructive: "bg-danger text-white hover:brightness-90",
      },
      size: {
        default: "h-11",
        sm: "h-9 min-h-9 px-3 text-[0.8125rem]",
        icon: "size-11 px-0",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
