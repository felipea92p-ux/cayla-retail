"use client";

import { useMemo, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { resumenDeStock, resumenDeVentas, tablaPorCategoria, type FilaDeStock, type PrendaDelResumen, type PrendaVendida } from "@/lib/existencias-resumen";
import { useVentasDelMes } from "@/lib/useVentasDelMes";

/* ====================================================================
   ResumenStockOverlay · click en «Resumen disponible» (Felipe, 2026-10-01)

   Reemplaza «Cómo se mueve el stock» (ventas y cobertura de 7 días) por una vista que se lee de un vistazo, sin saber de
   inventario: cuántas prendas hay por categoría en el almacén y en el piso, cuántas se vendieron este mes, qué sale más,
   de qué hay más y qué sigue esperando en el almacén sin bajar. Sin cobertura ni «para cuántos días alcanza».
   Las cuentas son `lib/existencias-resumen.ts` (puras, con su prueba). Lo que hay sale de lo que el panel ya tiene cargado
   (se ve al instante); lo vendido se lee al abrir (`useVentasDelMes`) y, si no responde, lo demás se ve igual.
   Usa `Modal` (ADR-0136): hereda el movimiento del sistema, no define ninguno propio.
   ==================================================================== */

const n = (x: number) => x.toLocaleString("es-PE");

function Seccion({ titulo, bajada, children }: { titulo: string; bajada?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="font-display text-lg leading-tight text-tinta">{titulo}</h3>
      {bajada && <p className="mt-0.5 text-xs text-taupe">{bajada}</p>}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Vacio({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-hueso/60 px-3.5 py-3 text-sm text-taupe">{children}</p>;
}

function FilaPrenda({ p, derecha }: { p: Pick<PrendaDelResumen, "referencia" | "color" | "colorHex" | "fotoUrl" | "categoria">; derecha: ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <MiniaturaPrenda fotoUrl={p.fotoUrl} colorHex={p.colorHex} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-tinta">{p.referencia}</span>
        <span className="block truncate text-xs text-taupe">{[p.color, p.categoria].filter(Boolean).join(" · ") || "Sin color"}</span>
      </span>
      <span className="shrink-0 text-right text-sm tabular-nums text-tinta">{derecha}</span>
    </li>
  );
}

/** «y 3 prendas más» cuando la lista se cortó en el tope. */
function YMas({ restantes, detalle }: { restantes: number; detalle?: string }) {
  if (restantes <= 0) return null;
  return (
    <p className="pt-2 text-xs text-taupe">
      y {restantes} {restantes === 1 ? "prenda más" : "prendas más"}
      {detalle ? ` · ${detalle}` : ""}
    </p>
  );
}

/** La barra de una categoría: lo que hay, partido en piso (tinta) y almacén (taupe), a la escala de la que más tiene. */
function BarraDeStock({ piso, almacen, escala }: { piso: number; almacen: number; escala: number }) {
  if (escala <= 0) return null;
  return (
    <span aria-hidden /* unificar-fijo: barra de largo a escala (compara con la categoría que más tiene), no reparte un total; docs/unificar/grafico.barra.md */ className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-tinta/5" style={{ width: `${Math.max(((piso + almacen) / escala) * 100, 4)}%` }}>
      <span className="bg-tinta" style={{ width: `${(piso / Math.max(piso + almacen, 1)) * 100}%` }} />
      <span className="flex-1 bg-taupe/50" />
    </span>
  );
}

export function ResumenStockOverlay({
  stock,
  separa,
  ubicacionId,
  sedeNombre,
  onClose,
}: {
  stock: readonly FilaDeStock[];
  /** ¿Esta sede separa piso y almacén? El Taller no: allí solo hay «lo que hay». */
  separa: boolean;
  ubicacionId: string;
  sedeNombre: string;
  onClose: () => void;
}) {
  const ventasDelMes = useVentasDelMes(ubicacionId);
  const delStock = useMemo(() => resumenDeStock(stock, { separa }), [stock, separa]);
  const deLasVentas = useMemo(() => (ventasDelMes.ventas ? resumenDeVentas(ventasDelMes.ventas, delStock) : null), [ventasDelMes.ventas, delStock]);
  const tabla = useMemo(() => tablaPorCategoria(delStock, deLasVentas), [delStock, deLasVentas]);
  const escala = useMemo(() => Math.max(0, ...tabla.filas.map((f) => f.total)), [tabla]);

  const mes = ventasDelMes.mes;
  const nombreDelMes = mes?.nombre ?? "este mes";
  const leyendo = ventasDelMes.estado === "cargando";
  const fallo = ventasDelMes.estado === "fallo";
  const reintentar = (
    <button type="button" onClick={ventasDelMes.reintentar} className="font-semibold text-tinta underline underline-offset-2">
      Reintentar
    </button>
  );
  const sinNada = delStock.total === 0 && !(deLasVentas && deLasVentas.vendidas > 0);
  // Las columnas de la tabla van en línea y no como clase `grid-cols-[…]`: si la hoja de estilos no trae esa clase (una build o un servidor
  // de desarrollo sin regenerar), la cuadrícula se apilaba en UNA columna y la tabla dejaba de leerse (2026-10-01).
  const columnas = separa ? "minmax(0,1fr) 4rem 4rem 4.5rem" : "minmax(0,1fr) 4rem 4.5rem";

  return (
    <Modal
      titulo="Resumen del stock"
      subtitulo={`${sedeNombre} · lo que hay hoy y lo vendido ${mes ? `desde el ${mes.desdeTexto}` : "este mes"}.`}
      onClose={onClose}
      ancho="max-w-2xl"
      variante="papel"
    >
      <div className="space-y-6">
        <div className={`grid grid-cols-1 gap-3 ${separa ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {/* La pieza única de cifra (TarjetaCifra, ADR-0358). Si las ventas no se pudieron leer, lo dice como tal. */}
          <TarjetaCifra etiqueta="Hay en la tienda" valor={n(delStock.total)}>
            {separa ? `${n(delStock.piso ?? 0)} en piso · ${n(delStock.almacen ?? 0)} en almacén` : "prendas libres, sin las apartadas"}
          </TarjetaCifra>
          <TarjetaCifra etiqueta={`Vendidas en ${nombreDelMes}`} valor={deLasVentas ? n(deLasVentas.vendidas) : null} noSePudoLeer={Boolean(fallo)}>
            {fallo ? <>No pudimos leerlas. {reintentar}</> : leyendo ? "Leyendo las ventas…" : "Empieza de cero el día 1 de cada mes"}
          </TarjetaCifra>
          {separa && (
            <TarjetaCifra
              etiqueta="Esperando en el almacén"
              valor={n(delStock.esperando.unidades)}
              tono={delStock.esperando.prendas > 0 ? "text-ambar-profundo" : undefined}
            >
              {delStock.esperando.prendas === 0
                ? "Todo lo que hay atrás ya tiene piso"
                : `${delStock.esperando.prendas} ${delStock.esperando.prendas === 1 ? "prenda" : "prendas"} sin ninguna en el piso`}
            </TarjetaCifra>
          )}
        </div>

        {sinNada ? (
          <Vacio>Todavía no hay prendas con stock en esta sede.</Vacio>
        ) : (
          <Seccion titulo="Por categoría" bajada={separa ? "Cuántas prendas hay en el piso y en el almacén, y cuántas se vendieron este mes." : "Cuántas prendas hay y cuántas se vendieron este mes."}>
            <div className="overflow-hidden rounded-lg border border-tinta/10">
              <div className="grid gap-x-3 bg-hueso/60 px-3.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-taupe" style={{ gridTemplateColumns: columnas }}>
                <span>Categoría</span>
                {separa ? (
                  <>
                    <span className="text-right">Piso</span>
                    <span className="text-right">Almacén</span>
                  </>
                ) : (
                  <span className="text-right">Hay</span>
                )}
                <span className="text-right">Vendidas</span>
              </div>
              <ul className="divide-y divide-tinta/10">
                {tabla.filas.map((f) => (
                  <li key={f.nombre} className="grid items-center gap-x-3 px-3.5 py-2.5 text-sm tabular-nums" style={{ gridTemplateColumns: columnas }}>
                    <span className="min-w-0">
                      <span className="block truncate text-tinta">{f.nombre}</span>
                      {separa && <BarraDeStock piso={f.piso ?? 0} almacen={f.almacen ?? 0} escala={escala} />}
                    </span>
                    {separa ? (
                      <>
                        <span className="text-right text-tinta">{n(f.piso ?? 0)}</span>
                        <span className="text-right text-tinta">{n(f.almacen ?? 0)}</span>
                      </>
                    ) : (
                      <span className="text-right text-tinta">{n(f.total)}</span>
                    )}
                    <span className="text-right font-semibold text-tinta">{f.vendidas === null ? "—" : n(f.vendidas)}</span>
                  </li>
                ))}
              </ul>
              <div className="grid gap-x-3 border-t border-tinta/15 bg-hueso/60 px-3.5 py-2.5 text-sm font-semibold tabular-nums text-tinta" style={{ gridTemplateColumns: columnas }}>
                <span>Total</span>
                {separa ? (
                  <>
                    <span className="text-right">{n(tabla.total.piso ?? 0)}</span>
                    <span className="text-right">{n(tabla.total.almacen ?? 0)}</span>
                  </>
                ) : (
                  <span className="text-right">{n(tabla.total.total)}</span>
                )}
                <span className="text-right">{tabla.total.vendidas === null ? "—" : n(tabla.total.vendidas)}</span>
              </div>
            </div>
            {separa && (
              <p className="mt-2 flex items-center gap-3 text-xs text-taupe">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="h-1.5 w-3 rounded-full bg-tinta" /> Piso
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="h-1.5 w-3 rounded-full bg-taupe/50" /> Almacén
                </span>
              </p>
            )}
          </Seccion>
        )}

        <Seccion titulo="Lo que más se vende" bajada={`Las prendas con más ventas desde el ${mes?.desdeTexto ?? "1 del mes"} y cuántas quedan.`}>
          {fallo ? (
            <Vacio>No pudimos leer las ventas del mes. {reintentar}</Vacio>
          ) : leyendo ? (
            <Vacio>Leyendo las ventas del mes…</Vacio>
          ) : !deLasVentas || deLasVentas.masVendidas.length === 0 ? (
            <Vacio>Todavía no hay ventas este mes.</Vacio>
          ) : (
            <ul className="divide-y divide-tinta/10">
              {deLasVentas.masVendidas.map((p: PrendaVendida) => (
                <FilaPrenda
                  key={p.clave}
                  p={p}
                  derecha={
                    <>
                      <b className="font-semibold">{n(p.vendidas)}</b> {p.vendidas === 1 ? "vendida" : "vendidas"}
                      <span className="block text-xs text-taupe">{p.quedan === 0 ? "ya no quedan" : `${p.quedan === 1 ? "queda" : "quedan"} ${n(p.quedan)}`}</span>
                    </>
                  }
                />
              ))}
            </ul>
          )}
        </Seccion>

        {delStock.masStock.length > 0 && (
          <Seccion titulo="De lo que más hay" bajada="Las prendas con más unidades hoy, entre el piso y el almacén.">
            <ul className="divide-y divide-tinta/10">
              {delStock.masStock.map((p) => (
                <FilaPrenda
                  key={p.clave}
                  p={p}
                  derecha={
                    <>
                      <b className="font-semibold">{n(p.total)}</b> {p.total === 1 ? "prenda" : "prendas"}
                      {separa && (
                        <span className="block text-xs text-taupe">
                          {n(p.piso ?? 0)} en piso · {n(p.almacen ?? 0)} en almacén
                        </span>
                      )}
                    </>
                  }
                />
              ))}
            </ul>
          </Seccion>
        )}

        {separa && delStock.esperando.prendas > 0 && (
          <Seccion titulo="Esperando en el almacén" bajada="Tienen stock atrás y ninguna en el piso: el cliente todavía no las ve.">
            <ul className="divide-y divide-tinta/10">
              {delStock.esperando.lista.map((p) => (
                <FilaPrenda
                  key={p.clave}
                  p={p}
                  derecha={
                    <>
                      <b className="font-semibold">{n(p.almacen ?? 0)}</b> {p.almacen === 1 ? "prenda" : "prendas"}
                      <span className="block text-xs text-taupe">en almacén</span>
                    </>
                  }
                />
              ))}
            </ul>
            <YMas restantes={delStock.esperando.prendas - delStock.esperando.lista.length} detalle={`${n(delStock.esperando.unidades)} prendas esperando en total`} />
          </Seccion>
        )}
      </div>
    </Modal>
  );
}
