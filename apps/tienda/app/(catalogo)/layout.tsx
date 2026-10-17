import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Anuncio } from "@/components/Anuncio";
import { ProveedorGuardados } from "@/components/club/Guardados";
import { EsqueletoDePagina } from "@/components/EsqueletoDePagina";
import { MarcoCatalogo } from "@/components/MarcoCatalogo";
import { leerGuardadosEnBase } from "@/lib/club-servidor";
import { leerPortada } from "@/lib/portada-servidor";
import { anuncios } from "@/lib/portada";
import { leerSesion } from "@/lib/sesion-servidor";

// El marco de las páginas con cuenta (ADR-0408, actividades 3 a 5): el Inicio, el catálogo y la ficha. Sin cuenta, nada de esto se ve
// (maqueta v4): el proxy ya manda a «Entrar» a quien no trae la cookie, y aquí se vuelve a preguntar quién es contra el proyecto de
// clientes, como en «Mi cuenta». La franja lee la campaña con la misma lectura de la portada; si la base no responde, salen las frases
// fijas. La cabecera, la franja «Ver lo que hay en» y el pie los pone cada página (`MarcoCatalogo`): dependen de la tienda elegida.
// Lo que la cuenta guardó con el corazón se lee aquí una vez por petición y se reparte a TODA tarjeta (`ProveedorGuardados`): ninguna
// página tiene que pasárselo. Si la base no lo da, los corazones salen vacíos (guardar otra vez no duplica nada).
export default async function CatalogoLayout({ children }: { children: React.ReactNode }) {
  // La franja es la misma para todos (la campaña es compartida): sale en la cáscara armada por adelantado. Lo que mira la cuenta (quién
  // es, qué guardó) se lee por detrás, dentro de su <Suspense>, y mientras tanto se ve la cabecera con la página que brilla (ADR-0432).
  const { campanas } = await leerPortada();
  return (
    <div className="tienda">
      <Anuncio frases={anuncios(campanas, true)} />
      <Suspense fallback={<EsqueletoDePagina />}>
        <ConSesion>{children}</ConSesion>
      </Suspense>
    </div>
  );
}

async function ConSesion({ children }: { children: React.ReactNode }) {
  const sesion = await leerSesion();
  if (sesion.estado === "sin_sesion") redirect("/entrar");
  const guardados = sesion.estado === "con_sesion" ? await leerGuardadosEnBase(sesion.usuarioId) : null;
  if (sesion.estado === "sin_respuesta") {
    return (
      <MarcoCatalogo prendas={[]} sede={null}>
        <div className="t-ancho">
          <div className="t-vacio">
            <h3>No pudimos revisar tu sesión</h3>
            <p>Vuelve a intentarlo en unos minutos.</p>
          </div>
        </div>
      </MarcoCatalogo>
    );
  }
  return <ProveedorGuardados favoritos={guardados ? [...guardados.favoritos] : []}>{children}</ProveedorGuardados>;
}
