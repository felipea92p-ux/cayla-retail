import { esTallaUnica } from "@/lib/etiqueta-precio-reglas";
import { INTERLINEA_NOMBRE, medidaNombre, textoColores, type Rotulo } from "@/lib/rotulos-reglas";

/**
 * El rótulo de anaquel impreso (ADR-0366): 62 × 40,1 mm acostado —el mismo papel que la etiqueta de precio—, para leerlo de
 * lejos. Solo el nombre, lo más grande que entra (`medidaNombre`), sus colores y sus tallas (Felipe, 2026-10-09, tras imprimirlo
 * en la tienda: sin logo, sin categoría ni códigos, para que el nombre gane todo el espacio). Las medidas viven en
 * `app/estilos/rotulo.css` y son milímetros: esto es papel.
 *
 * Sin QR a propósito: el escáner de la caja y Buscar leen el código de una TALLA, no el de un modelo.
 */
export function RotuloAnaquel({ rotulo: r }: { rotulo: Rotulo }) {
  const { mm } = medidaNombre(r.modelos);
  const unica = r.tallas.length === 1 && esTallaUnica(r.tallas[0]);
  return (
    <article data-papel className="rotulo-anaquel" aria-label={`Rótulo de ${r.modelos.join(", ")}`}>
      <p className="rot-nombre" style={{ fontSize: `${mm}mm`, lineHeight: INTERLINEA_NOMBRE }}>
        {/* Un solo texto, para que el navegador corte las líneas como `medidaNombre`. El «·» va pegado al nombre anterior con un
            espacio duro: si el siguiente baja de línea, el punto no queda colgando al inicio. */}
        <span>{r.modelos.map((n, i) => (i < r.modelos.length - 1 ? `${n}\u00a0· ` : n)).join("")}</span>
      </p>
      {r.colores.length > 0 && <p className="rot-colores">{textoColores(r.colores)}</p>}
      {r.tallas.length > 0 && (
        <p className="rot-tallas">{unica ? <span>Talla única</span> : r.tallas.map((t) => <span key={t}>{t}</span>)}</p>
      )}
    </article>
  );
}
