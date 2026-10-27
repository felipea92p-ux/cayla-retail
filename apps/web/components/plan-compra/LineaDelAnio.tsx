import { barrasDeLaLinea, posicionDeHoy, type CampanaDelCalendario } from "@/lib/plan-compra-calendario-vista";

// «La línea del año» del Calendario del Plan (ADR-0525, spike ①): una fila por campaña con su barra sobre los doce meses, para ver de un vistazo qué se junta con qué. La barra dice
// si está en mi plan (tinta), descansa (rayada) o no la compro (punteada); la que más pesa va en rojo y hoy cae con su raya. Tocar una fila abre su hoja. Se desplaza de lado en una
// pantalla angosta (los meses no se aprietan). La cuenta de dónde cae cada barra es de `lib/plan-compra-calendario-vista.ts`; esto solo la dibuja.

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

export function LineaDelAnio({
  campanas,
  anio,
  hoy,
  claveDeLaQueMasPesa,
  alEditar,
}: {
  campanas: readonly CampanaDelCalendario[];
  anio: number;
  hoy: string;
  /** La campaña que va en rojo (la que más pesa); null si ninguna es un pico claro. */
  claveDeLaQueMasPesa: string | null;
  alEditar: (c: CampanaDelCalendario) => void;
}) {
  const barras = barrasDeLaLinea(campanas, anio);
  const deHoy = posicionDeHoy(hoy, anio);
  return (
    <div className="card-cayla" data-guia="calendario.linea">
      <div className="cal-linea">
        <div className="cal-linea-meses" aria-hidden>
          <span />
          {MESES.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
        <div className="cal-linea-cuerpo">
          {barras.map((b) => {
            const c = campanas.find((x) => x.clave === b.clave);
            if (!c) return null;
            return (
              <button key={b.clave} type="button" className="cal-linea-fila" data-uso={b.uso} onClick={() => alEditar(c)} aria-label={`${b.nombre}, ${b.rotulo}. Editar`}>
                <span className="cal-linea-nombre">
                  {b.nombre}
                  {b.uso === "pausada" ? " · pausada" : ""}
                </span>
                <span className="cal-linea-pista">
                  <span className="cal-barra" data-uso={b.uso} data-ancla={b.clave === claveDeLaQueMasPesa && b.uso === "activa" ? "" : undefined} style={{ left: `${b.izquierda}%`, width: `${b.ancho}%` }} title={`${b.nombre}: ${b.rotulo}`} />
                </span>
              </button>
            );
          })}
          {deHoy !== null && (
            <div className="cal-hoy-zona" aria-hidden>
              <div className="cal-hoy" style={{ left: `${deHoy}%` }} />
            </div>
          )}
        </div>
      </div>
      <div className="cal-leyenda">
        <span>
          <i data-uso="ancla" />
          La que más pesa
        </span>
        <span>
          <i data-uso="activa" />
          En mi plan
        </span>
        <span>
          <i data-uso="pausada" />
          Pausada
        </span>
        <span>
          <i data-uso="no" />
          No la compro
        </span>
        <span>Toca una barra para editarla</span>
      </div>
    </div>
  );
}
