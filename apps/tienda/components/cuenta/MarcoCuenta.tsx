import { leerPortada } from "@/lib/portada-servidor";
import { anioLima, anuncios } from "@/lib/portada";
import { Anuncio } from "../Anuncio";
import { Cabecera } from "../Cabecera";
import { Pie } from "../Pie";

/**
 * El marco de las páginas de la cuenta, el mismo de la portada: la franja de arriba (con la campaña vigente), la cabecera, el
 * contenido y, si se pide, el pie. Los formularios (crear, entrar, recuperar) van sin pie, como en la maqueta.
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
  const { campana } = await leerPortada();
  return (
    <div className="tienda">
      <Anuncio frases={anuncios(campana)} />
      <Cabecera conCuenta={conCuenta} enPagina={enPagina} />
      <main className="t-pagina">
        {children}
        {conPie && <Pie anio={anioLima()} conCuenta={conCuenta} />}
      </main>
    </div>
  );
}
