import type { Resumen } from "@/lib/perfil";
import { Icono, type NombreIcono } from "../Icono";

/**
 * Los cuatro cuadros de arriba de «Mi perfil»: tus pedidos, tu Club, tus favoritos y tus avisos, cada uno con cómo está en una línea
 * (`lib/perfil.ts`: verde si hay algo listo para ti, ámbar si algo está pendiente). Cada cuadro lleva a su sección más abajo (la flecha
 * hacia abajo lo dice): en el celular, sin bajar a buscarla. Dos por fila en el celular; los cuatro en fila desde la tablet.
 */
export function AtajosDelPerfil({ atajos }: { atajos: { ancla: string; icono: NombreIcono; nombre: string; resumen: Resumen }[] }) {
  return (
    <nav className="pf-atajos" aria-label="Tu perfil de un vistazo">
      <ul>
        {atajos.map((a) => (
          <li key={a.ancla}>
            <a className="pf-atajo" href={`#${a.ancla}`}>
              <span className="pf-atajo-ic">
                <Icono nombre={a.icono} />
              </span>
              <span className="pf-atajo-txt">
                <b>{a.nombre}</b>
                <small data-tono={a.resumen.tono === "neutro" ? undefined : a.resumen.tono}>{a.resumen.texto}</small>
              </span>
              <span className="pf-atajo-ir">
                <Icono nombre="chevron" />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
