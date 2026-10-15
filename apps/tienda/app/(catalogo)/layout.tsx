import { redirect } from "next/navigation";
import { Anuncio } from "@/components/Anuncio";
import { MarcoCatalogo } from "@/components/MarcoCatalogo";
import { leerPortada } from "@/lib/portada-servidor";
import { anuncios } from "@/lib/portada";
import { leerSesion } from "@/lib/sesion-servidor";

// El marco de las páginas con cuenta (ADR-0408, actividades 3 a 5): el Inicio, el catálogo y la ficha. Sin cuenta, nada de esto se ve
// (maqueta v4): el proxy ya manda a «Entrar» a quien no trae la cookie, y aquí se vuelve a preguntar quién es contra el proyecto de
// clientes, como en «Mi cuenta». La franja lee la campaña con la misma lectura de la portada; si la base no responde, salen las frases
// fijas. La cabecera, la franja «Ver lo que hay en» y el pie los pone cada página (`MarcoCatalogo`): dependen de la tienda elegida.
export default async function CatalogoLayout({ children }: { children: React.ReactNode }) {
  const sesion = await leerSesion();
  if (sesion.estado === "sin_sesion") redirect("/entrar");
  const { campana } = await leerPortada();
  return (
    <div className="tienda">
      <Anuncio frases={anuncios(campana)} />
      {sesion.estado === "sin_respuesta" ? (
        <MarcoCatalogo prendas={[]} sede={null}>
          <div className="t-ancho">
            <div className="t-vacio">
              <h3>No pudimos revisar tu sesión</h3>
              <p>Vuelve a intentarlo en unos minutos.</p>
            </div>
          </div>
        </MarcoCatalogo>
      ) : (
        children
      )}
    </div>
  );
}
