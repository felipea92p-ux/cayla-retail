"use client";

import Link from "next/link";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { BotonAccion, type AlAccionar } from "@/components/ResumenAccion";
import { DIAS_OBJETIVO_COBERTURA, DIAS_RESERVA_SEGURIDAD, MIN_DIAS_CON_STOCK_VELOCIDAD } from "@/lib/inventario-reglas";
import { contextoAccion, resolverAccion } from "@/lib/resumen-acciones";
import { formatoCoberturaConUnidad, formatoDias, formatoVariacion, formatoVelocidad, nombreCorto, pluralizar } from "@/lib/resumen-formato";
import type { ResumenParaPantalla } from "@/lib/resumen-armado";
import { cedibleDe, type AnalisisVariante } from "@/lib/resumen-reglas";

// El detalle de una variante: explica LA DECISIÓN, no repite Existencias. Sigue
// la cadena de la pantalla — hecho → velocidad → riesgo → oportunidad → acción —
// y cada cifra dice con qué se calculó.

const fechaCorta = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "America/Lima" }) : null);

function Seccion({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="label-cayla text-[10px] text-tinta/60">{titulo}</h3>
        {nota && <span className="text-[11px] text-tinta/50">{nota}</span>}
      </div>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

function Dato({ titulo, children, pie }: { titulo: string; children: React.ReactNode; pie?: React.ReactNode }) {
  return (
    <div className="bg-papel p-3">
      <p className="label-cayla text-[10px] text-tinta/55">{titulo}</p>
      <p className="mt-0.5 text-sm text-tinta">{children}</p>
      {pie && <p className="mt-0.5 text-xs leading-4 text-tinta/60">{pie}</p>}
    </div>
  );
}

const REJILLA = "grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-tinta/10 bg-tinta/10 min-[560px]:grid-cols-3";

export function ResumenDetalleModal({
  a,
  datos,
  puedeBajarAlPiso,
  alAccionar,
  onClose,
}: {
  a: AnalisisVariante;
  datos: ResumenParaPantalla;
  puedeBajarAlPiso: boolean;
  alAccionar: AlAccionar;
  onClose: () => void;
}) {
  const f = a.fila;
  const v = a.velocidad;
  const { periodo, ubicacion, exactitud } = datos;
  const ctx = contextoAccion(a, ubicacion, puedeBajarAlPiso);
  const cobProyectada = v.unidadesDia && f.enCaminoATiempo > 0 ? (f.utilizable + f.enCaminoATiempo) / v.unidadesDia : null;

  const textoVelocidad =
    v.estado === "ok"
      ? `${v.estimada ? "≈ " : ""}${formatoVelocidad(v.unidadesDia!)} uds/día`
      : v.estado === "sin_ventas"
        ? `Sin ventas en ${formatoDias(v.diasBase ?? 0)} con stock`
        : v.estado === "poco_historial"
          ? `Poco historial: ${formatoDias(v.diasBase ?? 0)} en venta (hacen falta ${MIN_DIAS_CON_STOCK_VELOCIDAD})`
          : "Sin historial en esta sede";

  const tendencia = a.tendencia;
  const textoTendencia = !tendencia
    ? "Sin comparación elegida"
    : tendencia.direccion === "sin_dato"
      ? "No hay días suficientes para comparar"
      : `${tendencia.direccion === "alza" ? "En alza" : tendencia.direccion === "baja" ? "En baja" : "Estable"} ${formatoVariacion(tendencia.variacionPct ?? 0)}`;

  const textoCobertura =
    a.cobertura.tipo === "agotado" ? "0 días (sin stock)" : a.cobertura.tipo === "medida" ? formatoCoberturaConUnidad(a.cobertura.dias ?? 0) : a.cobertura.tipo === "sin_ventas" ? "> 60 días (sin ventas)" : "Sin historial suficiente";

  return (
    <Modal
      titulo={`${f.referencia}${f.color ? ` · ${f.color}` : ""}${f.talla ? ` · ${f.talla}` : ""}`}
      subtitulo={<span className="font-mono">{f.sku}</span>}
      onClose={onClose}
      ancho="max-w-3xl"
    >
      {(cerrar) => (
        <div className="mt-3 space-y-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {a.chips.map((c) => (
              <span key={c.clave} title={c.ayuda}>
                <Chip tono={c.tono}>{c.texto}</Chip>
              </span>
            ))}
            {a.chips.length === 0 && <span className="text-sm text-tinta/55">Sin señales para esta prenda.</span>}
            {a.plan.principal && (
              <span className="ml-auto w-44">
                <BotonAccion a={a} destino={ubicacion} puedeBajarAlPiso={puedeBajarAlPiso} alAccionar={{ ...alAccionar, verDetalle: () => undefined }} />
              </span>
            )}
          </div>

          <Seccion titulo="Stock actual" nota="es el de ahora, sin importar el período elegido">
            <div className={REJILLA}>
              {f.separaPisoAlmacen ? (
                <>
                  <Dato titulo="Piso">{f.piso}</Dato>
                  <Dato titulo="Almacén">{f.almacen}</Dato>
                </>
              ) : (
                <Dato titulo="Disponible">{f.disponible}</Dato>
              )}
              <Dato titulo="En tránsito" pie={f.enCamino > 0 ? [f.enCaminoAtrasado ? `${f.enCamino - f.enCaminoATiempo} atrasadas` : null, f.enCaminoATiempo > 0 ? (fechaCorta(f.proximaLlegada) ? `llega ${fechaCorta(f.proximaLlegada)}` : "sin fecha") : null].filter(Boolean).join(" · ") : undefined}>
                {f.enCamino > 0 ? `+${f.enCamino}` : "—"}
              </Dato>
              {f.sinUbicar > 0 && (
                <Dato titulo="Sin ubicar" pie="ni en piso ni en almacén">
                  {f.sinUbicar}
                </Dato>
              )}
              {f.cuarentena > 0 && (
                <Dato titulo="En cuarentena" pie="dañado: no cuenta">
                  {f.cuarentena}
                </Dato>
              )}
            </div>
            {f.enRed.length > 0 && (
              <ul className="mt-2 divide-y divide-tinta/10 text-sm">
                {f.enRed.map((o) => {
                  const ced = cedibleDe(o);
                  return (
                    <li key={o.ubicacionId} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5">
                      <span className="text-tinta">
                        {nombreCorto(o.nombre)} <span className="text-tinta/60">· {pluralizar(o.tipo === "tienda" ? o.utilizable : o.disponible, "ud", "uds")}</span>
                        {o.enCamino > 0 && <span className="text-tinta/60"> · +{o.enCamino} en camino</span>}
                      </span>
                      <span className="text-xs text-tinta/60">{ced.unidades > 0 ? `puede ceder ${ced.unidades}` : "no puede ceder"} — {ced.motivo}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Seccion>

          <Seccion titulo={`Demanda del período · ${periodo.etiqueta}`} nota="ventas netas: sin anuladas, restando devoluciones y cambios">
            <div className={REJILLA}>
              <Dato titulo="Vendidas (netas)" pie={f.devoluciones > 0 ? `${f.ventas} vendidas − ${f.devoluciones} devueltas` : undefined}>
                {v.ventasNetas}
              </Dato>
              <Dato titulo="Velocidad" pie={v.diasBase !== null ? `en venta ${formatoDias(v.diasBase)} de ${periodo.dias}${v.estimada ? " · aproximado: el historial de movimientos no cuadra" : ""}` : undefined}>
                {textoVelocidad}
              </Dato>
              <Dato titulo="Tendencia" pie={tendencia?.unidadesDiaPrevia ? `antes: ${formatoVelocidad(tendencia.unidadesDiaPrevia)} uds/día` : undefined}>
                {textoTendencia}
              </Dato>
              <Dato titulo="Sell-through" pie={a.sellThrough !== null ? `de ${f.stockInicial} al inicio + ${f.entradas} recibidas` : "sin base para calcularlo"}>
                {a.sellThrough === null ? "—" : `${a.sellThrough}%`}
              </Dato>
              <Dato titulo="Cobertura" pie={cobProyectada !== null ? `con lo que llega: ${formatoCoberturaConUnidad(cobProyectada)}` : `de ${f.utilizable} ${f.utilizable === 1 ? "unidad utilizable" : "unidades utilizables"}`}>
                {textoCobertura}
                {a.bajoReserva && <span className="ml-1 text-xs text-ambar-profundo">↓ bajo reserva</span>}
              </Dato>
            </div>
          </Seccion>

          {a.curva && (
            <Seccion titulo="Curva de tallas" nota={`${a.curva.curva.referencia}${a.curva.curva.color ? ` · ${a.curva.curva.color}` : ""}`}>
              <ul className="flex flex-wrap gap-2">
                {a.curva.curva.tallas.map((t) => {
                  const falta = a.curva!.curva.faltantes.some((x) => x.varianteId === t.varianteId);
                  return (
                    <li key={t.varianteId} className={`rounded-md border px-3 py-1.5 text-sm ${falta ? "border-rojo/35 bg-rojo/10 text-rojo-profundo" : "border-tinta/15 text-tinta"} ${t.varianteId === f.varianteId ? "ring-2 ring-tinta/25" : ""}`}>
                      <span className="font-medium">{t.talla}</span> <span className="tabular-nums">{t.utilizable}</span>
                      {falta && <span className="ml-1 text-[11px]">falta</span>}
                    </li>
                  );
                })}
              </ul>
            </Seccion>
          )}

          <Seccion titulo="Reposición" nota={a.reserva !== null ? `reserva de seguridad: ${a.reserva} uds (${DIAS_RESERVA_SEGURIDAD} días de venta)` : undefined}>
            {a.plan.pasos.length === 0 ? (
              <p className="text-sm text-tinta/70">
                {a.descontinuada ? "El producto está descontinuado: no se repone." : ubicacion.tipo !== "tienda" ? `${nombreCorto(ubicacion.nombre)} no vende a clientas: su stock está para distribuir.` : "Nada que reponer por ahora."}
              </p>
            ) : (
              <>
                {a.plan.objetivo !== null && (
                  <p className="mb-2 text-sm text-tinta/80">
                    Objetivo: {DIAS_OBJETIVO_COBERTURA} días de venta + reserva = <span className="font-medium text-tinta">{a.plan.objetivo} uds</span>
                    {a.plan.faltante !== null && a.plan.faltante > 0 && (
                      <>
                        {" "}
                        · faltan <span className="font-medium text-tinta">{a.plan.faltante}</span> sobre lo que hay y lo que llega a tiempo
                      </>
                    )}
                  </p>
                )}
                <ol className="space-y-2">
                  {a.plan.pasos.map((p, i) => {
                    const accion = resolverAccion(p, ctx);
                    return (
                      <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-tinta/10 p-2.5">
                        <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sand/70 text-xs text-tinta">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1 text-sm text-tinta/80">{p.motivo}</span>
                        {accion.via !== "detalle" && accion.via !== "ninguna" && (
                          <span className="w-44 shrink-0">
                            <BotonAccion a={a} paso={p} estilo="normal" destino={ubicacion} puedeBajarAlPiso={puedeBajarAlPiso} alAccionar={{ ...alAccionar, verDetalle: () => undefined }} />
                          </span>
                        )}
                        {(accion.via === "detalle" || accion.via === "ninguna") && <span className="shrink-0 text-xs font-medium text-tinta">{p.texto}</span>}
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-2 text-xs text-tinta/55">Nada se mueve desde acá: cada botón lleva al flujo real, ya prellenado, y ahí se confirma.</p>
              </>
            )}
            {f.stockMinimo !== null && <p className="mt-2 text-xs text-tinta/55">Stock mínimo del producto (Catálogo, toda la red): {f.stockMinimo}. Es otra cosa que la reserva de seguridad.</p>}
          </Seccion>

          <Seccion titulo="Trazabilidad" nota={periodo.etiqueta}>
            <div className={REJILLA}>
              <Dato titulo="Llegó a la sede">{fechaCorta(f.primerIngreso) ?? "—"}</Dato>
              <Dato titulo="Recibido en el período">{f.entradas}</Dato>
              <Dato titulo="Última venta">{fechaCorta(f.ultimaVenta) ?? "—"}</Dato>
              <Dato titulo="Enviado a otras sedes">{f.trasladosSalida}</Dato>
              <Dato titulo="Mermas">{f.mermas}</Dato>
              <Dato titulo="Último conteo de la sede" pie={exactitud.porcentaje !== null ? `${exactitud.porcentaje}% de líneas correctas` : undefined}>
                {fechaCorta(exactitud.ultimoConteo) ?? "pendiente"}
              </Dato>
            </div>
          </Seccion>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-tinta/10 pt-4">
            <Link href={`/inventario?ubicacion=${ubicacion.id}`} className="label-cayla text-[10px] text-tinta/60 underline-offset-2 hover:text-rojo hover:underline">
              Ver en Existencias
            </Link>
            <Link href={`/inventario/movimientos?ubicacion=${ubicacion.id}&q=${encodeURIComponent(f.sku || f.referencia)}`} className="label-cayla text-[10px] text-tinta/60 underline-offset-2 hover:text-rojo hover:underline">
              Ver movimientos
            </Link>
            <button type="button" onClick={cerrar} className="label-cayla ml-auto text-[10px] text-tinta/60 underline-offset-2 hover:text-rojo hover:underline">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
