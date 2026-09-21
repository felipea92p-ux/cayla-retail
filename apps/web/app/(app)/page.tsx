import Link from "next/link";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { fechaCorta, listarMovimientos, textoDelta } from "@/lib/movimientos-v2";
import { etiquetaMovimiento } from "@/lib/movimientos-reglas";
import { ID_CARGO_ESPECIAL } from "@/lib/cargo-especial";

// Fase UI 1 (2026-09-11): rediseño completo, no una adaptación de
// `app/(app)/page.tsx` (V1) — ese Inicio se arma sobre `inteligencia.ts`,
// `finanzas.ts`, `panel.ts` y `taller.ts`, todos calculando sobre tablas que
// V2 ya no tiene (stock_minimo, cajas, patrimonio). Mostrar esos KPIs con
// datos de otro esquema sería la "compatibilidad falsa" que la tarea
// prohíbe explícitamente. Esta versión solo muestra lo que V2 puede probar
// hoy: conteos reales y el mismo historial de `movimientos` que la pantalla
// de Movimientos.
//
// Correcciones de la auditoría `docs/pantallas/inicio.md` (2026-09-21): tareas #1, #7, #8
// y #10 más la celda gris de la grilla de acciones. Quedan pendientes las que dependen de
// decidir cómo es el Inicio por rol y sede (#4): «Hoy», «Por atender» y las acciones por rol.

const ACCIONES = [
  { href: "/buscar", etiqueta: "Buscar", detalle: "Stock por SKU, referencia, talla o color" },
  // ADR-0111 + ADR-0113: una sola puerta para recibir, la misma para todos: cuenta cualquier colaborador de la sede.
  { href: "/recibir", etiqueta: "Recibir mercadería", detalle: "Lo que llegó, contra sus comprobantes" },
  { href: "/inventario", etiqueta: "Inventario", detalle: "Stock por ubicación" },
  { href: "/productos", etiqueta: "Productos", detalle: "Catálogo completo" },
  { href: "/inventario/movimientos", etiqueta: "Movimientos", detalle: "Por qué cambió el stock" },
];

export default async function InicioPage() {
  const persona = await requirePersonaActualV2();
  const supabase = await createClient();

  const [productos, variantes, stock, actividad] = await Promise.all([
    // «Activos» de verdad: sin este filtro la tarjeta contaba también los descontinuados y
    // los rechazados (que la base fuerza a `descontinuado`, `productos_rechazado_descontinuado_check`).
    supabase.from("productos").select("id", { count: "exact", head: true }).eq("estado", "activo"),
    // Solo prendas reales y vigentes: fuera las inactivas y la variante centinela del
    // «Monto manual», que no es una prenda (misma exclusión que el stock de abajo).
    supabase
      .from("variantes")
      .select("id", { count: "exact", head: true })
      .eq("activo", true)
      .neq("id", ID_CARGO_ESPECIAL),
    supabase
      .from("stock")
      .select("cantidad")
      .eq("ubicacion_id", persona.ubicacionId)
      // Sin la variante centinela del «Monto manual» (999.999 unidades ficticias).
      .neq("variante_id", ID_CARGO_ESPECIAL),
    // Los últimos 8 de todo el historial (sin el recorte de 30 días de la
    // pantalla de Movimientos): en Inicio importa «lo último», no un período.
    // Dato secundario: si falla, las tarjetas y las acciones siguen vivas y el aviso se pinta
    // en el lugar de la lista — nunca una lista vacía que parezca «sin actividad» (principio 9).
    listarMovimientos(persona.ubicacionId, {}, { limite: 8 }).then(
      (pagina) => ({ filas: pagina.filas, fallo: null as string | null }),
      () => ({
        filas: [],
        fallo: "No se pudo cargar la actividad reciente. Lo demás de esta pantalla sí está al día.",
      })
    ),
  ]);

  const totalProductos = exigir({ data: productos.count, error: productos.error }, "el total de productos");
  const totalVariantes = exigir({ data: variantes.count, error: variantes.error }, "el total de variantes");
  const filasStock = exigir(stock, "el stock de tu ubicación");
  const unidadesEnUbicacion = filasStock.reduce((acc, f) => acc + f.cantidad, 0);
  const { filas: movimientosRecientes, fallo: falloActividad } = actividad;

  // La sede ya la dicen el selector de la cabecera y la tarjeta de unidades: aquí solo el saludo.
  const primerNombre = persona.nombre.trim().split(/\s+/)[0];

  return (
    <div className="space-y-10">
      <h1 className="font-display text-2xl text-tinta">{primerNombre ? `Hola, ${primerNombre}` : "Hola"}</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <TarjetaSimple etiqueta="Productos activos" valor={String(totalProductos ?? 0)} />
        <TarjetaSimple etiqueta="Variantes (SKU)" valor={String(totalVariantes ?? 0)} />
        <TarjetaSimple etiqueta={`Unidades en ${persona.ubicacionEtiqueta}`} valor={String(unidadesEnUbicacion)} />
      </div>

      <div>
        <p className="label-cayla mb-3 text-[11px] text-tinta/65">Acciones</p>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-tinta/12 bg-tinta/12">
          {ACCIONES.map((a, i) => (
            <Link
              key={a.href}
              href={a.href}
              // Con un número impar de tarjetas la última ocupa la fila entera: la celda vacía
              // dejaba a la vista el fondo gris que hace de línea divisoria entre tarjetas.
              className={`group bg-crema p-5 transition-colors hover:bg-papel ${
                i === ACCIONES.length - 1 && ACCIONES.length % 2 === 1 ? "col-span-2" : ""
              }`}
            >
              <p className="text-sm font-medium text-tinta group-hover:text-rojo">{a.etiqueta}</p>
              <p className="mt-1 text-xs text-tinta/65">{a.detalle}</p>
            </Link>
          ))}
        </div>
      </div>

      {falloActividad && (
        <p role="status" className="rounded-xl border border-tinta/12 bg-papel px-5 py-3 text-sm text-tinta/75">
          {falloActividad}
        </p>
      )}

      {movimientosRecientes.length > 0 && (
        <div>
          <p className="label-cayla mb-3 text-[11px] text-tinta/65">Actividad reciente</p>
          <div className="card-cayla divide-y divide-tinta/10">
            {movimientosRecientes.map((m) => (
              <div key={m.id} className="flex items-baseline gap-3 px-5 py-2.5">
                <span className="w-16 shrink-0 text-xs tabular-nums text-tinta/65">{fechaCorta(m.fecha).slice(0, 5)}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-tinta">
                  <span className="label-cayla text-[11px] text-tinta/65">{etiquetaMovimiento(m)}</span> {m.referencia}{" "}
                  <span className="text-tinta/65">{m.sku}</span>
                </span>
                <span className={`shrink-0 text-sm tabular-nums ${m.delta > 0 ? "text-verde-profundo" : "text-tinta/75"}`}>{textoDelta(m)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TarjetaSimple({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="card-cayla p-5">
      <p className="label-cayla text-[11px] text-tinta/65">{etiqueta}</p>
      <p className="font-display mt-2 text-3xl text-tinta">{valor}</p>
    </div>
  );
}
