import { SegmentoEnlaces } from "@/components/ui/SegmentoEnlaces";

// Las dos partes del Presupuesto (ADR-0527, spike ⑤): «Costos y tope» (cuánto cuesta lo que el plan pide comprar y si cabe en el tope) y «Cuándo se paga» (cuándo se pide, cómo se paga y qué ve Finanzas).
// Son enlaces: la parte elegida vive en la URL, así se comparte y «atrás» funciona. Cambiar de una a otra no suma una entrada al historial.
export type ParteDelPresupuesto = "costos" | "pagos";

export function PartesDelPresupuesto({ activa, planId }: { activa: ParteDelPresupuesto; planId: string }) {
  const conPlan = `?plan=${planId}`;
  return (
    <SegmentoEnlaces
      className="w-fit"
      guia="presupuesto.partes"
      etiquetaAccesible="Partes del Presupuesto"
      activo={activa}
      opciones={[
        { valor: "costos", etiqueta: "Costos y tope", href: `/compras/plan/presupuesto${conPlan}` },
        { valor: "pagos", etiqueta: "Cuándo se paga", href: `/compras/plan/presupuesto/pagos${conPlan}` },
      ]}
    />
  );
}
