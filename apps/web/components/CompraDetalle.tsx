import Link from "next/link";
import { etiquetaDeLinea, filasDeLinea, nombresDeDestinos, tiendasConPendiente } from "@/lib/reparto-reglas";
import { getRepartoDeCompra, type RepartoDeCompra } from "@/lib/compras-reparto";
import { RepartoPorTienda } from "@/components/RepartoPorTienda";
import {
  getCompra,
  getLineasCompra,
  getPagosCompra,
  getRecepcionesCompra,
  getAdjuntosCompra,
  ETIQUETA_ESTADO_PAGO,
  ETIQUETA_ESTADO_RECEPCION,
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
import { BarraAvance, TarjetaAvance } from "@/components/ComprobanteAvance";
import { ComprobanteEncabezado } from "@/components/ComprobanteEncabezado";
import { ComprobanteLineaTiempo } from "@/components/ComprobanteLineaTiempo";
import { ComprobantePagos } from "@/components/ComprobantePagos";
import { AdjuntosDeFactura } from "@/components/AdjuntosCompra";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { avanceRecepcion, avancePago, complementoDeSaldo, datosCabecera, fraccion, lineaDeTiempo, tonoDeAvance } from "@/lib/comprobante-linea-tiempo";
import { hoyLima } from "@/lib/fechas-lima";
import { getProveedor } from "@/lib/proveedores";
import { datosPagoDe, type DatosPagoProveedor } from "@/lib/proveedores-reglas";
import { getSaldosFavor } from "@/lib/saldo-favor";
import { accionesDeCompraDe, requirePersonaActualV2 } from "@/lib/persona-actual";
import type { AccionesDeCompra } from "@/lib/modulos";

// Detalle de una factura (ADR-0035): qué se compró, qué llegó y qué se pagó,
// todo calculado desde movimientos y pagos. Desde acá se registra un pago
// o se anula; recibir mercadería tiene su propia pantalla porque una guía
// puede cubrir varias facturas.
//
// Vive como componente (y no dentro de la página) porque se dibuja en DOS
// lugares con los mismos datos: la página completa `/compras/factura/[compraId]`
// (enlace directo, recarga) y el modal que se abre encima de una lista
// (`@modal/(.)factura/[compraId]`). Un solo cuerpo, dos marcos.
//
// Movimiento (ADR-0136, prototipo docs/maquetas/comprobantes-animaciones-2026-09): línea de tiempo
// Registrado → Mercadería → Pago, tarjetas con barras que se llenan y un historial de pagos donde el nuevo entra
// con un destello. Este archivo es un Server Component: calcula con funciones puras de
// `lib/comprobante-linea-tiempo.ts` y pasa DATOS PLANOS a los componentes cliente `Comprobante*.tsx`.

// Producto · Cantidad × costo · Recibido · Subtotal
const PLANTILLA_LINEAS = "sm:grid-cols-[1fr_9rem_5.5rem_7rem]";
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
  /** Las tiendas a las que va la mercadería, con nombre («Tienda Trujillo · Taller»), o "—" si ya no existen. */
  destino: string;
  /** Reparto entre tiendas (ADR-0139): lo que le toca, recibió y cerró cada tienda de cada línea, y las reasignaciones. */
  reparto: RepartoDeCompra;
  /** Las tiendas activas, en el orden de la app (para nombrar y para elegir «a dónde va» al reasignar). */
  ubicaciones: { id: string; nombre: string }[];
  /** Cómo se le paga al proveedor (cuenta, CCI, Yape/Plin, titular, saldo a favor) para el modal de pago. Solo si el comprobante se puede pagar y la lectura salió bien. */
  datosPago?: DatosPagoProveedor;
  /** Qué puede hacer quien mira, módulo por módulo (ADR-0161 P1, 20260923140000): anular, reparto y adjuntos son de Facturas de
   *  compra; pagar, de Por pagar; las notas, de Notas de crédito. Solo esconde lo que la base igual rechazaría. */
  acciones: AccionesDeCompra;
  /** ADR-0184 (F4-F5): las tiendas con las que paga quien mira, para que «Registrar pago» sepa con cuál (`p_ubicacion_id`).
   *  `undefined` = líder: paga sin atarse a ninguna, como siempre. */
  misTiendas?: { id: string; nombre: string }[];
};

/** Lo que el modal de pago muestra del proveedor. Es un complemento: si la lectura falla el detalle sigue (principio 9) y el pago funciona igual, solo sin la tarjeta «Paga por» ni el saldo a favor a la vista — la base valida igual. */
async function cargarDatosPago(compra: CompraResumen): Promise<DatosPagoProveedor | undefined> {
  if (compra.estado !== "vigente" || compra.saldo <= 0) return undefined;
  try {
    const [proveedor, saldos] = await Promise.all([getProveedor(compra.proveedorId), getSaldosFavor([compra.proveedorId])]);
    return proveedor ? datosPagoDe(proveedor, saldos[compra.proveedorId] ?? 0) : undefined;
  } catch {
    return undefined;
  }
}

/** Trae todo lo que el detalle necesita en una sola pasada. `null` si la factura no existe (o RLS no la deja ver). */
export async function cargarDetalleCompra(compraId: string): Promise<DetalleCompra | null> {
  const compra = await getCompra(compraId);
  if (!compra) return null;
  const [lineas, pagos, recepciones, adjuntos, ubicaciones, notasCredito, cierres, datosPago, reparto, persona] = await Promise.all([
    getLineasCompra([compra.id]),
    getPagosCompra(compra.id),
    getRecepcionesCompra(compra.id),
    getAdjuntosCompra(compra.id),
    getUbicaciones(),
    getNotasCreditoCompra(compra.id),
    getCierresCompra(compra.id),
    cargarDatosPago(compra),
    getRepartoDeCompra(compra.id),
    requirePersonaActualV2(),
  ]);
  return {
    compra,
    lineas,
    pagos,
    recepciones,
    adjuntos,
    notasCredito,
    cierres,
    // ADR-0139: una factura puede repartirse entre tiendas; se muestran todas (la sección «Reparto por tienda» del detalle
    // dice cuánto le toca a cada una).
    destino: nombresDeDestinos(compra.ubicacionesDestino, Object.fromEntries(ubicaciones.map((u) => [u.id, u.nombre]))) || "—",
    reparto,
    ubicaciones: ubicaciones.map((u) => ({ id: u.id, nombre: u.nombre })),
    datosPago,
    acciones: accionesDeCompraDe(persona),
    misTiendas: persona.rol === "lider" ? undefined : persona.tiendasCompra,
  };
}

export function tipoCompra(compra: CompraResumen): string {
  return ETIQUETA_TIPO_DOCUMENTO[compra.tipo];
}

/** Título del detalle (modal y página), igual al prototipo aprobado: una línea chica en versalitas «FACTURA · F001-000482»
    y, debajo, el NOMBRE DEL PROVEEDOR en grande. Son <span> a propósito: <Modal> los mete dentro de un <h2>. */
export function TituloComprobante({ compra }: { compra: CompraResumen }) {
  const anulada = compra.estado === "anulada";
  return (
    <>
      <span className="cd-titulo label-cayla mb-0.5 block font-sans text-[11px] text-tinta/65">
        {tipoCompra(compra)} · {compra.documento}
      </span>
      <span className={`cd-titulo block break-words text-[26px] font-medium leading-[1.15] ${anulada ? "text-tinta/50 line-through" : ""}`}>{compra.proveedorNombre}</span>
    </>
  );
}

/** La línea gris bajo el nombre: «RUC … · Emitido 02/09 · Vence 02/10 · Destino Taller · Lima» (rojo si venció sin pagar).
    Reemplaza la cuadrícula EMITIDA / CONDICIÓN / DESTINO de antes. También <span>: va como bajada del <Modal>. */
export function DatosComprobante({ compra, destino }: Pick<DetalleCompra, "compra" | "destino">) {
  const datos = datosCabecera({
    ruc: compra.proveedorRuc,
    fechaEmision: compra.fechaEmision,
    condicion: compra.condicion,
    fechaVencimiento: compra.fechaVencimiento,
    vencida: compra.vencida && compra.estado === "vigente",
    destino,
    hoy: hoyLima(),
  });
  return (
    <span className="cd-datos block tabular-nums">
      {datos.map((d, i) => (
        <span key={d.texto} className={d.alerta ? "text-rojo" : undefined}>
          {i > 0 && " · "}
          {d.texto}
        </span>
      ))}
    </span>
  );
}

export function CompraDetalle({
  detalle: { compra, lineas, pagos, recepciones, adjuntos, notasCredito, datosPago, reparto, ubicaciones, acciones: permite, misTiendas },
  adjuntosFallidos = [],
  acciones = true,
}: {
  detalle: DetalleCompra;
  /** Nombres de archivos que no se pudieron subir al registrar (los manda CompraFormV2 por la URL). */
  adjuntosFallidos?: string[];
  /** `false` cuando el marco ya dibuja los botones en otro sitio (el modal los pone en su pie). En la página completa, el pie va al final del cuerpo. */
  acciones?: boolean;
}) {
  const anulada = compra.estado === "anulada";
  const hoy = hoyLima();
  // Todo lo que sigue se calcula AQUÍ (Server Component) con funciones puras de `lib/` y baja a los componentes
  // cliente como datos planos: nunca se pasa una función ni se llama a un archivo `"use client"` desde el servidor.
  const avanceDeRecepcion = avanceRecepcion(compra);
  const avanceDePago = avancePago(compra);
  const linea = lineaDeTiempo({
    ...compra,
    fechaUltimaRecepcion: recepciones[0]?.fecha ?? null,
    fechaUltimoPago: pagos[0]?.fecha ?? null,
    hoy,
  });
  const complementoSaldo = complementoDeSaldo({ condicion: compra.condicion, fechaVencimiento: compra.fechaVencimiento, vencida: compra.vencida, hoy });
  const unidadesCerradas = compra.cerradoCantidad;
  // ADR-0195 F2: la factura de un gasto (la luz) o de un activo (un mueble) no trae mercadería: nada que recibir.
  const esGasto = compra.naturaleza === "gasto" || compra.naturaleza === "activo";
  const queEs = compra.naturaleza === "activo" ? "activo fijo" : "gasto";

  return (
    <>
      {/* Composición del prototipo aprobado, de arriba abajo: total y estados → línea de tiempo → Recepción | Pago →
          pagos registrados → saldo pendiente. Lo que el prototipo no tiene pero la app necesita (líneas, recepciones,
          notas de crédito, adjuntos) va DESPUÉS, bajo un separador discreto (`cd-mas`).
          `data-sin-cascada`: `<Modal>` no anima este bloque entero; sus piezas entran una a una (`cd-detalle`,
          comprobantes-detalle.css) con el mismo ritmo. Tras un pago el refresco NO repite la entrada. */}
      <div className="cd-detalle space-y-5" data-sin-cascada>
        {/* ADR-0195 F2: la factura de un GASTO (la luz, el contador) no trae mercadería: no hay nada que recibir. */}
        {esGasto && (
          <p className="nota-cayla text-[13px]">
            Comprobante de <b>{queEs}</b>{compra.nota ? `: ${compra.nota}` : ""}. No trae mercadería. Lo que detalla vive en{" "}
            <a href="/finanzas/gastos" className="underline underline-offset-2 hover:text-rojo">Finanzas ▸ Gastos</a>, y se anula desde ahí.
          </p>
        )}
        {/* Total en grande y el estado (recepción y pago) en dos chips que cambian con un pop. */}
        <ComprobanteEncabezado
          total={soles(compra.total)}
          chips={[
            ...(esGasto ? [] : [{ clave: "recepcion", tono: TONO_ESTADO_RECEPCION[compra.estadoRecepcion], texto: ETIQUETA_ESTADO_RECEPCION[compra.estadoRecepcion] }]),
            { clave: "pago", tono: compra.vencida ? "rojo" : TONO_ESTADO_PAGO[compra.estadoPago], texto: compra.vencida ? "Vencida" : ETIQUETA_ESTADO_PAGO[compra.estadoPago], vivo: compra.vencida },
          ]}
          anulada={anulada ? `Anulada${compra.motivoAnulacion ? `: ${compra.motivoAnulacion}` : ""}.` : undefined}
        />

        {/* Registrado → Mercadería → Pago. Un comprobante anulado no avanza: no se dibuja. */}
        {!anulada && <ComprobanteLineaTiempo linea={linea} />}

        {/* Dos tarjetas lado a lado: RECEPCIÓN a la izquierda («210 de 600 u.») y PAGO a la derecha («S/ 2,000.00 de
            S/ 5,923.60»), cada una con su barra que se llena. El «Destino» y la «Condición» que antes vivían acá pasaron
            a la línea gris de la cabecera; el saldo, a la línea de abajo. */}
        <div className={`grid gap-3 ${esGasto ? "" : "sm:grid-cols-2"}`}>
          {!esGasto && <TarjetaAvance
            etiqueta="Recepción"
            valor={anulada ? "—" : compra.recibidoCantidad.toLocaleString("es-PE")}
            de={anulada ? undefined : `de ${compra.facturadoCantidad.toLocaleString("es-PE")} u.`}
            nota={unidadesCerradas > 0 ? `${unidadesCerradas.toLocaleString("es-PE")} ${unidadesCerradas === 1 ? "unidad cerrada" : "unidades cerradas"} por faltante.` : undefined}
            avance={avanceDeRecepcion}
            tono={compra.estadoRecepcion === "parcial" ? "ambar" : compra.estadoRecepcion === "recibida" ? "verde" : "neutro"}
          />}
          <TarjetaAvance
            etiqueta="Pago"
            valor={anulada ? "—" : soles(compra.pagado)}
            de={anulada ? undefined : `de ${soles(compra.total)}`}
            nota={compra.notasCredito > 0 ? `${soles(compra.notasCredito)} menos por notas de crédito.` : undefined}
            avance={avanceDePago}
            tono={compra.vencida ? "rojo" : compra.estadoPago === "parcial" ? "ambar" : compra.estadoPago === "pagada" ? "verde" : "neutro"}
          />
        </div>

        {/* ---------- pagos: cada pago nuevo entra con un desliz y un destello ---------- */}
        <ComprobantePagos pagos={pagos.map((p) => ({ id: p.id, fecha: p.fecha, metodo: p.metodo, referencia: p.referencia, monto: p.monto }))} />

        {/* Saldo pendiente: lo que falta y, si es a crédito, cuándo vence. Anulada no genera saldo. */}
        {!anulada && (
          <p className="text-xs text-tinta/55">
            {compra.saldo > 0 ? (
              <>
                Saldo pendiente <b className="font-semibold tabular-nums text-tinta">{soles(compra.saldo)}</b>
                {complementoSaldo && <span className={complementoSaldo.alerta ? "text-rojo" : undefined}> · {complementoSaldo.texto}</span>}
              </>
            ) : (
              "Sin saldo pendiente."
            )}
          </p>
        )}

        {/* ---------- lo que el prototipo no tiene pero la app necesita, bajo un separador discreto ---------- */}
        <div className="cd-mas space-y-6 border-t border-tinta/10 pt-6">
          {/* ---------- líneas ---------- */}
          <section className="space-y-2">
            <p className="label-cayla text-[11px] text-tinta/65">Líneas del comprobante</p>
            <Tabla>
              <Encabezado
                plantilla={PLANTILLA_LINEAS}
                columnas={[
                  { titulo: "Producto" },
                  { titulo: "Cant. × costo", alinear: "der" },
                  { titulo: "Recibido", alinear: "der" },
                  { titulo: "Subtotal", alinear: "der" },
                ]}
              />
              {lineas.map((l) => {
                const avanceLinea = fraccion(l.recibido + l.cerrado, l.cantidad);
                return (
                  <div key={l.id} className={fila(PLANTILLA_LINEAS)}>
                    <span className={celda("izq", "text-sm text-tinta")}>
                      {l.referencia} <span className="text-tinta/65">{l.varianteId ? [l.talla, l.color].filter(Boolean).join(" / ") || l.sku : "sin desglose"}</span>
                      {l.descripcion && <span className="block text-xs text-tinta/55">{l.descripcion}</span>}
                      {l.cerrado > 0 && <span className="block text-xs text-ambar-profundo">{l.cerrado.toLocaleString("es-PE")} cerradas por faltante</span>}
                      {!anulada && l.pendiente > 0 && (
                        <BotonCerrarFaltante
                          compra={compra}
                          linea={l}
                          producto={etiquetaDeLinea(l)}
                          // Repartida entre tiendas el faltante es de UNA: cuáles aún tienen algo pendiente y cuánto (ADR-0139).
                          tiendas={tiendasConPendiente(filasDeLinea(reparto.filas, l.id, ubicaciones.map((u) => u.id))).map((f) => ({
                            ubicacionId: f.ubicacionId,
                            nombre: ubicaciones.find((u) => u.id === f.ubicacionId)?.nombre ?? "Tienda inactiva",
                            pendiente: f.pendiente,
                          }))}
                        />
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
                      <BarraAvance fina avance={avanceLinea} tono={tonoDeAvance(avanceLinea)} etiqueta={`Recibido: ${l.recibido} de ${l.cantidad}`} />
                    </span>
                    <span className={celda("der", "text-sm tabular-nums text-tinta")}>{soles(l.subtotal)}</span>
                  </div>
                );
              })}
              {/* El pie es la factura leída como la lee un contador: las líneas
                  suman el subtotal, debajo el IGV, debajo el total del papel. Sin
                  IGV (nota de venta) solo se muestra el total. */}
              <Totales subtotal={compra.subtotal} igv={compra.igv} total={compra.total} />
            </Tabla>
          </section>

          {/* ---------- reparto por tienda (ADR-0139): solo si hay algo que decir o que mover ---------- */}
          <RepartoPorTienda compra={compra} lineas={lineas} reparto={reparto} ubicaciones={ubicaciones} puedeReasignar={permite.facturas} />

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

          <NotasCreditoCompra compra={compra} notas={notasCredito} cerrados={lineas.filter((l) => l.cerrado > 0).map((l) => ({ faltan: l.cerrado, costoUnitario: l.costoUnitario }))} />

          {/* Quién puede adjuntar lo decide la RPC (`fn_puede_registrar_facturas_compra`, ADR-0161 P1). Acá solo se esconde
              a quien no tiene Facturas de compra y en una factura anulada, que la RPC también rechaza. */}
          <AdjuntosDeFactura compraId={compra.id} adjuntos={adjuntos} puedeEditar={!anulada && permite.facturas} avisoInicial={adjuntosFallidos} />

          {compra.nota && (
            <p className="text-sm text-tinta/65">
              <span className="label-cayla text-[11px]">Nota · </span>
              {compra.nota}
            </p>
          )}
        </div>
      </div>

      {/* Página completa: el pie con las acciones va al final del cuerpo, con la misma composición que en el modal
          (en el modal lo dibuja `ModalRuta`, con `acciones={false}` acá). */}
      {acciones && !anulada && (
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-tinta/10 pt-4">
          <CompraAcciones compra={compra} tieneRecepciones={recepciones.length > 0} datosPago={datosPago} permite={permite} misTiendas={misTiendas} />
        </div>
      )}
    </>
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
