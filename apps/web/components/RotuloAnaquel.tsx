import { esTallaUnica } from "@/lib/etiqueta-precio-reglas";
import { nombreSinCategoria, tamanoNombre, textoColores, type Rotulo } from "@/lib/rotulos-reglas";

/**
 * El rótulo de anaquel impreso (ADR-0365): 100 × 62 mm, se lee de lejos. Arriba la categoría («CHALECOS»), al medio el
 * nombre del modelo o de los modelos juntos en el tamaño más grande que entra, debajo sus colores y tallas, y al pie los
 * códigos y la marca de la casa. Las medidas viven en `app/estilos/rotulo.css` y son milímetros: esto es papel.
 *
 * Sin QR a propósito: el escáner de la caja y Buscar leen el código de una TALLA, no el de un modelo; un QR que no lleva a
 * nada enseña a escanear algo que no sirve.
 */
export function RotuloAnaquel({ rotulo: r }: { rotulo: Rotulo }) {
  const nombres = r.modelos.map((m) => nombreSinCategoria(m, r.titulo));
  const unica = r.tallas.length === 1 && esTallaUnica(r.tallas[0]);
  return (
    <article data-papel className="rotulo-anaquel" aria-label={`Rótulo de ${r.modelos.join(", ")}`}>
      <header className="rot-cab">
        {/* El colibrí en vector, el mismo trazo de la etiqueta de precio: en PNG la térmica lo serrucha. */}
        <svg viewBox="0 0 223 150" aria-hidden fill="none" stroke="#000" strokeWidth={9} strokeLinejoin="round">
          <path d="M3,6 C45,14 95,28 118,50 C134,64 136,96 124,112 C110,130 80,138 47,146 L68,102" />
          <path d="M3,6 C10,40 40,70 70,80 C85,85 100,87 112,87" />
          <path d="M104,40 C102,22 118,6 140,5 C155,4 165,10 172,16 L220,12" />
          <path d="M172,16 C156,22 144,38 134,62" />
        </svg>
        <span className="rot-titulo">{r.titulo ?? "CAYLA"}</span>
      </header>

      <p className={`rot-nombre rot-${tamanoNombre(nombres)}`}>
        {/* El «·» va pegado al final del nombre anterior: si el siguiente baja de línea, el punto no queda colgando al inicio. */}
        {nombres.map((n, i) => (
          <span key={i}>
            {n}
            {i < nombres.length - 1 && <span className="rot-sep"> ·</span>}
          </span>
        ))}
      </p>

      <dl className="rot-datos">
        {r.colores.length > 0 && (
          <div>
            <dt>{r.colores.length === 1 ? "Color" : "Colores"}</dt>
            <dd>{textoColores(r.colores)}</dd>
          </div>
        )}
        {r.tallas.length > 0 && (
          <div>
            <dt>{unica || r.tallas.length === 1 ? "Talla" : "Tallas"}</dt>
            <dd className="rot-tallas">{unica ? <span>Única</span> : r.tallas.map((t) => <span key={t}>{t}</span>)}</dd>
          </div>
        )}
      </dl>

      <footer className="rot-pie">
        <span className="rot-cod">{r.codigos.join(" · ")}</span>
        {/* Sin categoría compartida, la cabecera ya dice CAYLA: el pie no lo repite. */}
        {r.titulo && <b>CAYLA</b>}
      </footer>
    </article>
  );
}
