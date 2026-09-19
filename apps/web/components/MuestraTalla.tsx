import { MOV, TONOS, type Estilo } from "@/components/MuestraEtiqueta";

/**
 * La imagen de una talla en Atributos → Tallas: el valor mismo ("M", "38",
 * "Única") grande, en la serif de la marca, sobre un panel del tono de su
 * grupo. Es el equivalente de `MuestraEtiqueta` / `MuestraPatron` /
 * `MuestraTejido`, con la misma proporción 3:1 y los mismos "ecos" a los lados,
 * para que al saltar de una pestaña de Atributos a otra nada crezca ni se corra.
 *
 * Una talla no tiene un dibujo que la represente mejor que su propio valor, así
 * que la ilustración ES el valor. Los tonos vienen de `MuestraEtiqueta` (nada de
 * rojo: acento sagrado, máx. 2 usos por pantalla; sin gradientes ni sombras).
 *
 * `group/etq` lo pone la tarjeta que la contiene, igual que en Etiquetas: al
 * pasar el mouse el valor se asienta y los ecos se abren. Responde a una acción
 * de la persona, nunca corre solo.
 */

const ANCHO = 180;
const ALTO = 60;

// El valor más largo real es "Estándar" (8 letras): el cuerpo se achica con el
// largo para que ninguna talla se salga del panel ni se corte.
function cuerpo(valor: string): number {
  const n = valor.length;
  return n <= 2 ? 34 : n <= 4 ? 28 : 22;
}

export function MuestraTalla({
  valor,
  estilo,
  className = "aspect-[3/1] w-full",
}: {
  valor: string;
  estilo: Estilo;
  className?: string;
}) {
  const { fondo, acento } = TONOS[estilo];
  const grande = cuerpo(valor);
  const eco = grande * 0.62;
  // Un valor largo ("Estándar") ocupa casi todo el panel: sus ecos se montarían
  // sobre la palabra principal y la ensuciarían, así que va solo.
  const conEcos = valor.length <= 4;
  const texto = (tam: number) => (
    <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fontSize={tam} fill={acento} className="font-display">
      {valor}
    </text>
  );

  return (
    <div className={`${className} overflow-hidden rounded-lg`} style={{ backgroundColor: fondo }} role="img" aria-label={`Talla ${valor}`}>
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden>
        {conEcos && (
          <>
            <g transform="translate(34 38) rotate(-14)" opacity={0.18}>
              <g className={`${MOV} group-hover/etq:-translate-x-1.5`}>{texto(eco)}</g>
            </g>
            <g transform="translate(146 22) rotate(12)" opacity={0.18}>
              <g className={`${MOV} group-hover/etq:translate-x-1.5`}>{texto(eco)}</g>
            </g>
          </>
        )}
        <g transform="translate(90 31)">
          <g className={`${MOV} group-hover/etq:-translate-y-0.5 group-hover/etq:scale-[1.06]`}>{texto(grande)}</g>
        </g>
      </svg>
    </div>
  );
}
