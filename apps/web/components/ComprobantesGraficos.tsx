import { BarraApilada } from "@/components/ui/BarraApilada";
import type { Tramo } from "@/lib/comprobantes-graficos-reglas";
import { soles } from "@/lib/compras-reglas";

// Los gráficos de las tarjetas de Comprobantes y Proformas (spike 2026-09-26). De servidor y `aria-hidden`: la
// cifra y su texto ya dicen el dato con palabras. Colores: solo las clases `g-*` de globals.css, que son tokens
// CAYLA (tinta, taupe, grafico-neutro, grafico-alza, grafico-baja). Nunca el rojo.

export type Parte = { valor: number; clase: "g-tinta" | "g-taupe" | "g-neutro" | "g-alza" | "g-baja"; texto: string; mostrar?: string };

/** Una barra partida en tramos proporcionales, con su leyenda debajo. La barra es `<BarraApilada>`, la del sistema (ADR-0358); esta pieza
 *  le pone la leyenda de las tarjetas de Facturación y dice todo en texto, así que el lector no oye ninguna de las dos. */
export function BarraConLeyenda({ partes }: { partes: Parte[] }) {
  return (
    <div aria-hidden>
      <BarraApilada decorativa alto={8} className="mt-3" segmentos={partes.map((p) => ({ clave: p.texto, nombre: p.texto, valor: p.valor, clase: p.clase }))} />
      <div className="kpi-leyenda">
        {partes.map((p) => (
          <span key={p.texto}>
            <i className={p.clase} />
            {p.texto} <b>{p.mostrar ?? p.valor}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Barras por hora o por día: en tinta lo facturado (aceptado por SUNAT real), en neutro el resto (de prueba,
 *  sin enviar o por confirmar). La parte en tinta suma lo mismo que la cifra de la tarjeta. */
export function BarrasPorTramo({ tramos }: { tramos: Tramo[] }) {
  const maximo = Math.max(0, ...tramos.map((t) => Math.max(0, t.facturado) + Math.max(0, t.resto)));
  const alto = (v: number) => (maximo > 0 ? `${(Math.max(0, v) / maximo) * 32}px` : "0px");
  return (
    <div aria-hidden title={tramos.filter((t) => t.facturado + t.resto !== 0).map((t) => `${t.etiqueta}: ${soles(t.facturado + t.resto)}`).join(" · ")}>
      <div className="kpi-tramos">
        {tramos.map((t) => (
          <span key={t.etiqueta}>
            <i className="es-facturado" style={{ height: alto(t.facturado) }} />
            <i className="es-resto" style={{ height: alto(t.resto) }} />
          </span>
        ))}
      </div>
      <div className="kpi-tramos-eje">
        <span>{tramos[0]?.etiqueta}</span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-1"><i className="g-tinta inline-block h-[7px] w-[7px] rounded-[2px]" />facturado</span>
          <span className="inline-flex items-center gap-1"><i className="g-neutro inline-block h-[7px] w-[7px] rounded-[2px]" />prueba o sin enviar</span>
        </span>
        <span>{tramos[tramos.length - 1]?.etiqueta}</span>
      </div>
    </div>
  );
}

/** Un punto por elemento (hasta 24): los primeros `encendidos` en su color, el resto en sand. */
export function Puntos({ encendidos, total, clase }: { encendidos: number; total: number; clase: Parte["clase"] }) {
  const n = Math.min(total, 24);
  return (
    <div className="kpi-puntos" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <i key={i} className={i < encendidos ? clase : undefined} />
      ))}
    </div>
  );
}
