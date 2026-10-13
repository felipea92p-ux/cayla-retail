import { BotonEnlace } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { ESTADO_ENVIO } from "@/lib/ordenes-compra-reglas";
import { detalleDeEnvioPorAbrir, detalleDeOrdenDirecta, TEXTO_LA_RECIBE_OTRA, type EnvioPorAbrir, type OrdenDirecta } from "@/lib/recepcion-envio-reglas";
import { detalleDeEnvioSinAviso, esEnvioSinAviso } from "@/lib/recepcion-conteo-reglas";
import { RecibirSinGuia } from "./RecibirSinGuia";

// La tarjeta de la puerta de Recibir (ADR-0362, fase 4): arriba de «Llegó mercadería», lo que viene de una orden de compra para ESTA sede.
// Cada envío en camino (o ya abierto por alguien) con «Recibir», y cada orden «directo» que llegó sin guía con «Recibir sin guía» (decisión
// 48). Quien hizo la orden no la recibe (decisión 17): en vez del botón, lo dice. Solo sale si hay algo; si la lectura falló, no sale y la
// puerta recibe igual (lo decide la página).

export function EnviosParaRecibir({
  envios,
  ordenes,
  sede,
  porCategoria = false,
}: {
  envios: EnvioPorAbrir[];
  ordenes: OrdenDirecta[];
  sede: string;
  /** ADR-0393: con la base al día, el envío se cuenta por categoría (la fase 4 lo contaba talla por talla). */
  porCategoria?: boolean;
}) {
  if (envios.length === 0 && ordenes.length === 0) return null;
  return (
    <section data-guia="recibir.envios-oc" className="card-cayla space-y-1 p-4 sm:p-5" aria-labelledby="recibir-envios-oc">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="recibir-envios-oc" className="font-display text-xl text-tinta">
          {porCategoria ? "Envíos por recibir en esta sede" : "Envíos de órdenes de compra para esta sede"}
        </h2>
        <p className="text-[13px] text-taupe">{porCategoria ? `Se cuentan por categoría y entran al almacén de ${sede}.` : `Se cuentan talla por talla y entran al almacén de ${sede}.`}</p>
      </div>
      <ul className="divide-y divide-sand">
        {envios.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-tinta">
                <span className="font-semibold tabular-nums">{e.numero}</span>
                <Chip tono={ESTADO_ENVIO[e.estado].tono}>{ESTADO_ENVIO[e.estado].texto}</Chip>
              </p>
              <p className="mt-0.5 text-xs text-taupe">{porCategoria && esEnvioSinAviso(e) ? detalleDeEnvioSinAviso(e) : detalleDeEnvioPorAbrir(e)}</p>
            </div>
            {e.creadoPorMi ? (
              <p className="text-[13px] text-taupe">{TEXTO_LA_RECIBE_OTRA}</p>
            ) : (
              <BotonEnlace href={`/recibir/envio/${e.id}`} peso={e.estado === "abierto" ? "fantasma" : "primario"}>
                {e.estado === "abierto" ? "Seguir recibiendo" : "Recibir"}
              </BotonEnlace>
            )}
          </li>
        ))}
        {ordenes.map((o) => (
          <li key={o.ordenId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-tinta">
                <span className="font-semibold tabular-nums">{o.numero}</span>
                <Chip tono="neutro">Sin guía</Chip>
              </p>
              <p className="mt-0.5 text-xs text-taupe">{detalleDeOrdenDirecta(o)}</p>
            </div>
            {o.creadaPorMi ? <p className="text-[13px] text-taupe">{TEXTO_LA_RECIBE_OTRA}</p> : <RecibirSinGuia orden={o} sede={sede} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
