import { BarraAvance } from "@/components/ComprobanteAvance";
import { BotonReasignar, type LineaReasignable } from "@/components/ReasignarReparto";
import { fraccion, tonoDeAvance } from "@/lib/comprobante-linea-tiempo";
import { fechaCorta, type CompraResumen, type LineaCompra } from "@/lib/compras-reglas";
import type { RepartoDeCompra } from "@/lib/compras-reparto";
import { hoyLima } from "@/lib/fechas-lima";
import { estaRepartido, ETIQUETA_MOTIVO_REASIGNACION, etiquetaDeLinea, filasDeLinea, resumenPorTienda, textoDeReasignacion, tiendasDelReparto } from "@/lib/reparto-reglas";

// «Reparto por tienda» en el detalle de un comprobante (ADR-0138): cuánto le toca a cada tienda de cada línea y cuánto ya
// recibió, para saber de un vistazo qué tienda va atrasada; y desde aquí un líder puede reasignar lo que aún no llegó.
//
// Server Component: las cifras salen de `getRepartoDeCompra` (la vista `compra_item_reparto_resumen`, derivada de
// `movimientos`: nada se guarda aparte) y solo el botón «Reasignar» es cliente.
//
// Cuándo se dibuja:
//   · repartido entre varias tiendas → la matriz (línea × tienda), los totales y el historial;
//   · de UNA sola tienda con algo por recibir → una frase y el botón: es el único camino para «esto llegó a otra tienda»,
//     y sin él recibirlo allá se rechaza («esa línea no tiene mercadería asignada a esta tienda»);
//   · si no se pudo leer → lo dice en su lugar (no se dibuja vacío, que mentiría: parecería un comprobante sin reparto).

export function RepartoPorTienda({
  compra,
  lineas,
  reparto,
  ubicaciones,
}: {
  compra: CompraResumen;
  lineas: LineaCompra[];
  reparto: RepartoDeCompra;
  /** Las tiendas activas, en el orden de la app. */
  ubicaciones: { id: string; nombre: string }[];
}) {
  // Un comprobante anulado ya no recibe nada: no hay reparto que mostrar ni mercadería que mover.
  if (compra.estado !== "vigente") return null;

  const titulo = <p className="label-cayla text-[11px] text-tinta/65">Reparto por tienda</p>;
  if (reparto.fallo) {
    return (
      <section className="space-y-2">
        {titulo}
        <p className="card-cayla p-5 text-sm text-tinta/65">{reparto.fallo}</p>
      </section>
    );
  }

  const { filas, reasignaciones } = reparto;
  if (filas.length === 0) return null;

  const orden = ubicaciones.map((u) => u.id);
  const nombreDe = (id: string) => ubicaciones.find((u) => u.id === id)?.nombre ?? "Tienda inactiva";
  const repartido = estaRepartido(filas);
  const hayPendiente = filas.some((f) => f.pendiente > 0);
  if (!repartido && !hayPendiente && reasignaciones.length === 0) return null;

  const lineasReasignables: LineaReasignable[] = lineas.map((l) => ({ id: l.id, producto: etiquetaDeLinea(l) }));
  const nombreDeLinea = new Map(lineasReasignables.map((l) => [l.id, l.producto]));
  const reasignar = (lineaInicialId?: string, etiqueta?: string) =>
    hayPendiente ? <BotonReasignar compra={compra} lineas={lineasReasignables} filas={filas} ubicaciones={ubicaciones} lineaInicialId={lineaInicialId} etiqueta={etiqueta} /> : null;

  const historial =
    reasignaciones.length > 0 ? (
      <div className="space-y-1.5">
        <p className="label-cayla text-[10.5px] text-tinta/55">Movimientos entre tiendas</p>
        <ul className="space-y-1 text-xs leading-relaxed text-tinta/65">
          {reasignaciones.slice(0, 5).map((r) => (
            <li key={r.id}>
              <span className="tabular-nums">{fechaCorta(hoyLima(new Date(r.creadoEn)))}</span> · {nombreDeLinea.get(r.compraItemId) ?? "Línea del comprobante"}: {textoDeReasignacion(r, nombreDe)} ·{" "}
              {ETIQUETA_MOTIVO_REASIGNACION[r.motivo]}
              {r.nota ? ` — «${r.nota}»` : ""}
            </li>
          ))}
        </ul>
        {reasignaciones.length > 5 && <p className="text-xs text-tinta/45">y {reasignaciones.length - 5} más antiguos.</p>}
      </div>
    ) : null;

  // De una sola tienda: una frase que explica para qué sirve «Reasignar», no una matriz de una columna.
  if (!repartido) {
    const unica = tiendasDelReparto(filas, orden)[0];
    return (
      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          {titulo}
          {reasignar()}
        </div>
        <div className="card-cayla space-y-3 p-4">
          <p className="text-sm leading-relaxed text-tinta/75">
            Toda la mercadería de este comprobante es para <b className="font-semibold text-tinta">{nombreDe(unica)}</b>. Si llegó a otra tienda, muévela con «Reasignar»: sin eso esa tienda no podrá recibirla.
          </p>
          {historial}
        </div>
      </section>
    );
  }

  const ids = tiendasDelReparto(filas, orden);
  const totales = resumenPorTienda(filas, orden);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {titulo}
        {reasignar()}
      </div>
      <p className="text-xs text-tinta/55">Cada casilla dice lo que ya recibió esa tienda y lo que le toca: 4/12 es «recibió 4 de sus 12».</p>
      <div className="card-cayla overflow-x-auto">
        <table className="w-full min-w-[30rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-tinta/10">
              <th scope="col" className="label-cayla px-5 py-2 text-left text-[11px] font-normal text-tinta/55">
                Producto
              </th>
              {ids.map((id) => (
                <th key={id} scope="col" className="label-cayla px-3 py-2 text-right text-[11px] font-normal text-tinta/55">
                  {nombreDe(id)}
                </th>
              ))}
              <th scope="col" className="px-5 py-2">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tinta/10">
            {lineas.map((l) => {
              const propias = filasDeLinea(filas, l.id, ids);
              if (propias.length === 0) return null;
              const pendiente = propias.some((f) => f.pendiente > 0);
              return (
                <tr key={l.id}>
                  <th scope="row" className="px-5 py-3 text-left align-baseline text-sm font-normal text-tinta">
                    {etiquetaDeLinea(l)}
                  </th>
                  {ids.map((id) => {
                    const f = propias.find((x) => x.ubicacionId === id);
                    return (
                      <td key={id} className="px-3 py-3 text-right align-baseline tabular-nums">
                        {f ? (
                          <span aria-label={`${nombreDe(id)}: recibió ${f.recibido} de ${f.asignado}`}>
                            <span className={f.pendiente === 0 ? "text-tinta" : f.recibido > 0 ? "text-ambar-profundo" : "text-tinta/70"}>
                              <b className="font-semibold">{f.recibido}</b>/{f.asignado}
                            </span>
                            {f.cerrado > 0 && <span className="block text-[11px] text-ambar-profundo">{f.cerrado} cerradas</span>}
                          </span>
                        ) : (
                          <span aria-label={`${nombreDe(id)}: nada de esta línea`} className="text-tinta/30">
                            —
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-5 py-3 text-right align-baseline">{pendiente ? reasignar(l.id, "Reasignar") : null}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-tinta/15 bg-tinta/[0.03]">
              <th scope="row" className="label-cayla px-5 py-3 text-left align-top text-[11px] font-normal text-tinta">
                En total
              </th>
              {totales.map((t) => {
                const avance = fraccion(t.recibido + t.cerrado, t.asignado);
                return (
                  <td key={t.ubicacionId} className="px-3 py-3 text-right align-top tabular-nums">
                    <span className="text-sm text-tinta">
                      <b className="font-semibold">{t.recibido}</b>/{t.asignado}
                    </span>
                    <BarraAvance fina avance={avance} tono={tonoDeAvance(avance)} etiqueta={`${nombreDe(t.ubicacionId)}: ${t.recibido} de ${t.asignado}`} />
                    <span className="mt-1 block text-[11px] text-tinta/55">{t.pendiente > 0 ? `faltan ${t.pendiente}` : "completa"}</span>
                  </td>
                );
              })}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {historial}
    </section>
  );
}
