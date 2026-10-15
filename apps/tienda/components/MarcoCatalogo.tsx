import type { Prenda } from "@/lib/catalogo";
import { datosDeCabecera } from "@/lib/inicio";
import { anioLima } from "@/lib/portada";
import { CabeceraConCuenta, type SeccionActual } from "./CabeceraConCuenta";
import { FiltroTienda, type OpcionTienda } from "./FiltroTienda";
import { Pie } from "./Pie";

/**
 * El marco de las páginas de quien tiene cuenta (el Inicio, el catálogo, la ficha): la cabecera con el buscador y el menú, la franja
 * «Ver lo que hay en» (si hay más de una tienda en la web), el contenido y el pie. La franja de arriba la pone el layout. La cabecera
 * se arma con el catálogo que la página ya leyó, filtrado por la tienda elegida: los conteos del menú y el buscador dicen lo mismo
 * que la página.
 */
export function MarcoCatalogo({
  prendas,
  sede,
  filtro = null,
  actual = null,
  children,
}: {
  /** Lo publicado en la tienda elegida (o todo, con «Todas»); vacío si la base no respondió. */
  prendas: readonly Prenda[];
  /** La clave de la tienda elegida (`?sede=`), o null con «Todas». */
  sede: string | null;
  filtro?: OpcionTienda[] | null;
  actual?: SeccionActual;
  children: React.ReactNode;
}) {
  const datos = datosDeCabecera(prendas, sede, process.env.TIENDA_FOTOS_ORIGEN);
  return (
    <>
      <CabeceraConCuenta datos={datos} actual={actual} />
      {/* Con una sola tienda en la web no hay nada que elegir. */}
      {filtro && filtro.length > 2 && <FiltroTienda opciones={filtro} />}
      <main className="t-pagina t-pagina-catalogo">
        {children}
        <Pie anio={anioLima()} conCuenta />
      </main>
    </>
  );
}
