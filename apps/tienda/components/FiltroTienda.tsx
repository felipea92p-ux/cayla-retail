import Link from "next/link";
import { Icono } from "./Icono";
import { PendienteDelEnlace } from "./PendienteDelEnlace";
import { RecordarTiendas } from "./TiendasRecordadas";

export type OpcionTienda = { nombre: string; href: string; actual: boolean };

/**
 * «Ver lo que hay en: Todas · Arequipa · Lima · Trujillo» (maqueta v4, `filtroTienda`): la franja bajo la cabecera para elegir la tienda.
 * Elegirla cambia el precio que se ve (el de esa tienda; con «Todas», el mayor entre las tiendas de la web) y deja solo lo que hay en
 * ella (actividad 4). Son enlaces: la tienda elegida va en la dirección y se puede compartir. Mientras llega lo de la tienda tocada, su
 * píldora ya se ve elegida y la lista se apaga un poco (`PendienteDelEnlace`).
 */
export function FiltroTienda({ opciones }: { opciones: OpcionTienda[] }) {
  return (
    <nav className="t-ubic t-filtro-tienda" aria-label="Ver lo que hay en">
      <Icono nombre="tienda" />
      <span className="t-filtro-txt">Ver lo que hay en</span>
      {/* Para la próxima espera: la franja del esqueleto dibuja estas mismas tiendas (`TiendasDeEspera`). */}
      <RecordarTiendas tiendas={opciones.map((o) => ({ nombre: o.nombre, clave: claveDeLaOpcion(o.href) }))} />
      <span className="t-pildoras-tienda">
        {opciones.map((o) => (
          <Link key={o.href} className="t-pildora-mini" href={o.href} aria-current={o.actual ? "true" : undefined} scroll={false}>
            {o.nombre}
            <PendienteDelEnlace />
          </Link>
        ))}
      </span>
    </nav>
  );
}

/** La tienda de un enlace de la franja (`?sede=lima`), o null con «Todas». */
function claveDeLaOpcion(href: string): string | null {
  const q = href.indexOf("?");
  return q < 0 ? null : new URLSearchParams(href.slice(q + 1).split("#")[0]).get("sede");
}
