import { cuantosFavoritos, nombreDeLaCuenta } from "@/lib/cabecera-servidor";
import { leerCatalogo } from "@/lib/catalogo-servidor";
import { datosDeCabecera } from "@/lib/inicio";
import { leerPortada } from "@/lib/portada-servidor";
import { anioActual } from "@/lib/hoy-servidor";
import { anuncios } from "@/lib/portada";
import { Anuncio } from "../Anuncio";
import { BotonBolsa } from "../bolsa/BotonBolsa";
import { Cabecera } from "../Cabecera";
import { CabeceraConCuenta } from "../CabeceraConCuenta";
import { Pie } from "../Pie";
import { EntradaDelDia } from "./EntradaDelDia";

/**
 * El marco de las páginas de la cuenta y de ayuda, el mismo de la portada: la franja de arriba (con la campaña vigente), la cabecera,
 * el contenido y, si se pide, el pie. Sin cuenta, la cabecera de la portada («Entrar», «Crear mi cuenta»); con cuenta, la de la tienda
 * (el menú, el buscador, los favoritos, «Mi cuenta» y la bolsa, armada con el catálogo con «Todas»). Los formularios (crear, entrar,
 * recuperar) van sin pie, como en la maqueta. El pie va después de <main> y llega solo al borde
 * de abajo en una página corta (pie.css).
 */
export async function MarcoCuenta({
  children,
  conCuenta = false,
  enPagina,
  conPie = false,
}: {
  children: React.ReactNode;
  conCuenta?: boolean;
  enPagina?: "entrar" | "crear-cuenta" | "cuenta";
  conPie?: boolean;
}) {
  const [{ campana }, catalogo, favoritos, nombre] = await Promise.all([
    leerPortada(),
    conCuenta ? leerCatalogo(null) : Promise.resolve(null),
    conCuenta ? cuantosFavoritos() : Promise.resolve(null),
    conCuenta ? nombreDeLaCuenta() : Promise.resolve(null),
  ]);
  return (
    <div className="tienda">
      <Anuncio frases={anuncios(campana, conCuenta)} />
      {/* Entrar a la web cuenta como actividad del Club: se anota una vez al día por sesión (y al iniciar sesión, en «Entrar»). */}
      {conCuenta && <EntradaDelDia />}
      {conCuenta ? (
        <CabeceraConCuenta
          datos={datosDeCabecera(catalogo?.prendas ?? [], null, process.env.TIENDA_FOTOS_ORIGEN)}
          actual={enPagina === "cuenta" ? "cuenta" : null}
          favoritos={favoritos}
          nombre={nombre}
          bolsa={<BotonBolsa />}
        />
      ) : (
        <Cabecera enPagina={enPagina === "cuenta" ? undefined : enPagina} />
      )}
      <main className="t-pagina">{children}</main>
      {conPie && <Pie anio={await anioActual()} conCuenta={conCuenta} />}
    </div>
  );
}
