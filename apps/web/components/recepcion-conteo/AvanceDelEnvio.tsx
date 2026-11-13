import { BarraAvance } from "@/components/ui/BarraAvance";
import { colorDeAvance } from "@/lib/avance-color";
import { etiquetaDelAvance, fraseDelAvance, type CifrasDelResumen } from "@/lib/recepcion-modelos-reglas";
import { Odometro } from "./Odometro";

// Cómo va TODO el envío, en una línea arriba de la lista (ADR-0645, Felipe 2026-11-11): la barra, cuántas van de las que dijeron y qué falta. Reemplaza a la
// columna «Resumen del envío», que casi nadie leía: las colaboradoras se guiaban por las barras de las categorías. Dice lo de todo el envío, con el filtro que
// sea. Sin aviso no hay con qué comparar: va el número solo, sin barra.

export function AvanceDelEnvio({ cifras, sinAviso, onIrAlQueFalta }: { cifras: CifrasDelResumen; sinAviso: boolean; /** «Faltan N por contar» se toca: lleva al primero que falta (cambio 3 de /formidable: es la única frase que dice cuántos faltan). */ onIrAlQueFalta?: () => void }) {
  const frase = fraseDelAvance(cifras);
  if (!frase) return null;
  const { contadas, avance } = cifras;
  const dijeron = sinAviso ? null : cifras.dijeron;
  const etiqueta = etiquetaDelAvance(cifras, sinAviso);
  return (
    <div className="rc-avance" data-guia="recepcion.cifra" aria-live="polite">
      {dijeron != null && avance != null && <BarraAvance pct={Math.min(100, avance)} alto="normal" color={colorDeAvance(avance)} decorativa />}
      <p>
        <b>
          {etiqueta.antes && <span>{etiqueta.antes}</span>}
          <Odometro valor={contadas} />
          {etiqueta.despues}
        </b>
        {onIrAlQueFalta && cifras.estados["por-contar"] > 0 ? (
          <button type="button" className="btn-cayla btn-enlace" title="Ir al primero que falta contar" onClick={onIrAlQueFalta}>
            {frase.texto}
          </button>
        ) : (
          <span data-tono={frase.tono ?? undefined}>{frase.texto}</span>
        )}
      </p>
    </div>
  );
}
