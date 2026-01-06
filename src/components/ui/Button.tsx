import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const buttonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40",
    {
        variants: {
            variant: {
                default: "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-white/90 dark:active:bg-white/80",
                destructive: "bg-red-500 text-white hover:bg-red-600 active:bg-red-700 dark:bg-white/10 dark:text-white dark:hover:bg-white/15 dark:active:bg-white/20",
                outline: "border border-zinc-200 dark:border-white/10 bg-transparent hover:bg-zinc-100 dark:hover:bg-white/5 active:bg-zinc-200 dark:active:bg-white/10 text-foreground",
                secondary: "bg-zinc-100 dark:bg-white/10 text-zinc-900 dark:text-white hover:bg-zinc-200 dark:hover:bg-white/15 active:bg-zinc-300 dark:active:bg-white/20",
                ghost: "hover:bg-zinc-100 dark:hover:bg-white/5 active:bg-zinc-200 dark:active:bg-white/10 text-foreground",
                link: "text-foreground underline-offset-4 hover:underline active:underline",
            },
            size: {
                default: "h-12 px-5 py-2 text-base", // Mobile friendly larger size
                sm: "h-9 rounded-md px-3 text-sm",
                lg: "h-14 rounded-lg px-8 text-lg",
                icon: "h-10 w-10 rounded-lg",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : "button"
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button, buttonVariants }
