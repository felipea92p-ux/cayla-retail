import { BarraAvance } from "@/components/ui/BarraAvance";
import { colorDeAvance } from "@/lib/avance-color";
import { conMiles, fraseDelAvance, type CifrasDelResumen } from "@/lib/recepcion-modelos-reglas";
import { Odometro } from "./Odometro";

// Cómo va TODO el envío, en una línea arriba de la lista (ADR-0645, Felipe 2026-11-11): la barra, cuántas van de las que dijeron y qué falta. Reemplaza a la
// columna «Resumen del envío», que casi nadie leía: las colaboradoras se guiaban por las barras de las categorías. Dice lo de todo el envío, con el filtro que
// sea. Sin aviso no hay con qué comparar: va el número solo, sin barra.

export function AvanceDelEnvio({ cifras, sinAviso }: { cifras: CifrasDelResumen; sinAviso: boolean }) {
  const frase = fraseDelAvance(cifras);
  if (!frase) return null;
  const { contadas, avance } = cifras;
  const dijeron = sinAviso ? null : cifras.dijeron;
  return (
    <div className="rc-avance" data-guia="recepcion.cifra" aria-live="polite">
      {dijeron != null && avance != null && <BarraAvance pct={Math.min(100, avance)} alto="normal" color={colorDeAvance(avance)} decorativa />}
      <p>
        <b>
          <Odometro valor={contadas} />
          {dijeron != null ? `de ${conMiles(dijeron)} prendas contadas` : contadas === 1 ? "prenda contada" : "prendas contadas"}
        </b>
        <span data-tono={frase.tono ?? undefined}>{frase.texto}</span>
      </p>
    </div>
  );
}
