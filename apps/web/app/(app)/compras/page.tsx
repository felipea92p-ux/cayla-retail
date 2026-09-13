import Link from "next/link";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import {
  listarCompras,
  getResumenCompras,
  filtrosDesdeParams,
  getProveedoresActivos,
  ETIQUETA_ESTADO_PAGO,
  ETIQUETA_ESTADO_RECEPCION,
  fechaCorta,
  soles,
  type CompraResumen,
  type ParamsCompras,
} from "@/lib/compras";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { FiltrosCompras } from "@/components/FiltrosCompras";
import { Paginacion, leerCursor } from "@/components/Paginacion";

// Compras (ADR-0035): la lista de facturas de proveedor. Cada fila muestra
// los dos estados que importan — cuánto se pagó y cuánto llegó. Filtros y
// paginado viven en la URL y se resuelven en Postgres (`listar_compras`,
// migración compras_snapshot_y_paginado): la página nunca recibe más de
// 50 filas, haya 300 facturas o 3 millones.
const TONO_PAGO: Record<CompraResumen["estadoPago"], string> = {
  pendiente: "text-tinta/65",
  parcial: "text-ambar",
  pagada: "text-tinta",
  anulada: "text-tinta/40 line-through",
};

// Fecha · Proveedor y documento · Recepción · Pago · Total
const PLANTILLA = "sm:grid-cols-[6rem_1fr_9rem_7rem_8.5rem]";

const TONO_RECEPCION: Record<CompraResumen["estadoRecepcion"], string> = {
  sin_recibir: "text-tinta/65",
  parcial: "text-ambar",
  recibida: "text-tinta",
  anulada: "text-tinta/40",
};

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

      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador etiqueta="Por pagar" valor={soles(resumen.deuda)} detalle={resumen.vencidas > 0 ? `${resumen.vencidas.toLocaleString("es-PE")} vencida${resumen.vencidas === 1 ? "" : "s"} · ${soles(resumen.vencido)}` : "Sin vencidas"} alerta={resumen.vencidas > 0} />
        <Indicador etiqueta="Pendientes de recibir" valor={resumen.porRecibir.toLocaleString("es-PE")} detalle={resumen.porRecibir === 1 ? "factura" : "facturas"} />
        <Indicador etiqueta="Registradas" valor={resumen.registradas.toLocaleString("es-PE")} detalle={`${resumen.vigentes.toLocaleString("es-PE")} vigentes`} />
      </div>

      <FiltrosCompras proveedores={proveedores} visibles={["busqueda", "proveedor", "pago", "recepcion", "condicion", "fechas"]} />

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
            ]}
          />
          {compras.map((c) => (
            <Link key={c.id} href={`/compras/${c.id}`} className={fila(PLANTILLA, "transition-colors hover:bg-tinta/[0.03]")}>
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
              <span className={celda("izq", `label-cayla text-[11px] ${TONO_RECEPCION[c.estadoRecepcion]}`)}>
                {ETIQUETA_ESTADO_RECEPCION[c.estadoRecepcion]}
              </span>
              <span className={celda("der", `label-cayla text-[11px] ${TONO_PAGO[c.estadoPago]}`)}>{ETIQUETA_ESTADO_PAGO[c.estadoPago]}</span>
              <span className={celda("der", "text-sm tabular-nums text-tinta")}>{soles(c.total)}</span>
            </Link>
          ))}
        </Tabla>
      )}

      <Paginacion mostradas={compras.length} siguiente={siguiente} hayCursor={!!cursor} params={params} pathname="/compras" />
    </div>
  );
}

function Indicador({ etiqueta, valor, detalle, alerta = false }: { etiqueta: string; valor: string; detalle: string; alerta?: boolean }) {
  return (
    <div className="card-cayla p-4">
      <p className="label-cayla text-[11px] text-tinta/65">{etiqueta}</p>
      <p className="font-display mt-1 text-2xl tabular-nums text-tinta">{valor}</p>
      <p className={`mt-0.5 text-xs ${alerta ? "text-rojo" : "text-tinta/65"}`}>{detalle}</p>
    </div>
  );
}
