import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import {
  getCompra,
  getLineasCompra,
  getPagosCompra,
  getRecepcionesCompra,
  ETIQUETA_ESTADO_PAGO,
  ETIQUETA_ESTADO_RECEPCION,
  ETIQUETA_METODO,
  fechaCorta,
  soles,
} from "@/lib/compras";
import { getUbicaciones } from "@/lib/ubicaciones";
import { CompraAcciones } from "@/components/CompraDetallePanel";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";

// Producto · Cantidad × costo · Recibido · Subtotal
const PLANTILLA_LINEAS = "sm:grid-cols-[1fr_12rem_7rem_8.5rem]";
// Fecha · Medio y referencia · Monto
const PLANTILLA_PAGOS = "sm:grid-cols-[6rem_1fr_8.5rem]";
// Fecha · Guía y destino · Unidades
const PLANTILLA_RECEPCIONES = "sm:grid-cols-[6rem_1fr_6rem]";

// Detalle de una factura (ADR-0035): qué se compró, qué llegó y qué se pagó,
// todo calculado desde movimientos y pagos. Desde acá se registra un pago
// o se anula; recibir mercadería tiene su propia pantalla porque una guía
// puede cubrir varias facturas.
export default async function CompraDetallePage({ params }: { params: Promise<{ compraId: string }> }) {
  await requirePersonaActualV2();
  const { compraId } = await params;
  const compra = await getCompra(compraId);
  if (!compra) notFound();

  const [lineas, pagos, recepciones, ubicaciones] = await Promise.all([
    getLineasCompra([compra.id]),
    getPagosCompra(compra.id),
    getRecepcionesCompra(compra.id),
    getUbicaciones(),
  ]);
  const destino = ubicaciones.find((u) => u.id === compra.ubicacionDestinoId)?.nombre ?? "—";
  const anulada = compra.estado === "anulada";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">
            <Link href="/compras" className="hover:text-rojo">Compras</Link> · {compra.tipo === "factura" ? "Factura" : compra.tipo === "boleta" ? "Boleta" : "Nota de venta"}
          </p>
          <h1 className={`font-display mt-1 text-2xl ${anulada ? "text-tinta/50 line-through" : "text-tinta"}`}>
            {compra.documento} · {compra.proveedorNombre}
          </h1>
          <p className="mt-1 text-sm text-tinta/65">
            Emitida el {fechaCorta(compra.fechaEmision)} · {compra.condicion === "contado" ? "Al contado" : `Al crédito, vence ${fechaCorta(compra.fechaVencimiento)}`} · Destino {destino}
            {compra.proveedorRuc && <> · RUC {compra.proveedorRuc}</>}
          </p>
          {anulada && <p className="mt-1 text-sm text-rojo">Anulada{compra.motivoAnulacion ? `: ${compra.motivoAnulacion}` : ""}.</p>}
        </div>
        <CompraAcciones compra={compra} tieneRecepciones={recepciones.length > 0} />
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Cifra etiqueta="Total" valor={soles(compra.total)} detalle={`${soles(compra.subtotal)} + IGV ${soles(compra.igv)}`} />
        <Cifra etiqueta="Pagado" valor={soles(compra.pagado)} detalle={ETIQUETA_ESTADO_PAGO[compra.estadoPago]} />
        <Cifra etiqueta="Saldo" valor={soles(compra.saldo)} detalle={compra.vencida ? "Vencida" : compra.saldo > 0 && compra.fechaVencimiento ? `Vence ${fechaCorta(compra.fechaVencimiento)}` : " "} alerta={compra.vencida} />
        <Cifra etiqueta="Recibido" valor={`${compra.recibidoCantidad} / ${compra.facturadoCantidad}`} detalle={ETIQUETA_ESTADO_RECEPCION[compra.estadoRecepcion]} />
      </div>

      {/* ---------- líneas ---------- */}
      <section className="space-y-2">
        <p className="label-cayla text-[11px] text-tinta/65">Líneas de la factura</p>
        <Tabla>
          <Encabezado
            plantilla={PLANTILLA_LINEAS}
            columnas={[{ titulo: "Producto" }, { titulo: "Cant. × costo unit.", alinear: "der" }, { titulo: "Recibido", alinear: "der" }, { titulo: "Subtotal", alinear: "der" }]}
          />
          {lineas.map((l) => (
            <div key={l.id} className={fila(PLANTILLA_LINEAS)}>
              <span className={celda("izq", "text-sm text-tinta")}>
                {l.referencia}{" "}
                <span className="text-tinta/65">
                  {l.varianteId ? [l.talla, l.color].filter(Boolean).join(" / ") || l.sku : "sin desglose"}
                </span>
                {l.descripcion && <span className="block text-xs text-tinta/55">{l.descripcion}</span>}
              </span>
              <span className={celda("der", "text-xs tabular-nums text-tinta/65")}>
                {l.cantidad} × {soles(l.costoUnitario)}
              </span>
              <span className={celda("der", `label-cayla text-[11px] ${l.pendiente === 0 ? "text-tinta" : l.recibido > 0 ? "text-ambar" : "text-tinta/65"}`)}>
                {l.recibido}/{l.cantidad}
              </span>
              <span className={celda("der", "text-sm tabular-nums text-tinta")}>{soles(l.subtotal)}</span>
            </div>
          ))}
        </Tabla>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---------- pagos ---------- */}
        <section className="space-y-2">
          <p className="label-cayla text-[11px] text-tinta/65">Pagos</p>
          {pagos.length === 0 ? (
            <p className="card-cayla p-5 text-sm text-tinta/65">Sin pagos todavía.</p>
          ) : (
            <Tabla>
              <Encabezado plantilla={PLANTILLA_PAGOS} columnas={[{ titulo: "Fecha" }, { titulo: "Medio · Referencia" }, { titulo: "Monto", alinear: "der" }]} />
              {pagos.map((p) => (
                <div key={p.id} className={fila(PLANTILLA_PAGOS)}>
                  <span className={celda("izq", "text-xs tabular-nums text-tinta/65")}>{fechaCorta(p.fecha)}</span>
                  <span className={celda("izq", "text-sm text-tinta")}>
                    {ETIQUETA_METODO[p.metodo] ?? p.metodo}
                    {p.referencia && <span className="ml-2 text-xs tabular-nums text-tinta/65">{p.referencia}</span>}
                  </span>
                  <span className={celda("der", "text-sm tabular-nums text-tinta")}>{soles(p.monto)}</span>
                </div>
              ))}
            </Tabla>
          )}
        </section>

        {/* ---------- recepciones ---------- */}
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <p className="label-cayla text-[11px] text-tinta/65">Recepciones</p>
            {!anulada && compra.estadoRecepcion !== "recibida" && (
              <Link href={`/compras/recibir?compra=${compra.id}`} className="label-cayla text-[11px] text-rojo hover:underline">
                Recibir mercadería →
              </Link>
            )}
          </div>
          {recepciones.length === 0 ? (
            <p className="card-cayla p-5 text-sm text-tinta/65">Todavía no llegó mercadería de esta factura.</p>
          ) : (
            <Tabla>
              <Encabezado plantilla={PLANTILLA_RECEPCIONES} columnas={[{ titulo: "Fecha" }, { titulo: "Guía · Destino" }, { titulo: "Unidades", alinear: "der" }]} />
              {recepciones.map((r) => (
                <div key={r.loteId} className={fila(PLANTILLA_RECEPCIONES)}>
                  <span className={celda("izq", "text-xs tabular-nums text-tinta/65")}>{fechaCorta(r.fecha)}</span>
                  <span className={celda("izq", "text-sm text-tinta")}>
                    {r.numeroGuia ? `Guía ${r.numeroGuia}` : "Sin guía"} <span className="text-tinta/65">→ {r.ubicacion}</span>
                  </span>
                  <span className={celda("der", "text-sm tabular-nums text-tinta")}>{r.unidades}</span>
                </div>
              ))}
            </Tabla>
          )}
        </section>
      </div>

      {compra.nota && (
        <p className="text-sm text-tinta/65">
          <span className="label-cayla text-[11px]">Nota · </span>
          {compra.nota}
        </p>
      )}
    </div>
  );
}

function Cifra({ etiqueta, valor, detalle, alerta = false }: { etiqueta: string; valor: string; detalle: string; alerta?: boolean }) {
  return (
    <div className="card-cayla p-4">
      <p className="label-cayla text-[11px] text-tinta/65">{etiqueta}</p>
      <p className="font-display mt-1 text-2xl tabular-nums text-tinta">{valor}</p>
      <p className={`mt-0.5 min-h-[1rem] text-xs ${alerta ? "text-rojo" : "text-tinta/65"}`}>{detalle}</p>
    </div>
  );
}
