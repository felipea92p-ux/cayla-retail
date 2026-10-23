import type { CSSProperties } from "react";
import { Chip } from "@/components/ui/Chip";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import { soles } from "@/lib/flujo-caja-reglas";
import { montoBandeja, type Bandeja, type CosaPorRevisar, type Gastaste } from "@/lib/gastos-pulso-reglas";

// Gastos en camino A (Felipe 2026-10-15): «¿En qué se fue la plata?» con su frase en tienda y lo que más pesó, y la
// bandeja: lo que falta revisar, de a UNA cosa, con el botón que la resuelve (clasificar la salida de caja o registrar el fijo).
// Los modales que resuelven ya existen en el panel: aquí solo se eligen. Sin estado propio.

const entra = (clase: string, i: number) => ({ className: `${clase} anim-entra`, style: { ["--i" as string]: i } as CSSProperties });

export function GastosPulso({
  gastaste,
  bandeja,
  nombreCorto,
  onResolver,
  onVerTodas,
}: {
  gastaste: Gastaste | null;
  bandeja: Bandeja;
  nombreCorto: string;
  onResolver: (cosa: CosaPorRevisar) => void;
  onVerTodas: () => void;
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
            {/* El total del mes ya lo dice la cabecera del telar (`RespuestaTelar`): aquí, solo en qué se fue. */}
            <p {...entra("fin-pulso-explica", 2)}>
              {gastaste.frase} {gastaste.n > 0 ? `${gastaste.n} ${gastaste.n === 1 ? "gasto" : "gastos"} de ${nombreCorto}, con IGV.` : ""}
            </p>
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
          <CabeceraBloque titulo={bandeja.frase} bajada={bandeja.n > 0 ? `${montoBandeja(bandeja)}. Una por una: el sistema propone y tú solo dices de qué fue.` : "Cada salida de caja ya dice qué fue y los fijos del mes están registrados."}>
            <Chip tono={bandeja.n === 0 ? "verde" : "ambar"} vivo={bandeja.n > 0}>
              {bandeja.n === 0 ? "Al día" : `${bandeja.n} por revisar`}
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
