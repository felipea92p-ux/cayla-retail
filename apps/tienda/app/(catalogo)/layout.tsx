import { redirect } from "next/navigation";
import { Anuncio } from "@/components/Anuncio";
import { Cabecera } from "@/components/Cabecera";
import { Pie } from "@/components/Pie";
import { leerPortada } from "@/lib/portada-servidor";
import { anioLima, anuncios } from "@/lib/portada";
import { leerSesion } from "@/lib/sesion-servidor";
import "../estilos/catalogo.css";

// El marco de las páginas del catálogo (ADR-0408, actividad 3): la franja, la cabecera y el pie de la portada. Sin cuenta, el
// catálogo no se ve (maqueta v4): el proxy ya manda a «Entrar» a quien no trae la cookie, y aquí se vuelve a preguntar quién es
// contra el proyecto de clientes, como en «Mi cuenta». La franja lee la campaña con la misma lectura de la portada; si la base no
// responde, salen las frases fijas.
export default async function CatalogoLayout({ children }: { children: React.ReactNode }) {
  const sesion = await leerSesion();
  if (sesion.estado === "sin_sesion") redirect("/entrar");
  const { campana } = await leerPortada();
  return (
    <div className="tienda">
      <Anuncio frases={anuncios(campana)} />
      <Cabecera conCuenta enPagina="catalogo" />
      <main className="t-pagina t-pagina-catalogo">
        {sesion.estado === "sin_respuesta" ? (
          <div className="t-ancho">
            <div className="t-vacio">
              <h3>No pudimos revisar tu sesión</h3>
              <p>Vuelve a intentarlo en unos minutos.</p>
            </div>
          </div>
        ) : (
          children
        )}
        <Pie anio={anioLima()} conCuenta />
      </main>
    </div>
  );
}
