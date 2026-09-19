import { soles } from "@/lib/compras-reglas";
import { acumuladoPorHora, alturaEnLienzo, barrasDeTicket, HORA_FIN, HORA_INICIO, posicionEnEje, trazoDeSerie, type VentaEnHora } from "@/lib/facturacion-resumen-graficos";

// Las cuatro visualizaciones de las tarjetas del Resumen (spec §7). Son de servidor y solo
// dibujan lo que sale de `lib/facturacion-resumen-graficos.ts`; llevan `aria-hidden` porque el dato ya está
// dicho con palabras en la tarjeta (cifra y contexto), y el `title` explica qué se está viendo.
// Su movimiento (el trazo que se dibuja, las barras que crecen) vive en `globals.css` y solo
// ocurre en el primer pintado: sus nodos conservan la identidad al refrescar.

/** El acumulado del día hora por hora: la línea sólida es hoy y la punteada, el mismo día de la
 *  semana pasada hasta la misma hora. Las dos comparten escala. */
export function SparklineAcumulado({ hoy, semanaPasada, horaAhora }: { hoy: VentaEnHora[]; semanaPasada: VentaEnHora[] | null; horaAhora: number }) {
  const puntosHoy = acumuladoPorHora(hoy, horaAhora);
  const puntosAntes = semanaPasada ? acumuladoPorHora(semanaPasada, horaAhora) : null;
  const maximo = Math.max(0, ...puntosHoy.map((p) => p.acumulado), ...(puntosAntes ?? []).map((p) => p.acumulado));
  const fin = puntosHoy[puntosHoy.length - 1];

  return (
    <div className="kpi-viz" title={puntosAntes ? "Acumulado por hora. Punteada: el mismo día de la semana pasada." : "Acumulado por hora."} aria-hidden>
      <svg className="kpi-spark" viewBox="0 0 200 36" preserveAspectRatio="none">
        {puntosAntes && <path className="kpi-spark__antes" pathLength={1} d={trazoDeSerie(puntosAntes, maximo)} />}
        <path className="kpi-spark__hoy" pathLength={1} d={trazoDeSerie(puntosHoy, maximo)} />
      </svg>
      <i className="kpi-spark__fin" style={{ left: `calc(${fin.x * 100}% - 3.5px)`, top: `${alturaEnLienzo(fin.acumulado, maximo) - 3.5}px` }} />
    </div>
  );
}

/** Cuándo se hizo cada venta, de 10 h a 18 h: un punto por venta sobre una línea. */
export function EjeDeVentas({ horas }: { horas: number[] }) {
  return (
    <div className="kpi-viz kpi-eje" title={`Cuándo se hizo cada venta, de ${HORA_INICIO} h a ${HORA_FIN} h`} aria-hidden>
      {horas.map((hora, i) => (
        <i key={i} style={{ left: `${posicionEnEje(hora)}%` }} />
      ))}
      <em style={{ left: 0 }}>{HORA_INICIO} h</em>
      <em style={{ right: 0 }}>{HORA_FIN} h</em>
    </div>
  );
}

/** La barra de «Por enviar»: cuántos de los comprobantes de hoy ya salieron hacia SUNAT. Sin
 *  comprobantes hoy no hay barra que llenar: se dice con palabras. */
export function BarraDeEnvio({ enviados, total }: { enviados: number; total: number }) {
  if (total === 0) return <p className="kpi-progreso__texto mt-3">Sin comprobantes hoy todavía.</p>;
  return (
    <>
      <div className="kpi-progreso" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={enviados} aria-label="Comprobantes de hoy enviados a SUNAT">
        <b style={{ width: `${(enviados / total) * 100}%` }} />
      </div>
      <p className="kpi-progreso__texto">
        hoy: {enviados} de {total} enviados
      </p>
    </>
  );
}

/** Una barra por venta (las últimas si son muchas) y una línea punteada en el promedio. */
export function BarrasDeTicket({ totales }: { totales: number[] }) {
  const { alturas, promedio } = barrasDeTicket(totales);
  const visibles = totales.slice(-alturas.length);
  return (
    <div className="kpi-viz kpi-barras" title={`Cada barra es una venta: ${visibles.map((t) => soles(t)).join(", ")}`} aria-hidden>
      {alturas.map((altura, i) => (
        <i key={i} style={{ height: `${altura}%` }} />
      ))}
      {alturas.length > 0 && <u style={{ bottom: `${promedio}%` }} />}
    </div>
  );
}
