import { Aviso } from "@/components/ui/Aviso";
import { TEXTO_AVISO_BANCARIZACION, type AvisoBancarizacion } from "@/lib/no-deducible-reglas";

// El aviso al pagar «S/ X quedan no deducibles» (ADR-0362, fase 6 · actividad 6; decisión 56: se deja pagar, con aviso). Avisa y no frena.
//
// Aparece y desaparece con el MEDIO que se elige (efectivo, desde un fondo): si cambiara el alto de la hoja con cada ficha, la hoja se
// acortaría bajo el mouse (ADR-0185). Por eso, cuando el comprobante es de S/ 2 000 o más (`reservar`), el lugar se guarda siempre con una
// copia invisible y el aviso se dibuja encima cuando corresponde, como los destinos de cada medio en `LineasPago`. Debajo del umbral no
// ocupa nada: ningún medio lo haría aparecer.

const TITULO_MAS_LARGO = "Hasta S/ 99,999.99 quedan «no deducibles»";

export function AvisoNoDeducible({ aviso, reservar, className = "" }: { aviso: AvisoBancarizacion | null; reservar: boolean; className?: string }) {
  if (!reservar && !aviso) return null;
  return (
    <div className={`grid ${className}`} data-aviso-no-deducible>
      <div aria-hidden inert className="invisible [grid-area:1/1]">
        <Aviso tono="atencion" titulo={TITULO_MAS_LARGO} chico>
          {TEXTO_AVISO_BANCARIZACION}
        </Aviso>
      </div>
      {aviso && (
        <div className="[grid-area:1/1]" role="status">
          <Aviso tono="atencion" titulo={aviso.titulo} chico>
            {aviso.texto}
          </Aviso>
        </div>
      )}
    </div>
  );
}
