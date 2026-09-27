import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-[var(--ip-radius-medium)] border border-transparent bg-clip-padding text-[15px] font-semibold tracking-[0.1px] whitespace-nowrap transition-[background-color,color,border-color,transform,box-shadow] duration-150 outline-none select-none focus-visible:border-[var(--ip-border-focus)] focus-visible:ring-3 focus-visible:ring-[color-mix(in_srgb,var(--ip-border-focus)_22%,transparent)] active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:bg-[var(--ip-action-disabled)] disabled:text-[var(--ip-text-disabled)] disabled:opacity-100 aria-invalid:border-[var(--ip-status-error)] aria-invalid:ring-3 aria-invalid:ring-[color-mix(in_srgb,var(--ip-status-error)_18%,transparent)] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--ip-brand-primary)] text-[var(--ip-text-inverse)] hover:bg-[var(--ip-brand-primary-hover)]",
        outline:
          "border-[var(--ip-border-strong)] bg-[var(--ip-surface-default)] text-[var(--ip-text-primary)] hover:border-[var(--ip-brand-primary)] hover:text-[var(--ip-text-brand)]",
        secondary:
          "bg-[var(--ip-brand-secondary)] text-[var(--ip-text-on-secondary)] hover:bg-[var(--ip-brand-secondary-hover)]",
        ghost:
          "text-[var(--ip-text-primary)] hover:bg-[var(--ip-background-subtle)]",
        destructive:
          "bg-[var(--ip-status-error)] text-white hover:bg-[var(--ip-status-error-hover)]",
        link: "text-[var(--ip-text-brand)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 gap-2 px-4",
        xs: "h-9 gap-1.5 px-3 text-sm",
        sm: "h-9 gap-1.5 px-3 text-sm",
        lg: "h-[52px] gap-2 px-5",
        icon: "size-11",
        "icon-xs": "size-9",
        "icon-sm": "size-10",
        "icon-lg": "size-[52px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
