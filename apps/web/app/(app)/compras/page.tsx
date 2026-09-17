import Link from "next/link";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import {
  listarCompras,
  getResumenCompras,
  filtrosDesdeParams,
  getProveedoresActivos,
  ETIQUETA_ESTADO_PAGO,
  ETIQUETA_ESTADO_RECEPCION,
  TONO_ESTADO_PAGO,
  TONO_ESTADO_RECEPCION,
  fechaCorta,
  soles,
  type ParamsCompras,
} from "@/lib/compras";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { Chip } from "@/components/ui/Chip";
import { FiltrosCompras } from "@/components/FiltrosCompras";
import { Paginacion, leerCursor } from "@/components/Paginacion";

// Compras (ADR-0035): la lista de facturas de proveedor. Cada fila muestra
// los dos estados que importan — cuánto se pagó y cuánto llegó. Filtros y
// paginado viven en la URL y se resuelven en Postgres (`listar_compras`,
// migración compras_snapshot_y_paginado): la página nunca recibe más de
// 50 filas, haya 300 facturas o 3 millones.

// Fecha · Proveedor y documento · Recepción · Pago · Total · (flecha)
// La última columna es solo la flecha "›": la fila entera es un enlace y sin
// una señal visible nadie sabía que se podía abrir. En celular no hace falta
// (la fila apilada ya se ve como tarjeta) y se oculta.
// El enlace abre el detalle como modal encima de esta lista (ruta
// interceptada `@modal/(.)factura/[compraId]`): la lista no se desmonta y al cerrar
// se vuelve exactamente donde se estaba, con scroll y filtros intactos.
const PLANTILLA = "sm:grid-cols-[6rem_1fr_9rem_7.5rem_8.5rem_1rem]";

export default async function ComprasPage({ searchParams }: { searchParams: Promise<ParamsCompras> }) {
  await requirePersonaActualV2();
  const params = await searchParams;
  const filtros = filtrosDesdeParams(params);
  const cursor = leerCursor(params.cursor);
  const hayFiltros = Object.values(filtros).some(Boolean);

  const [{ filas: compras, siguiente }, resumen, proveedores] = await Promise.all([
    listarCompras(filtros, { cursor }),
    getResumenCompras(),
    getProveedoresActivos(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Compras</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Facturas de proveedores</h1>
          <p className="mt-1 text-sm text-tinta/65">
            Cada factura registra lo que se compró; la recepción y el pago se anotan contra ella.
          </p>
        </div>
        <Link
          href="/compras/nueva"
          className="label-cayla rounded-md bg-tinta px-4 py-3 text-[11px] text-crema transition-colors hover:bg-rojo"
        >
          + Registrar factura
        </Link>
      </div>

      {/* Cada cifra lleva a donde se actúa sobre ella: "Por pagar" a la lista
          de deuda (y si hay vencidas, directo a las vencidas), "Pendientes de
          recibir" a la pantalla de recepción. "Registradas" no lleva a ningún
          lado porque ya está en esa lista. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador
          etiqueta="Por pagar"
          valor={soles(resumen.deuda)}
          detalle={resumen.vencidas > 0 ? `${resumen.vencidas.toLocaleString("es-PE")} vencida${resumen.vencidas === 1 ? "" : "s"} · ${soles(resumen.vencido)} →` : "Sin vencidas →"}
          alerta={resumen.vencidas > 0}
          href={resumen.vencidas > 0 ? "/compras/por-pagar?vencidas=1" : "/compras/por-pagar"}
        />
        <Indicador
          etiqueta="Pendientes de recibir"
          valor={resumen.porRecibir.toLocaleString("es-PE")}
          detalle={resumen.porRecibir === 0 ? "Nada por recibir" : `${resumen.porRecibir === 1 ? "factura" : "facturas"} · recibir mercadería →`}
          href={resumen.porRecibir > 0 ? "/compras/recibir" : undefined}
        />
        <Indicador etiqueta="Registradas" valor={resumen.registradas.toLocaleString("es-PE")} detalle={`${resumen.vigentes.toLocaleString("es-PE")} vigentes`} />
      </div>

      <FiltrosCompras
        proveedores={proveedores}
        visibles={["busqueda", "proveedor", "pago", "recepcion", "condicion", "fechas"]}
        principales={["busqueda", "proveedor", "pago"]}
      />

      {compras.length === 0 && !cursor ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">
          {hayFiltros ? (
            "Ninguna factura coincide con esos filtros."
          ) : (
            <>
              Todavía no hay facturas registradas.{" "}
              <Link href="/compras/nueva" className="text-rojo hover:underline">
                Registrar la primera →
              </Link>
            </>
          )}
        </p>
      ) : (
        <Tabla>
          <Encabezado
            plantilla={PLANTILLA}
            columnas={[
              { titulo: "Emitida" },
              { titulo: "Proveedor · Documento" },
              { titulo: "Recepción" },
              { titulo: "Pago", alinear: "der" },
              { titulo: "Total", alinear: "der" },
              { titulo: "" },
            ]}
          />
          {compras.map((c) => (
            <Link key={c.id} href={`/compras/factura/${c.id}`} className={fila(PLANTILLA, "group transition-colors hover:bg-tinta/[0.03] focus-visible:bg-tinta/[0.03] focus-visible:outline-none")}>
              <span className={celda("izq", "text-xs tabular-nums text-tinta/65")}>{fechaCorta(c.fechaEmision)}</span>
              <span className={celda()}>
                <span className={`text-sm ${c.estado === "anulada" ? "text-tinta/40 line-through" : "text-tinta"}`}>{c.proveedorNombre}</span>{" "}
                <span className="text-xs tabular-nums text-tinta/65">{c.documento}</span>
                {c.condicion === "credito" && c.fechaVencimiento && (
                  <span className={`ml-2 text-xs ${c.vencida ? "text-rojo" : "text-tinta/65"}`}>
                    {c.vencida ? "Venció" : "Vence"} {fechaCorta(c.fechaVencimiento)}
                  </span>
                )}
              </span>
              <span className={celda("izq", "overflow-visible")}>
                <Chip tono={TONO_ESTADO_RECEPCION[c.estadoRecepcion]}>{ETIQUETA_ESTADO_RECEPCION[c.estadoRecepcion]}</Chip>
              </span>
              <span className={celda("der")}>
                <Chip tono={c.vencida && c.estadoPago !== "pagada" ? "rojo" : TONO_ESTADO_PAGO[c.estadoPago]}>
                  {c.vencida && c.estadoPago !== "pagada" ? "Vencida" : ETIQUETA_ESTADO_PAGO[c.estadoPago]}
                </Chip>
              </span>
              <span className={celda("der", "text-sm tabular-nums text-tinta")}>{soles(c.total)}</span>
              <span aria-hidden className="hidden text-right text-base leading-none text-tinta/30 transition-colors group-hover:text-rojo sm:block">
                ›
              </span>
            </Link>
          ))}
        </Tabla>
      )}

      <Paginacion mostradas={compras.length} siguiente={siguiente} hayCursor={!!cursor} params={params} pathname="/compras" />
    </div>
  );
}

function Indicador({ etiqueta, valor, detalle, alerta = false, href }: { etiqueta: string; valor: string; detalle: string; alerta?: boolean; href?: string }) {
  const contenido = (
    <>
      <p className="label-cayla text-[11px] text-tinta/65">{etiqueta}</p>
      <p className="font-display mt-1 text-2xl tabular-nums text-tinta">{valor}</p>
      <p className={`mt-0.5 text-xs ${alerta ? "text-rojo" : "text-tinta/65"}`}>{detalle}</p>
    </>
  );
  if (!href) return <div className="card-cayla p-4">{contenido}</div>;
  return (
    <Link href={href} className="card-cayla block p-4 transition-colors hover:border-rojo/40 hover:bg-tinta/[0.02] focus-visible:border-rojo focus-visible:outline-none">
      {contenido}
    </Link>
  );
}
