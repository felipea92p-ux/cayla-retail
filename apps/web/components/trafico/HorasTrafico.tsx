import type { CSSProperties } from "react";
import { BarrasTiempo } from "@/components/ui/BarrasTiempo";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { horaRedonda, personas, picoDeHoras, tramoTexto, type ResumenTrafico } from "@/lib/trafico-reglas";

/** Bajo estas horas va su nombre; las demás, solo la barra (24 nombres no caben ni se leen). */
const CON_NOMBRE = new Set([0, 6, 12, 18]);

/**
 * «A qué hora entran» (ADR-0495, actividad 6; maqueta C): cuántas personas entraron en cada hora del día (Lima), con las 3 horas
 * seguidas de más gente en tinta. Con menos de 10 personas no se dice cuál es la hora punta: se ven las barras, sin veredicto.
 */
export function HorasTrafico({ r }: { r: ResumenTrafico }) {
  const pico = picoDeHoras(r.horas);
  const enPico = (h: number) => !!pico && h >= pico.desde && h < pico.hasta;
  return (
    <section className="anim-sube card-cayla px-5 py-4" style={{ "--i": 5 } as CSSProperties} aria-labelledby="trafico-horas" data-guia="trafico.horas">
      <TituloSeccion id="trafico-horas">A qué hora entran</TituloSeccion>
      <p className="mt-1 text-[13.5px] text-tinta/70">
        {pico ? (
          <>
            Más gente <b className="font-semibold text-tinta">{tramoTexto(pico.desde, pico.hasta)}</b>: {pico.de100} de cada 100.
          </>
        ) : (
          "Todavía es muy poca gente para saber a qué hora entran más."
        )}
      </p>
      <BarrasTiempo
        className="mt-3"
        alto={72}
        cifras="ninguna"
        etiqueta={pico ? `Personas por hora; la mayoría entra ${tramoTexto(pico.desde, pico.hasta)}` : "Personas por hora del día"}
        barras={r.horas.map((n, h) => ({
          clave: String(h),
          valor: n,
          etiqueta: CON_NOMBRE.has(h) ? horaRedonda(h) : "",
          tip: `${horaRedonda(h)}: ${personas(n)}`,
          tono: enPico(h) ? "tinta" : undefined,
        }))}
      />
    </section>
  );
}
