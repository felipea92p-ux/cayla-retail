import { Suspense } from "react";
import { Anuncio } from "@/components/Anuncio";
import { ProveedorGuardados } from "@/components/club/Guardados";
import { EsqueletoDePagina } from "@/components/EsqueletoDePagina";
import { SegunSesion } from "@/components/cuenta/SegunSesion";
import { MarcoCatalogo } from "@/components/MarcoCatalogo";
import { leerGuardadosEnBase } from "@/lib/club-servidor";
import { leerPortada } from "@/lib/portada-servidor";
import { anuncios } from "@/lib/portada";
import { leerSesion } from "@/lib/sesion-servidor";

// El marco del catálogo (ADR-0408, actividades 3 a 5): el Inicio, el catálogo, los looks y la ficha. SE VE SIN CUENTA (Felipe 2026-10-17: «no sea
// obligatorio iniciar sesión para ver los productos que se venden, ni los precios ni el stock»): la cuenta se pide cuando la persona quiere
// separar o guardar algo suyo, no antes. Lo que es de la persona (sus favoritos, su nombre) se lee solo si trae sesión, validada contra el
// proyecto de clientes, como en «Mi cuenta». La franja lee la campaña con la misma lectura de la portada; si la base no responde, salen las
// frases fijas. La cabecera, la franja «Ver lo que hay en» y el pie los pone cada página (`MarcoCatalogo`): dependen de la tienda elegida.
// Lo que la cuenta guardó con el corazón se lee aquí una vez por petición y se reparte a TODA tarjeta (`ProveedorGuardados`): ninguna
// página tiene que pasárselo. Sin cuenta, o si la base no lo da, los corazones salen vacíos (tocar uno pide entrar).
export default async function CatalogoLayout({ children }: { children: React.ReactNode }) {
  // La campaña es la misma para todos: sale en la cáscara armada por adelantado. Solo la última frase de la franja cambia con la cuenta
  // («Crea tu cuenta…» o «Tus beneficios están en Mi perfil»). Lo que mira la cuenta (quién es, qué guardó) se lee por detrás, dentro de su
  // <Suspense>, y mientras tanto se ve la cabecera con la página que brilla (ADR-0432).
  const { campanas } = await leerPortada();
  return (
    <div className="tienda">
      <SegunSesion visitante={<Anuncio frases={anuncios(campanas, false)} />} conCuenta={<Anuncio frases={anuncios(campanas, true)} />} />
      <Suspense fallback={<EsqueletoDePagina campana={campanas[0] ?? null} />}>
        <ConSesion>{children}</ConSesion>
      </Suspense>
    </div>
  );
}

async function ConSesion({ children }: { children: React.ReactNode }) {
  const sesion = await leerSesion();
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
