import { Pestanas } from "@/components/ui/Pestanas";

// Las vistas del Plan de campaña (ADR-0372, C3 y C6 · Felipe 2026-10-12; Presupuesto y Calendario, Felipe 2026-10-26): armar el plan, ver cuánto cuesta y si cabe
// en el tope, elegir con cuáles campañas te quedas el año, ver lo que pasó en una campaña y la historia de todas, año por año. Cada una vive en su URL: «Atrás» vuelve a la anterior.
export type PestanaDelPlan = "plan" | "presupuesto" | "calendario" | "resultados" | "historial";

export function PestanasPlan({ activa, planId }: { activa: PestanaDelPlan; /** La campaña que se está mirando: Resultados abre esa. */ planId?: string }) {
  const conPlan = planId ? `?plan=${planId}` : "";
  return (
    <Pestanas
      idIndicador="plan-compra-vistas"
      guia="plan.vistas"
      etiquetaAccesible="Vistas del Plan de campaña"
      activa={activa}
      items={[
        { clave: "plan", etiqueta: "Plan", href: `/compras/plan${conPlan}`, ayuda: "Cuánto comprar de cada categoría" },
        { clave: "presupuesto", etiqueta: "Presupuesto", href: `/compras/plan/presupuesto${conPlan}`, ayuda: "Cuánto cuesta el plan, si cabe en tu tope y las versiones que guardaste" },
        { clave: "calendario", etiqueta: "Calendario", href: `/compras/plan/calendario${conPlan}`, ayuda: "Con cuáles campañas te quedas el año, cuáles se repiten y cuáles descansan" },
        { clave: "resultados", etiqueta: "Resultados", href: `/compras/plan/resultados${conPlan}`, ayuda: "Lo que se vendió de verdad en la campaña" },
        { clave: "historial", etiqueta: "Historial", href: "/compras/plan/historial", ayuda: "Lo que vendió cada tienda en cada campaña, año por año" },
      ]}
    />
  );
}
