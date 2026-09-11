import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "@/lib/utils"

// Variantes semaforo CAYLA (verde/ambar/rojo/neutro) ademas de las de shadcn:
// las pastillas de estado (semaforo(), estiloEstado()) ya calculan CUAL variante
// usar, este componente solo centraliza el className repetido en ~9 archivos.
// El texto de verde/ambar/rojo usa el color "-profundo": `text-verde` sobre
// `bg-verde/10` reprueba contraste AA (ver el comentario de globals.css sobre
// los chips de estado) — profundo es el que sobrevive sobre su propio tinte.
const badgeVariants = cva(
  "label-cayla inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-3 py-1 text-[11px] whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground [a&]:hover:bg-destructive/90",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        verde: "border-verde/45 bg-verde/10 text-verde-profundo",
        ambar: "border-ambar/30 bg-ambar/10 text-ambar-profundo",
        rojo: "border-rojo/30 bg-rojo/10 text-rojo-profundo",
        neutro: "border-tinta/20 bg-tinta/5 text-tinta/65",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
