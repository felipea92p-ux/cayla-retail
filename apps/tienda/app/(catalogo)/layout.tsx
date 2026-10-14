import { Anuncio } from "@/components/Anuncio";
import { Cabecera } from "@/components/Cabecera";
import { Pie } from "@/components/Pie";
import { leerPortada } from "@/lib/portada-servidor";
import { anioLima, anuncios } from "@/lib/portada";
import "../estilos/catalogo.css";

// El marco de las páginas del catálogo (ADR-0408, actividad 3): la franja, la cabecera y el pie de la portada. Todavía SIN el candado
// de cuenta: lo pone la actividad 2 al integrarse (sin cuenta, el catálogo no se ve, maqueta v4). La franja lee la campaña vigente con
// la misma lectura de la portada; si la base no responde, salen las frases fijas.
export default async function CatalogoLayout({ children }: { children: React.ReactNode }) {
  const { campana } = await leerPortada();
  return (
    <div className="tienda">
      <Anuncio frases={anuncios(campana)} />
      <Cabecera />
      <main className="t-pagina t-pagina-catalogo">
        {children}
        <Pie anio={anioLima()} />
      </main>
    </div>
  );
}
