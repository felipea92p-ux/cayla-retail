import type { Prenda } from "@/lib/catalogo";
import { cuantosFavoritos, nombreDeLaCuenta } from "@/lib/cabecera-servidor";
import { datosDeCabecera } from "@/lib/inicio";
import { anioLima } from "@/lib/portada";
import { BotonBolsa } from "./bolsa/BotonBolsa";
import { CabeceraConCuenta, type SeccionActual } from "./CabeceraConCuenta";
import { EntradaDelDia } from "./cuenta/EntradaDelDia";
import { FiltroTienda, type OpcionTienda } from "./FiltroTienda";
import { Pie } from "./Pie";

/**
 * El marco de las páginas de quien tiene cuenta (el Inicio, el catálogo, la ficha, «Arma tu look»): la cabecera con el buscador, el
 * menú, los favoritos y la bolsa, la franja «Ver lo que hay en» (si hay más de una tienda en la web), el contenido y el pie. La franja de
 * arriba la pone el layout. La cabecera se arma con el catálogo que la página ya leyó, filtrado por la tienda elegida: los conteos del
 * menú y el buscador dicen lo mismo que la página. La bolsa es un componente de servidor (lee su cookie) y entra a la cabecera, que es
 * del navegador, como una pieza ya dibujada.
 */
export async function MarcoCatalogo({
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
  const [favoritos, nombre] = await Promise.all([cuantosFavoritos(), nombreDeLaCuenta()]);
  return (
    <>
      {/* Entrar a la web cuenta como actividad del Club: se anota una vez al día por sesión (y al iniciar sesión, en «Entrar»). */}
      <EntradaDelDia />
      <CabeceraConCuenta datos={datos} actual={actual} favoritos={favoritos} nombre={nombre} bolsa={<BotonBolsa />} />
      {/* Con una sola tienda en la web no hay nada que elegir. */}
      {filtro && filtro.length > 2 && <FiltroTienda opciones={filtro} />}
      <main className="t-pagina t-pagina-catalogo">
        {children}
        <Pie anio={anioLima()} conCuenta sede={sede} />
      </main>
    </>
  );
}
