import Link from "next/link";
import { nombresDeDestinos } from "@/lib/reparto-reglas";
import {
  getCompra,
  getLineasCompra,
  getPagosCompra,
  getRecepcionesCompra,
  getAdjuntosCompra,
  ETIQUETA_ESTADO_PAGO,
  ETIQUETA_ESTADO_RECEPCION,
  ETIQUETA_METODO_PAGO,
  ETIQUETA_TIPO_DOCUMENTO,
  TONO_ESTADO_PAGO,
  TONO_ESTADO_RECEPCION,
  fechaCorta,
  soles,
  type CompraResumen,
  type LineaCompra,
  type PagoCompra,
  type RecepcionCompra,
  type AdjuntoCompra,
} from "@/lib/compras";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getCierresCompra, getNotasCreditoCompra, type CierreLinea, type NotaCreditoCompra } from "@/lib/compras-faltantes";
import { NotasCreditoCompra } from "@/components/NotasCreditoCompra";
import { BotonCerrarFaltante } from "@/components/AccionesFaltantes";
import { CompraAcciones } from "@/components/CompraDetallePanel";
import { AdjuntosDeFactura } from "@/components/AdjuntosCompra";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { Chip } from "@/components/ui/Chip";

// Detalle de una factura (ADR-0035): qué se compró, qué llegó y qué se pagó,
// todo calculado desde movimientos y pagos. Desde acá se registra un pago
// o se anula; recibir mercadería tiene su propia pantalla porque una guía
// puede cubrir varias facturas.
//
// Vive como componente (y no dentro de la página) porque se dibuja en DOS
// lugares con los mismos datos: la página completa `/compras/factura/[compraId]`
// (enlace directo, recarga) y el modal que se abre encima de una lista
// (`@modal/(.)factura/[compraId]`). Un solo cuerpo, dos marcos.

// Producto · Cantidad × costo · Recibido · Subtotal
const PLANTILLA_LINEAS = "sm:grid-cols-[1fr_12rem_7rem_8.5rem]";
// Fecha · Medio y referencia · Monto
const PLANTILLA_PAGOS = "sm:grid-cols-[6rem_1fr_8.5rem]";
// Fecha · Guía y destino · Unidades
const PLANTILLA_RECEPCIONES = "sm:grid-cols-[6rem_1fr_6rem]";

export type DetalleCompra = {
  compra: CompraResumen;
  lineas: LineaCompra[];
  pagos: PagoCompra[];
  recepciones: RecepcionCompra[];
  adjuntos: AdjuntoCompra[];
  /** Notas de crédito del proveedor y líneas cerradas por faltante (D2, ADR-0111). */
  notasCredito: NotaCreditoCompra[];
  cierres: CierreLinea[];
  /** Nombre de la ubicación destino, o "—" si ya no existe. */
  destino: string;
};

/** Trae todo lo que el detalle necesita en una sola pasada. `null` si la factura no existe (o RLS no la deja ver). */
export async function cargarDetalleCompra(compraId: string): Promise<DetalleCompra | null> {
  const compra = await getCompra(compraId);
  if (!compra) return null;
  const [lineas, pagos, recepciones, adjuntos, ubicaciones, notasCredito, cierres] = await Promise.all([
    getLineasCompra([compra.id]),
    getPagosCompra(compra.id),
    getRecepcionesCompra(compra.id),
    getAdjuntosCompra(compra.id),
    getUbicaciones(),
    getNotasCreditoCompra(compra.id),
    getCierresCompra(compra.id),
  ]);
  return {
    compra,
    lineas,
    pagos,
    recepciones,
    adjuntos,
    notasCredito,
    cierres,
    // ADR-0132: una factura puede repartirse entre tiendas; se muestran todas (la sección «Reparto por tienda» del detalle
    // dice cuánto le toca a cada una).
    destino: nombresDeDestinos(compra.ubicacionesDestino, Object.fromEntries(ubicaciones.map((u) => [u.id, u.nombre]))) || "—",
  };
}

export function tipoCompra(compra: CompraResumen): string {
  return ETIQUETA_TIPO_DOCUMENTO[compra.tipo];
}

/** Ficha bajo el título — emisión, condición, destino y RUC — igual en página y modal.
    Pares etiqueta/valor en vez de una frase con "·": cuatro datos de naturaleza
    distinta se leen de un vistazo cuando cada uno tiene su propio rótulo, y
    en el modal (más angosto) la frase corrida se partía en cualquier punto. */
export function FichaCompra({ compra, destino }: Pick<DetalleCompra, "compra" | "destino">) {
  const datos: { etiqueta: string; valor: string; alerta?: boolean }[] = [
    { etiqueta: "Emitida", valor: fechaCorta(compra.fechaEmision) },
    compra.condicion === "contado"
      ? { etiqueta: "Condición", valor: "Al contado" }
      : { etiqueta: "Vence", valor: `${fechaCorta(compra.fechaVencimiento)} · crédito`, alerta: compra.vencida },
    { etiqueta: "Destino", valor: destino },
  ];
  if (compra.proveedorRuc) datos.push({ etiqueta: "RUC", valor: compra.proveedorRuc });
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2">
      {datos.map((d) => (
        <div key={d.etiqueta}>
          <dt className="label-cayla text-[10px] text-tinta/55">{d.etiqueta}</dt>
          <dd className={`text-sm tabular-nums ${d.alerta ? "text-rojo" : "text-tinta/80"}`}>{d.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CompraDetalle({
  detalle: { compra, lineas, pagos, recepciones, adjuntos, notasCredito, destino },
  adjuntosFallidos = [],
  acciones = true,
}: {
  detalle: DetalleCompra;
  /** Nombres de archivos que no se pudieron subir al registrar (los manda CompraFormV2 por la URL). */
  adjuntosFallidos?: string[];
  /** `false` cuando el marco ya dibuja los botones en otro sitio (el modal los pone al pie, junto a Cerrar). */
  acciones?: boolean;
}) {
  const anulada = compra.estado === "anulada";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {anulada ? (
          <p className="text-sm text-rojo">Anulada{compra.motivoAnulacion ? `: ${compra.motivoAnulacion}` : ""}.</p>
        ) : (
          <p className="flex flex-wrap gap-1.5">
            <Chip tono={compra.vencida ? "rojo" : TONO_ESTADO_PAGO[compra.estadoPago]}>{compra.vencida ? "Vencida" : ETIQUETA_ESTADO_PAGO[compra.estadoPago]}</Chip>
            <Chip tono={TONO_ESTADO_RECEPCION[compra.estadoRecepcion]}>{ETIQUETA_ESTADO_RECEPCION[compra.estadoRecepcion]}</Chip>
          </p>
        )}
        {acciones && <CompraAcciones compra={compra} tieneRecepciones={recepciones.length > 0} />}
      </div>

      {/* Dos preguntas, dos tarjetas: ¿cuánto se pagó? y ¿cuánto llegó?
          Antes eran cuatro cajas iguales (Total, Pagado, Saldo, Recibido) y
          había que restar mentalmente. La barra muestra la proporción; la
          cifra grande es lo que falta, que es lo que se viene a mirar. Debajo,
          dos o tres datos sueltos con su etiqueta — no una frase con puntos:
          el desglose de IGV vive al pie de las líneas, que es su lugar. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Cifra
          etiqueta="Pago"
          valor={anulada ? "—" : compra.saldo > 0 ? `Faltan ${soles(compra.saldo)}` : "Pagada"}
          alerta={compra.vencida}
          progreso={compra.total > 0 ? (compra.pagado + compra.notasCredito) / compra.total : 0}
          tono={compra.vencida ? "rojo" : compra.estadoPago === "parcial" ? "ambar" : compra.estadoPago === "pagada" ? "verde" : "neutro"}
          datos={[
            { etiqueta: "Pagado", valor: `${soles(compra.pagado)} de ${soles(compra.total)}` },
            ...(compra.notasCredito > 0 ? [{ etiqueta: "Notas de crédito", valor: `− ${soles(compra.notasCredito)}` }] : []),
            compra.condicion === "contado"
              ? { etiqueta: "Condición", valor: "Al contado" }
              : compra.vencida
                ? { etiqueta: "Venció", valor: fechaCorta(compra.fechaVencimiento), alerta: true }
                : compra.saldo > 0
                  ? { etiqueta: "Vence", valor: fechaCorta(compra.fechaVencimiento) }
                  : { etiqueta: "Condición", valor: "Al crédito" },
          ]}
        />
        <Cifra
          etiqueta="Recepción"
          valor={
            anulada
              ? "—"
              : compra.estadoRecepcion === "recibida"
                ? "Todo recibido"
                : `Faltan ${(compra.facturadoCantidad - compra.recibidoCantidad - compra.cerradoCantidad).toLocaleString("es-PE")} unidades`
          }
          progreso={compra.facturadoCantidad > 0 ? (compra.recibidoCantidad + compra.cerradoCantidad) / compra.facturadoCantidad : 0}
          tono={compra.estadoRecepcion === "parcial" ? "ambar" : compra.estadoRecepcion === "recibida" ? "verde" : "neutro"}
          datos={[
            { etiqueta: "Recibidas", valor: `${compra.recibidoCantidad.toLocaleString("es-PE")} de ${compra.facturadoCantidad.toLocaleString("es-PE")} unidades` },
            ...(compra.cerradoCantidad > 0 ? [{ etiqueta: "Cerradas por faltante", valor: `${compra.cerradoCantidad.toLocaleString("es-PE")} unidades` }] : []),
            { etiqueta: "Destino", valor: destino },
          ]}
        />
      </div>

      {/* ---------- líneas ---------- */}
      <section className="space-y-2">
        <p className="label-cayla text-[11px] text-tinta/65">Líneas del comprobante</p>
        <Tabla>
          <Encabezado
            plantilla={PLANTILLA_LINEAS}
            columnas={[
              { titulo: "Producto" },
              { titulo: "Cant. × costo unit.", alinear: "der" },
              { titulo: "Recibido", alinear: "der" },
              { titulo: "Subtotal", alinear: "der" },
            ]}
          />
          {lineas.map((l) => (
            <div key={l.id} className={fila(PLANTILLA_LINEAS)}>
              <span className={celda("izq", "text-sm text-tinta")}>
                {l.referencia} <span className="text-tinta/65">{l.varianteId ? [l.talla, l.color].filter(Boolean).join(" / ") || l.sku : "sin desglose"}</span>
                {l.descripcion && <span className="block text-xs text-tinta/55">{l.descripcion}</span>}
                {l.cerrado > 0 && <span className="block text-xs text-ambar-profundo">{l.cerrado.toLocaleString("es-PE")} cerradas por faltante</span>}
                {!anulada && l.pendiente > 0 && (
                  <BotonCerrarFaltante compra={compra} linea={l} producto={`${l.referencia}${l.varianteId && (l.talla || l.color) ? ` · ${[l.talla, l.color].filter(Boolean).join(" / ")}` : ""}`} />
                )}
              </span>
              <span className={celda("der", "text-xs tabular-nums text-tinta/65")}>
                {l.cantidad} × {soles(l.costoUnitario)}
              </span>
              <span className={celda("der")}>
                <span className={`label-cayla text-[11px] ${l.pendiente === 0 ? "text-tinta" : l.recibido > 0 ? "text-ambar" : "text-tinta/65"}`}>
                  {l.recibido}/{l.cantidad}
                </span>
                {/* Misma barra que las tarjetas de arriba, en miniatura: acá se
                    lee qué línea puntual falta, no solo el total de la factura. */}
                <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-sand" role="progressbar" aria-valuenow={Math.round((l.cantidad > 0 ? (l.recibido + l.cerrado) / l.cantidad : 0) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Recibido: ${l.recibido} de ${l.cantidad}`}>
                  <span className={`block h-full rounded-full ${BARRA[l.pendiente === 0 ? "verde" : l.recibido > 0 ? "ambar" : "neutro"]}`} style={{ width: `${Math.round((l.cantidad > 0 ? (l.recibido + l.cerrado) / l.cantidad : 0) * 100)}%` }} />
                </span>
              </span>
              <span className={celda("der", "text-sm tabular-nums text-tinta")}>{soles(l.subtotal)}</span>
            </div>
          ))}
          {/* El pie es la factura leída como la lee un contador: las líneas
              suman el subtotal, debajo el IGV, debajo el total del papel. Sin
              IGV (nota de venta) solo se muestra el total. */}
          <Totales subtotal={compra.subtotal} igv={compra.igv} total={compra.total} />
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
                  {/* Referencia y destino van en segunda línea: en media
                      pantalla la columna del medio es angosta y en una sola
                      línea se cortaban ("BCP-77…"). */}
                  <span className={celda("izq", "text-sm text-tinta")}>
                    {ETIQUETA_METODO_PAGO[p.metodo] ?? p.metodo}
                    {p.referencia && <span className="block truncate text-xs tabular-nums text-tinta/65">{p.referencia}</span>}
                  </span>
                  <span className={celda("der", "text-sm tabular-nums text-tinta")}>{soles(p.monto)}</span>
                </div>
              ))}
              {pagos.length > 1 && (
                <div className={fila(PLANTILLA_PAGOS)}>
                  <span className="hidden sm:block" />
                  <span className={celda("izq", "label-cayla text-[11px] text-tinta/65")}>Total pagado</span>
                  <span className={celda("der", "text-sm tabular-nums text-tinta")}>{soles(compra.pagado)}</span>
                </div>
              )}
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
            <p className="card-cayla p-5 text-sm text-tinta/65">Todavía no llegó mercadería de este comprobante.</p>
          ) : (
            <Tabla>
              <Encabezado plantilla={PLANTILLA_RECEPCIONES} columnas={[{ titulo: "Fecha" }, { titulo: "Guía · Destino" }, { titulo: "Unidades", alinear: "der" }]} />
              {recepciones.map((r) => (
                <div key={r.loteId} className={fila(PLANTILLA_RECEPCIONES)}>
                  <span className={celda("izq", "text-xs tabular-nums text-tinta/65")}>{fechaCorta(r.fecha)}</span>
                  <span className={celda("izq", "text-sm")}>
                    {r.numeroGuia ? <span className="tabular-nums text-tinta">{r.numeroGuia}</span> : <span className="text-tinta/45">Sin guía</span>}
                    <span className="block truncate text-xs text-tinta/65">{r.ubicacion}</span>
                  </span>
                  <span className={celda("der", "text-sm tabular-nums text-tinta")}>{r.unidades}</span>
                </div>
              ))}
            </Tabla>
          )}
        </section>
      </div>

      <NotasCreditoCompra compra={compra} notas={notasCredito} cerrados={lineas.filter((l) => l.cerrado > 0).map((l) => ({ faltan: l.cerrado, costoUnitario: l.costoUnitario }))} />

      {/* Quién puede adjuntar lo decide `fn_puede_registrar_compras()` en la
          RPC (hoy: cualquier persona activa, 0012). Acá solo se esconde en
          una factura anulada, que la RPC también rechaza. */}
      <AdjuntosDeFactura compraId={compra.id} adjuntos={adjuntos} puedeEditar={!anulada} avisoInicial={adjuntosFallidos} />

      {compra.nota && (
        <p className="text-sm text-tinta/65">
          <span className="label-cayla text-[11px]">Nota · </span>
          {compra.nota}
        </p>
      )}
    </div>
  );
}

const BARRA: Record<"neutro" | "ambar" | "verde" | "rojo", string> = {
  neutro: "bg-tinta/40",
  ambar: "bg-ambar",
  verde: "bg-verde",
  rojo: "bg-rojo",
};

type Dato = { etiqueta: string; valor: string; alerta?: boolean };

function Cifra({
  etiqueta,
  valor,
  alerta = false,
  progreso,
  tono = "neutro",
  datos,
}: {
  etiqueta: string;
  valor: string;
  alerta?: boolean;
  /** 0–1: cuánto del total ya está cubierto. Dibuja la barra. */
  progreso?: number;
  tono?: keyof typeof BARRA;
  /** Datos sueltos bajo la barra, cada uno con su etiqueta. */
  datos: Dato[];
}) {
  const pct = progreso === undefined ? null : Math.round(Math.min(1, Math.max(0, progreso)) * 100);
  return (
    <div className="card-cayla p-4">
      <p className="label-cayla text-[11px] text-tinta/65">{etiqueta}</p>
      <p className={`font-display mt-1 text-2xl tabular-nums ${alerta ? "text-rojo" : "text-tinta"}`}>{valor}</p>
      {pct !== null && (
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-sand"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${etiqueta}: ${pct}%`}
        >
          <div className={`h-full rounded-full transition-[width] ${BARRA[tono]}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {datos.map((d) => (
          <div key={d.etiqueta}>
            <dt className="label-cayla text-[10px] text-tinta/55">{d.etiqueta}</dt>
            <dd className={`text-xs tabular-nums ${d.alerta ? "text-rojo" : "text-tinta/80"}`}>{d.valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Pie de la tabla de líneas: subtotal, IGV y total, alineados a la derecha. */
function Totales({ subtotal, igv, total }: { subtotal: number; igv: number; total: number }) {
  // La tasa no se guarda en la compra (solo los montos); se deduce para la
  // etiqueta y se redondea — 18% se lee mejor que "IGV" a secas.
  const tasa = igv > 0 && subtotal > 0 ? Math.round((igv / subtotal) * 100) : null;
  const filas: { etiqueta: string; valor: number; fuerte?: boolean }[] =
    igv > 0
      ? [
          { etiqueta: "Subtotal", valor: subtotal },
          { etiqueta: tasa ? `IGV ${tasa}%` : "IGV", valor: igv },
          { etiqueta: "Total", valor: total, fuerte: true },
        ]
      : [{ etiqueta: "Total", valor: total, fuerte: true }];
  return (
    <div className="flex justify-end px-5 py-3">
      <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1">
        {filas.map((f) => (
          <div key={f.etiqueta} className="contents">
            <dt className={`text-right ${f.fuerte ? "label-cayla text-[11px] text-tinta" : "text-xs text-tinta/65"}`}>{f.etiqueta}</dt>
            <dd className={`text-right tabular-nums ${f.fuerte ? "text-sm text-tinta" : "text-xs text-tinta/80"}`}>{soles(f.valor)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
