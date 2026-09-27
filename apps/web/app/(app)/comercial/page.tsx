import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getPanelComercial } from "@/lib/comercial";
import { PanelComercialVista } from "@/components/PanelComercialVista";

// Panel comercial (ADR-0110). Responde "¿cómo va cada tienda hoy, esta semana y este mes, y contra su meta?".
// Solo Líder: es la pregunta de quien decide, no la del mostrador (mismo criterio que Compras y el Resumen de
// Inventario), y ve TODAS las tiendas a la vez — sin selector de ubicación, porque comparar tiendas es el punto.
// El candado real vive también en las tres funciones SQL (`fn_es_lider()`); esta redirección es la cortesía,
// no la seguridad. Esta página solo trae datos y elige el layout; las reglas viven en `lib/comercial-reglas.ts`.
export default async function ComercialPage() {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") redirect("/");

  const panel = await getPanelComercial();
  const fechaLarga = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${panel.fecha}T12:00:00-05:00`));

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Comercial · {fechaLarga}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Cómo va cada tienda</h1>
        <p className="mt-1 text-sm text-tinta/65">
          Lo vendido hoy, esta semana y este mes por tienda, contra su meta, con las horas fuertes y las ventas por
          colaboradora.
        </p>
        <p className="mt-2 text-sm">
          <Link href="/comercial/calidad" className="text-tinta underline underline-offset-4 hover:text-rojo">
            Calidad: qué se devuelve y por qué →
          </Link>
        </p>
      </div>

      <PanelComercialVista panel={panel} />
    </div>
  );
}
