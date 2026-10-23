import type { CSSProperties } from "react";
import { Chip } from "@/components/ui/Chip";
import { CifraAnimada } from "@/components/ui/CifraAnimada";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import { soles } from "@/lib/flujo-caja-reglas";
import { montoBandeja, textoFijosPorConfirmar, type Bandeja, type CosaPorRevisar, type FijosPorConfirmar, type Gastaste } from "@/lib/gastos-pulso-reglas";

// Gastos en camino A (Felipe 2026-10-15): «¿En qué se fue la plata?» con lo gastado en el mes y su frase en tienda, y la
// bandeja: lo que falta revisar, de a UNA cosa, con el botón que la resuelve (clasificar la salida de caja o registrar el fijo).
// Los modales que resuelven ya existen en el panel: aquí solo se eligen. Sin estado propio.

const entra = (clase: string, i: number) => ({ className: `${clase} anim-entra`, style: { ["--i" as string]: i } as CSSProperties });

export function GastosPulso({
  gastaste,
  bandeja,
  alcance,
  porConfirmar,
  onResolver,
  onVerTodas,
  onVerFijos,
}: {
  gastaste: Gastaste | null;
  bandeja: Bandeja;
  /** Lo que se mira, en una frase para pegar al conteo: «sin tienda», «de Tienda AQP», «de todas las tiendas» (`alcanceDeLaVista`). */
  alcance: string;
  /** Los fijos del mes que el titular todavía no cuenta (tarea #2 de /pantalla, 2026-10-22); `null` si no queda ninguno. */
  porConfirmar: FijosPorConfirmar | null;
  onResolver: (cosa: CosaPorRevisar) => void;
  onVerTodas: () => void;
  onVerFijos: () => void;
}) {
  const primera = bandeja.cosas[0];
  return (
    <>
      <section className="fin-pulso-hero" aria-labelledby="fin-gastos-pregunta" data-guia="fin-gastos.pulso">
        <p id="fin-gastos-pregunta" {...entra("fin-pulso-pregunta", 1)}>
          ¿En qué se fue la plata?
        </p>
        {gastaste ? (
          <>
            <p {...entra("fin-pulso-respuesta", 2)}>
              <span className="fin-pulso-verbo">{gastaste.verbo}</span>
              <span className="fin-pulso-monto">
                <CifraAnimada valor={Math.round(gastaste.total)} formato="soles" />
              </span>
            </p>
            <p {...entra("fin-pulso-explica", 3)}>
              {gastaste.frase} {gastaste.n > 0 ? `${gastaste.n} ${gastaste.n === 1 ? "gasto" : "gastos"} ${alcance}, con IGV.` : ""}
            </p>
            {porConfirmar && (
              <p {...entra("fin-pulso-explica", 3)} data-guia="fin-gastos.por-confirmar">
                {textoFijosPorConfirmar(porConfirmar)}{" "}
                <button type="button" className="btn-cayla btn-enlace" onClick={onVerFijos}>
                  Ver los fijos
                </button>
              </p>
            )}
            {gastaste.mayores.length > 1 && (
              <ul {...entra("fin-dinero-partes", 4)} aria-label="Lo que más pesó">
                {gastaste.mayores.map((m) => (
                  <li key={m.nombre}>
                    <span>{m.nombre}</span>
                    <b className="num">{soles(m.monto)}</b>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p {...entra("fin-pulso-explica", 2)}>No se pudo leer lo gastado en el mes.</p>
        )}
      </section>

      <div {...entra("", 5)}>
        <Superficie pad guia="fin-gastos.bandeja">
          <CabeceraBloque titulo={bandeja.frase} bajada={bandeja.n > 0 ? `${montoBandeja(bandeja)}. Una por una: el sistema propone y tú solo dices de qué fue.` : bandeja.bajadaVacia}>
            <Chip tono={bandeja.n === 0 ? "verde" : "ambar"} vivo={bandeja.n > 0}>
              {bandeja.chip}
            </Chip>
          </CabeceraBloque>
          {primera && (
            <div className="fin-gastos-cosa" data-tipo={primera.tipo}>
              <div className="min-w-0">
                <span className="versalita">{primera.tipo === "egreso" ? "Salida de caja sin clasificar" : "Gasto fijo del mes sin registrar"}</span>
                <b>{primera.titulo}</b>
                <p>{primera.detalle}</p>
              </div>
              <div className="fin-gastos-cosa-der">
                <span className="fin-gastos-cosa-monto num">{soles(primera.monto)}</span>
                <button type="button" className="btn-cayla btn-primario" onClick={() => onResolver(primera)} aria-haspopup="dialog" data-guia="fin-gastos.resolver">
                  {primera.accion}
                </button>
              </div>
            </div>
          )}
          {bandeja.n > 1 && (
            <p className="fin-gastos-cosa-mas">
              Y {bandeja.n - 1} {bandeja.n - 1 === 1 ? "cosa más" : "cosas más"}.{" "}
              <button type="button" className="btn-cayla btn-enlace" onClick={onVerTodas}>
                Ver todas
              </button>
            </p>
          )}
        </Superficie>
      </div>
    </>
  );
}
