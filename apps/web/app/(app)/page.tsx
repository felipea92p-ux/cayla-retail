import Link from "next/link";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { tolerar } from "@/lib/resultado";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { etiquetaActividad, fechaCorta, listarMovimientos, textoDelta } from "@/lib/movimientos-v2";
import { ID_CARGO_ESPECIAL } from "@/lib/cargo-especial";

// Fase UI 1 (2026-09-11): rediseño completo, no una adaptación de
// `app/(app)/page.tsx` (V1) — ese Inicio se arma sobre `inteligencia.ts`,
// `finanzas.ts`, `panel.ts` y `taller.ts`, todos calculando sobre tablas que
// V2 ya no tiene (stock_minimo, cajas, patrimonio). Mostrar esos KPIs con
// datos de otro esquema sería la "compatibilidad falsa" que la tarea
// prohíbe explícitamente. Esta versión solo muestra lo que V2 puede probar
// hoy: conteos reales y el mismo historial de `movimientos` que la pantalla
// de Movimientos.
export default async function InicioPage() {
  const persona = await requirePersonaActualV2();
  const supabase = await createClient();

  const [productos, variantes, stock, actividad] = await Promise.all([
    supabase.from("productos").select("id", { count: "exact", head: true }),
    supabase.from("variantes").select("id", { count: "exact", head: true }),
    supabase
      .from("stock")
      .select("cantidad")
      .eq("ubicacion_id", persona.ubicacionId)
      // Sin la variante centinela del «Monto manual» (999.999 unidades ficticias).
      .neq("variante_id", ID_CARGO_ESPECIAL),
    // Los últimos 8 de todo el historial (sin el recorte de 30 días de la
    // pantalla de Movimientos): en Inicio importa «lo último», no un período.
    // `listarMovimientos` lanza si la base falla: aquí se atrapa para que la
    // actividad se degrade sola y no se lleve las tarjetas de arriba.
    listarMovimientos(persona.ubicacionId, {}, { limite: 8 }).then(
      (r) => ({ filas: r.filas, fallo: null as string | null }),
      () => ({ filas: [], fallo: "No se pudo cargar la actividad reciente. Lo demás de esta pantalla sí está al día." })
    ),
  ]);

  // Cada bloque falla por su cuenta: una consulta caída se ve como «—» con aviso,
  // nunca como un 0 que parezca normalidad (BACKLOG, lección de `lib/pendientes`).
  const totalProductos = tolerar({ data: productos.count, error: productos.error }, "el total de productos");
  const totalVariantes = tolerar({ data: variantes.count, error: variantes.error }, "el total de variantes");
  const filasStock = tolerar(stock, "el stock de tu ubicación");
  const unidadesEnUbicacion = filasStock.datos?.reduce((acc, f) => acc + f.cantidad, 0) ?? null;
  const movimientosRecientes = actividad.filas;
  const avisos = [totalProductos.fallo, totalVariantes.fallo, filasStock.fallo].filter((f): f is string => f !== null);
  const valor = (n: number | null) => (n === null ? "—" : String(n));

  return (
    <div className="space-y-10">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo={`Hola, ${persona.nombre.split(" ")[0]}`}
        subtitulo="Lo que hay hoy en tu sede."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <TarjetaSimple etiqueta="Productos activos" valor={valor(totalProductos.datos)} />
        <TarjetaSimple etiqueta="Variantes (SKU)" valor={valor(totalVariantes.datos)} />
        <TarjetaSimple etiqueta="Unidades en tu sede" valor={valor(unidadesEnUbicacion)} />
      </div>
      {avisos.length > 0 && <p className="-mt-6 text-xs text-tinta/70">{avisos[0]}</p>}

      <div>
        <p className="label-cayla mb-3 text-[11px] text-tinta/65">Acciones</p>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-tinta/12 bg-tinta/12">
          {[
            { href: "/buscar", etiqueta: "Buscar", detalle: "Stock por SKU, referencia, talla o color" },
            // ADR-0111 + ADR-0113: una sola puerta para recibir, la misma para todos: cuenta cualquier colaborador de la sede.
            { href: "/recibir", etiqueta: "Recibir mercadería", detalle: "Lo que llegó, contra sus comprobantes" },
            { href: "/inventario", etiqueta: "Inventario", detalle: "Stock por ubicación" },
            { href: "/productos", etiqueta: "Productos", detalle: "Catálogo completo" },
            { href: "/inventario/movimientos", etiqueta: "Movimientos", detalle: "Por qué cambió el stock" },
          ].map((a) => (
            <Link key={a.href} href={a.href} className="group bg-crema p-5 odd:last:col-span-2 transition-colors hover:bg-papel">
              <p className="text-sm font-medium text-tinta group-hover:text-rojo">{a.etiqueta}</p>
              <p className="mt-1 text-xs text-tinta/65">{a.detalle}</p>
            </Link>
          ))}
        </div>
      </div>

      {actividad.fallo && <p className="text-xs text-tinta/70">{actividad.fallo}</p>}
      {movimientosRecientes.length > 0 && (
        <div>
          <p className="label-cayla mb-3 text-[11px] text-tinta/65">Actividad reciente</p>
          <div className="card-cayla divide-y divide-tinta/10">
            {movimientosRecientes.map((m) => (
              <div key={m.id} className="flex items-baseline gap-3 px-5 py-2.5">
                <span className="w-24 shrink-0 text-xs tabular-nums text-tinta/65">{fechaCorta(m.fecha).slice(0, 5)} · {m.hora}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-tinta">
                  <span className="label-cayla text-[11px] text-tinta/65">{etiquetaActividad(m)}</span> {m.referencia}{" "}
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
