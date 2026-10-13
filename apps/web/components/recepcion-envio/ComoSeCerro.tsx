import { Aviso } from "@/components/ui/Aviso";
import { BotonEnlace } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { soles } from "@/lib/compras-reglas";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { compararTallas } from "@/lib/tallas";
import {
  despuesDeRecibirEnvio,
  detalleRecibido,
  nombreDeLinea,
  textoCausa,
  tituloRecibido,
  type DetalleEnvio,
  type DiferenciaEnvio,
  type RecibidoEnvio,
  type ResultadoRecepcion,
} from "@/lib/recepcion-envio-reglas";

// «Cómo se cerró» (ADR-0362, fase 4; decisión 13: «la recepción muestra cómo se cerró»): un envío ya recibido, de solo lectura. Arriba, lo
// que quedó y lo que sigue —imprimir las etiquetas de precio de sus lotes y bajar lo bueno al piso, como «Llegó mercadería»—; debajo, línea
// por línea, qué prenda entró en cada talla y color, cuántas dañadas, a qué costo, y qué faltó o sobró con su causa. Lo que no estaba en la
// guía va al final. Si la base todavía no dice el detalle, queda el resumen.

function Recibido({ r }: { r: RecibidoEnvio }) {
  const variante = [r.talla, r.color].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1.5 text-sm">
      <span className="min-w-0 text-tinta">
        {r.prenda ?? "Prenda"}
        {variante && <span className="text-taupe"> · {variante}</span>}
      </span>
      <span className="tabular-nums text-tinta">
        {r.cantidad.toLocaleString("es-PE")}
        {r.danadas > 0 && <span className="text-ambar"> ({r.danadas.toLocaleString("es-PE")} dañada{r.danadas === 1 ? "" : "s"})</span>}
        {r.costoUnitario != null && <span className="text-taupe"> · {soles(r.costoUnitario)} c/u</span>}
      </span>
    </li>
  );
}

function Diferencias({ difs }: { difs: readonly DiferenciaEnvio[] }) {
  if (difs.length === 0) return null;
  return (
    <p className="flex flex-wrap gap-1.5">
      {difs.map((d, i) => (
        <Chip key={i} tono={d.tipo === "faltante" ? "ambar" : "pizarra"}>
          {d.tipo === "faltante" ? `${d.cantidad === 1 ? "Faltó 1" : `Faltaron ${d.cantidad.toLocaleString("es-PE")}`}` : `${d.cantidad.toLocaleString("es-PE")} de más`}
          {d.causa ? ` · ${textoCausa(d.causa)}` : ""}
        </Chip>
      ))}
    </p>
  );
}

export function ComoSeCerro({
  detalle,
  resultado,
  lotes,
  buenas,
  veExistencias,
}: {
  detalle: DetalleEnvio;
  /** Lo que contestó la base al cerrar en esta misma visita (antes de que llegue el detalle cerrado). */
  resultado: ResultadoRecepcion | null;
  lotes: readonly string[];
  /** Lo bueno por variante, para «Bajar al piso». */
  buenas: readonly { varianteId: string; cantidad: number }[];
  veExistencias: boolean;
}) {
  // En el orden en que se cuenta: la prenda, su talla en la curva (S · M · L, no por letra) y el color.
  const recibidos = [...(detalle.recibidos ?? [])].sort(
    (a, b) => (a.prenda ?? "").localeCompare(b.prenda ?? "", "es") || compararTallas(a.talla ?? "", b.talla ?? "") || (a.color ?? "").localeCompare(b.color ?? "", "es"),
  );
  const diferencias = detalle.diferencias ?? [];
  const sumaBuenas = recibidos.reduce((a, r) => a + Math.max(0, r.cantidad - r.danadas), 0);
  const sumaDanadas = recibidos.reduce((a, r) => a + r.danadas, 0);
  const resumen = resultado ?? detalle.recepcion ?? {
    numero: detalle.numero,
    buenas: sumaBuenas,
    danadas: sumaDanadas,
    faltan: diferencias.filter((d) => d.tipo === "faltante").reduce((a, d) => a + d.cantidad, 0),
    sobran: diferencias.filter((d) => d.tipo === "sobrante").reduce((a, d) => a + d.cantidad, 0),
  };
  const acciones = despuesDeRecibirEnvio({ lotes, buenas, unidades: resumen.buenas + resumen.danadas, unidadesBuenas: resumen.buenas, veExistencias });
  const cuando = detalle.cerradoEn ? diaYHoraLima(detalle.cerradoEn) : null;
  const extras = recibidos.filter((r) => !r.despachoItemId);
  const difsExtras = diferencias.filter((d) => !d.despachoItemId);
  const hayDetalle = detalle.recibidos !== null && detalle.estado === "cerrado";

  return (
    <div className="space-y-6">
      <div data-guia="recepcion.cerrado" className="space-y-4">
        <Aviso tono="exito" titulo={`${tituloRecibido(resumen)} · ${detalleRecibido(resumen)}`}>
          {cuando ? `El ${cuando.dia} a las ${cuando.hora}${detalle.cerradoPor ? `, lo recibió ${detalle.cerradoPor}` : ""}.` : "Lo bueno ya está en el almacén; lo dañado, en la cuarentena de la sede."}
          {resumen.faltan > 0 || resumen.sobran > 0 ? " Lo que faltó o vino de más quedó anotado para Compras." : ""}
        </Aviso>
        {acciones.length > 0 && (
          <div data-guia="recepcion.despues" className="flex flex-wrap gap-2.5">
            {acciones.map((a) => (
              <BotonEnlace key={a.clave} href={a.href} peso={a.principal ? "primario" : "fantasma"}>
                {a.texto}
              </BotonEnlace>
            ))}
          </div>
        )}
      </div>

      {hayDetalle && (
        <section className="space-y-3" aria-label="Cómo se cerró">
          <h2 className="font-display text-xl text-tinta">Cómo se cerró</h2>
          {detalle.lineas.map((l) => {
            const suyos = recibidos.filter((r) => r.despachoItemId === l.id);
            const llegaron = suyos.reduce((a, r) => a + r.cantidad, 0);
            return (
              <article key={l.id} className="card-cayla space-y-2 p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-[15px] font-semibold text-tinta">{nombreDeLinea(l)}</h3>
                  <p className="text-[13px] tabular-nums text-taupe">
                    Venían {l.enviado.toLocaleString("es-PE")} · llegaron {llegaron.toLocaleString("es-PE")}
                    {l.orden.numero ? ` · ${l.orden.numero}` : ""}
                  </p>
                </div>
                {suyos.length > 0 ? <ul className="divide-y divide-sand">{suyos.map((r, i) => <Recibido key={i} r={r} />)}</ul> : <p className="text-sm text-taupe">No llegó ninguna.</p>}
                <Diferencias difs={diferencias.filter((d) => d.despachoItemId === l.id)} />
              </article>
            );
          })}
          {(extras.length > 0 || difsExtras.length > 0) && (
            <article className="card-cayla space-y-2 p-4 sm:p-5">
              <h3 className="text-[15px] font-semibold text-tinta">Lo que no estaba en la guía</h3>
              <ul className="divide-y divide-sand">
                {extras.map((r, i) => (
                  <Recibido key={i} r={r} />
                ))}
              </ul>
              <Diferencias difs={difsExtras} />
            </article>
          )}
          {detalle.notaRecepcion && <p className="nota-cayla">Nota de quien recibió: {detalle.notaRecepcion}</p>}
        </section>
      )}
    </div>
  );
}
