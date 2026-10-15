import { leerCatalogo } from "@/lib/catalogo-servidor";
import { datosDeCabecera } from "@/lib/inicio";
import { leerPortada } from "@/lib/portada-servidor";
import { anioLima, anuncios } from "@/lib/portada";
import { Anuncio } from "../Anuncio";
import { Cabecera } from "../Cabecera";
import { CabeceraConCuenta } from "../CabeceraConCuenta";
import { Pie } from "../Pie";

/**
 * El marco de las páginas de la cuenta y de ayuda, el mismo de la portada: la franja de arriba (con la campaña vigente), la cabecera,
 * el contenido y, si se pide, el pie. Sin cuenta, la cabecera de la portada («Entrar», «Crear mi cuenta»); con cuenta, la de la tienda
 * (actividad 5: el menú, el buscador y «Mi cuenta», armada con el catálogo con «Todas»). Los formularios (crear, entrar, recuperar) van
 * sin pie, como en la maqueta.
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
  const [{ campana }, catalogo] = await Promise.all([leerPortada(), conCuenta ? leerCatalogo(null) : Promise.resolve(null)]);
  return (
    <div className="tienda">
      <Anuncio frases={anuncios(campana)} />
      {conCuenta ? (
        <CabeceraConCuenta
          datos={datosDeCabecera(catalogo?.prendas ?? [], null, process.env.TIENDA_FOTOS_ORIGEN)}
          actual={enPagina === "cuenta" ? "cuenta" : null}
        />
      ) : (
        <Cabecera enPagina={enPagina === "cuenta" ? undefined : enPagina} />
      )}
      <main className="t-pagina">
        {children}
        {conPie && <Pie anio={anioLima()} conCuenta={conCuenta} />}
      </main>
    </div>
  );
}
