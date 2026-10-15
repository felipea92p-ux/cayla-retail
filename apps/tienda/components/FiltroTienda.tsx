import Link from "next/link";
import { Icono } from "./Icono";

export type OpcionTienda = { nombre: string; href: string; actual: boolean };

/**
 * «Ver lo que hay en: Todas · Arequipa · Lima · Trujillo» (maqueta v4, `filtroTienda`): la franja bajo la cabecera para elegir la tienda.
 * Elegirla cambia el precio que se ve (el de esa tienda; con «Todas», el mayor entre las tiendas de la web). Son enlaces: la tienda
 * elegida va en la dirección y se puede compartir. Cuánto hay en cada tienda llega con la ficha (actividad 4).
 */
export function FiltroTienda({ opciones }: { opciones: OpcionTienda[] }) {
  return (
    <nav className="t-ubic t-filtro-tienda" aria-label="Ver lo que hay en">
      <Icono nombre="tienda" />
      <span className="t-filtro-txt">Ver lo que hay en</span>
      <span className="t-pildoras-tienda">
        {opciones.map((o) => (
          <Link key={o.href} className="t-pildora-mini" href={o.href} aria-current={o.actual ? "true" : undefined} scroll={false}>
            {o.nombre}
          </Link>
        ))}
      </span>
    </nav>
  );
}
