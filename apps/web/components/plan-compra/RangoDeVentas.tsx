import { ayudaDelRango, multiplicadorLegible, posicionEnLaEscala, textoDeAnios, veredictoDe, type EvidenciaDeCampana } from "@/lib/plan-compra-calendario-evidencia";

// La barra de rango de «cuánto sube la venta» del Calendario del Plan (ADR-0525, spike ①): dónde cae un día de la campaña contra un día normal (la marca de ×1), con el menor
// y el mayor de los años medidos (la banda) y la mediana (la marca gruesa). El tono lo dice el veredicto (verde sube, ámbar no sube, taupe no se nota o sin historia): el color
// nunca es lo único, la etiqueta de la derecha y el chip de su fila dicen lo mismo. La cuenta es de `lib/plan-compra-calendario-evidencia.ts`; esto solo la dibuja.

export function RangoDeVentas({ evidencia }: { evidencia: EvidenciaDeCampana | null }) {
  if (!evidencia) {
    return (
      <div className="cal-rng" data-tono="neutro">
        <span className="cal-rng-lbl">sin historia propia</span>
      </div>
    );
  }
  const v = veredictoDe(evidencia);
  const desde = posicionEnLaEscala(evidencia.min);
  const hasta = posicionEnLaEscala(evidencia.max);
  return (
    <div className="cal-rng" data-tono={v.tono} title={ayudaDelRango(evidencia)} role="img" aria-label={`${v.texto}: ${ayudaDelRango(evidencia)}`}>
      <div className="cal-rng-pista" />
      <div className="cal-rng-uno" style={{ left: `${posicionEnLaEscala(1)}%` }} />
      <div className="cal-rng-rango" style={{ left: `${desde}%`, width: `${Math.max(2, hasta - desde)}%` }} />
      <div className="cal-rng-med" style={{ left: `${posicionEnLaEscala(evidencia.mediana)}%` }} />
      <span className="cal-rng-lbl">
        <b>{multiplicadorLegible(evidencia.mediana)}</b> · {textoDeAnios(evidencia.porAnio.length)}
      </span>
    </div>
  );
}
