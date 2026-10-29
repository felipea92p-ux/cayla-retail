import type { CSSProperties } from "react";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { DIAS_CORTOS, celdasDelCalendario, diasFuertesDelMes, diasTexto, mesTexto, miles, personas, tinteDeRegion, type CalendarioTrafico as Calendario } from "@/lib/trafico-reglas";

/** Desde este tinte el rojo ya es oscuro: el número va en crema fija (es dato, no cambia con el tema). */
const TINTE_OSCURO = 48;

/**
 * «Octubre, día por día» (actividad 9; maqueta `docs/maquetas/trafico-decisiones-2026-10/`): el mes del último día del período, cada día
 * más rojo mientras más gente entró (el mismo rojo del mapa de calor). Los días del período elegido van plenos y los demás, tenues; hoy
 * lleva su filo; los que todavía no llegan, solo su número. Arriba, los dos días de la semana con más gente.
 */
export function CalendarioTrafico({ calendario, periodo, hoy }: { calendario: Calendario; periodo: { desde: string; hasta: string }; hoy: string }) {
  const c = celdasDelCalendario(calendario, periodo, hoy);
  const max = Math.max(0, ...c.dias.map((d) => d.n ?? 0));
  const fuertes = diasFuertesDelMes(c.dias);
  const mes = mesTexto(calendario.mes);
  return (
    <section className="anim-sube min-w-0" style={{ "--i": 12 } as CSSProperties} aria-labelledby="trafico-calendario" data-guia="trafico.calendario">
      <TituloSeccion id="trafico-calendario" dato="Más rojo, más gente">
        {mes}, día por día
      </TituloSeccion>
      <div className="card-cayla mt-2 px-5 py-4">
        <p className="text-[14px] text-tinta/70">
          {fuertes ? (
            <>
              Entra más gente los <b className="font-semibold text-tinta">{diasTexto(fuertes)}</b>.
            </>
          ) : (
            "Todavía es muy poca gente para saber qué días entra más."
          )}
        </p>
        <div className="trafico-cal mt-3" role="img" aria-label={`${mes}: personas que entraron cada día.${fuertes ? ` Entra más gente los ${diasTexto(fuertes)}.` : ""}`}>
          {DIAS_CORTOS.map((d) => (
            <span key={d} className="trafico-cal-dia-semana">
              {d}
            </span>
          ))}
          {Array.from({ length: c.antes }, (_, i) => (
            <span key={`v${i}`} />
          ))}
          {c.dias.map((d) => {
            if (d.n === null)
              return (
                <span key={d.dia} className="trafico-cal-dia" data-futuro>
                  <span>{d.dia}</span>
                </span>
              );
            const tinte = tinteDeRegion(d.n, max);
            return (
              <span
                key={d.dia}
                className="trafico-cal-dia"
                data-fuera={!d.enPeriodo || undefined}
                data-hoy={d.hoy || undefined}
                data-oscuro={tinte > TINTE_OSCURO || undefined}
                title={`${d.dia} de ${mes.toLowerCase()}: ${personas(d.n)}`}
                style={{ background: `color-mix(in srgb, var(--color-rojo) ${tinte}%, var(--color-hueso))` }}
              >
                <span>{d.dia}</span>
                <b>{miles(d.n)}</b>
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}
