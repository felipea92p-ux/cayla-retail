import { CUENTA_EN_REDES, nombreDelEnlace, REDES } from "@/lib/redes";
import { TRAZOS_DE_RED } from "@/lib/redes-trazos";
import "@/app/estilos/redes.css";

/**
 * La fila de redes de CAYLA (`lib/redes.ts`): un ícono por red, de 44 px con el dedo y 36 px con el mouse (así las seis caben en una fila
 * del pie desde una laptop chica). Quietos van en la tinta de la tienda; al pasar el puntero solo el ícono toma el color de su red y
 * crece un poco, sin que cambie la casilla (Felipe 2026-11-13). Se abren en otra pestaña.
 *
 * `donde` da nombre al degradado de Instagram: la página puede tener dos filas a la vez (el pie y el menú del celular) y un `id` repetido
 * haría que una pinte con el degradado de la otra. `conCuenta` suma «Estamos como @caylaperu» debajo.
 */
export function Redes({ donde, conCuenta = false }: { donde: "pie" | "menu"; conCuenta?: boolean }) {
  const degradado = `redes-degradado-${donde}`;
  return (
    <div className="redes">
      <ul className="redes-fila">
        {REDES.map((r) => (
          <li key={r.id}>
            <a className={`red red-${r.id}`} href={r.url} target="_blank" rel="noopener noreferrer" aria-label={nombreDelEnlace(r)} title={r.nombre}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                {r.id === "instagram" && (
                  <defs>
                    <linearGradient id={degradado} x1="0" y1="1" x2="1" y2="0">
                      <stop offset="0" stopColor="#feda75" />
                      <stop offset=".3" stopColor="#fa7e1e" />
                      <stop offset=".55" stopColor="#d62976" />
                      <stop offset=".8" stopColor="#962fbf" />
                      <stop offset="1" stopColor="#4f5bd5" />
                    </linearGradient>
                  </defs>
                )}
                <path d={TRAZOS_DE_RED[r.id]} />
                {/* El degradado de Instagram va encima, transparente; aparece al pasar el puntero (un `fill` no se puede animar entre un color y un degradado). */}
                {r.id === "instagram" && <path className="red-degradado" d={TRAZOS_DE_RED[r.id]} fill={`url(#${degradado})`} />}
              </svg>
            </a>
          </li>
        ))}
      </ul>
      {conCuenta && (
        <p className="redes-cuenta">
          Estamos como <b>{CUENTA_EN_REDES}</b>
        </p>
      )}
    </div>
  );
}
