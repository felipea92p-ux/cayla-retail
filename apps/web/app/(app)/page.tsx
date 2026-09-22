import Link from "next/link";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { etiquetaActividad, fechaCorta, textoDelta } from "@/lib/movimientos-v2";
import { getPendientesInicio, getResumenInicio } from "@/lib/inicio";
import { textoCifra } from "@/lib/inicio-reglas";

// Inicio: qué hay hoy en la sede y a un toque de lo que se va a hacer. Las lecturas y sus
// reglas viven en `lib/inicio.ts` / `lib/inicio-reglas.ts`; esta página solo las dibuja.
export default async function InicioPage() {
  const persona = await requirePersonaActualV2();
  const [{ productosActivos, variantesActivas, unidadesEnSede, aviso, actividad }, pendientes] = await Promise.all([
    getResumenInicio(persona.ubicacionId),
    getPendientesInicio(persona.ubicacionId, persona.rol === "lider"),
  ]);
  const movimientosRecientes = actividad.filas;

  return (
    <div className="space-y-10">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo={`Hola, ${persona.nombre.split(" ")[0]}`}
        subtitulo="Lo que hay hoy en tu sede."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <TarjetaSimple etiqueta="Productos activos" valor={textoCifra(productosActivos)} />
        <TarjetaSimple etiqueta="Variantes (SKU)" valor={textoCifra(variantesActivas)} />
        <TarjetaSimple etiqueta="Unidades en tu sede" valor={textoCifra(unidadesEnSede)} />
      </div>
      {aviso && <p className="-mt-6 text-xs text-tinta/70">{aviso}</p>}

      {(pendientes.items.length > 0 || pendientes.incompleta) && (
        <div>
          <p className="label-cayla mb-3 text-[11px] text-tinta/65">Por atender</p>
          <div className="card-cayla divide-y divide-tinta/10">
            {pendientes.items.map((p) => (
              <Link key={p.clave} href={p.href} className="flex items-center justify-between px-5 py-3 text-sm text-tinta transition-colors hover:bg-papel hover:text-rojo">
                <span>{p.texto}</span>
                <span aria-hidden className="text-tinta/45">›</span>
              </Link>
            ))}
            {pendientes.incompleta && (
              <p className="px-5 py-3 text-sm text-tinta/70">Esta bandeja está incompleta: no se pudo leer parte de lo pendiente.</p>
            )}
          </div>
        </div>
      )}

      <div>
        <p className="label-cayla mb-3 text-[11px] text-tinta/65">Acciones</p>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-tinta/12 bg-tinta/12">
          {[
            // Lo que más se hace en el mostrador va primero (BACKLOG · pantalla Inicio #4).
            { href: "/vender", etiqueta: "Vender", detalle: "Punto de venta: cobrar y emitir el comprobante" },
            { href: "/caja", etiqueta: "Caja", detalle: "Ingresos, egresos y cierre del día" },
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
