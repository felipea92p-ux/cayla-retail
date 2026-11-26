import { redirect } from "next/navigation";
import { exigirModulo, veModulo } from "@/lib/persona-actual";
import { entradaDeCompras } from "@/lib/compras-pestanas-reglas";
import { getTodasLasCompras } from "@/lib/compradores";
import { mesDeParametro } from "@/lib/facturacion-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { BotonDescargar } from "@/components/ui/BotonDescargar";
import { SelectorMesEnUrl } from "@/components/ui/SelectorMes";
import { BuscadorCompras } from "@/components/compras/BuscadorCompras";
import { TodasLasComprasVista, type PersonaDelFiltro } from "@/components/compras/TodasLasComprasVista";

// Compras ▸ Todas las compras (ADR-0704, Felipe 2026-11-26; antes «Historial de compras», ADR-0035/0111/0504): un solo libro. Lo de «Mis
// compras» desde que sale en un envío —antes solo aparecía al revisarse, y el 2026-11-26 había 33 compras ya enviadas que no se veían en
// ninguna lista— y lo que registró la oficina, en una fila cada una. Se busca por proveedor, persona o número, se elige el mes y la persona.
// Se fueron las cuatro cifras, las cinco píldoras de estado, seis de los ocho filtros y el orden por vencimiento (todo se paga al contado: los
// 36 comprobantes del 2026-11-26 estaban pagados). «Descargar el mes» sigue: es lo que se le manda al contador.

export default async function TodasLasComprasPage({ searchParams }: { searchParams: Promise<{ m?: string; q?: string; persona?: string }> }) {
  // La ruta abre con el módulo de siempre (`facturas_compra`) o con Por pagar, que sigue colgando de aquí; quien no ve esta lista cae en lo suyo.
  const persona = await exigirModulo("facturas_compra", "por_pagar");
  if (!veModulo(persona, "facturas_compra")) redirect(entradaDeCompras(persona.modulos.map((m) => m.clave)) ?? "/");
  const params = await searchParams;
  const hoy = hoyLima();
  const actual = { anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)) };
  const mes = mesDeParametro(params.m, actual);
  const desde = `${mes.anio}-${String(mes.mes).padStart(2, "0")}-01`;
  const hasta = new Date(Date.UTC(mes.anio, mes.mes, 0)).toISOString().slice(0, 10);
  const busqueda = params.q?.trim() ?? "";
  const personaId = params.persona ?? null;

  // Una lectura del mes (con la búsqueda): de ella salen el filtro de personas y, filtrada, la lista.
  const delMes = await getTodasLasCompras({ desde, hasta, busqueda: busqueda || null });
  const personas: PersonaDelFiltro[] = [];
  for (const c of delMes ?? []) if (c.personaId && !personas.some((p) => p.id === c.personaId)) personas.push({ id: c.personaId, nombre: c.persona ?? "" });
  personas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const compras = delMes && personaId ? delMes.filter((c) => c.personaId === personaId) : delMes;

  const hrefPersona = (id: string | null) => {
    const q = new URLSearchParams();
    if (params.m) q.set("m", params.m);
    if (busqueda) q.set("q", busqueda);
    if (id) q.set("persona", id);
    const s = q.toString();
    return s ? `/compras?${s}` : "/compras";
  };

  return (
    <TodasLasComprasVista
      compras={compras}
      personas={personas}
      personaId={personaId}
      busqueda={busqueda}
      buscador={<BuscadorCompras valor={busqueda} />}
      selectorMes={<SelectorMesEnUrl ruta="/compras" mes={mes} actual={actual} guia="todas.mes" />}
      descargar={
        // El registro de compras del mes que se le manda al contador (los comprobantes ya revisados).
        <BotonDescargar href={`/compras/exportar?mes=${desde.slice(0, 7)}`} guia="compras.exportar">
          Descargar el mes
        </BotonDescargar>
      }
      hrefPersona={hrefPersona}
    />
  );
}
