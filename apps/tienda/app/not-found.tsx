import Link from "next/link";
import { Cabecera } from "@/components/Cabecera";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { Icono } from "@/components/Icono";
import { leerSesion } from "@/lib/sesion-servidor";

/**
 * Una dirección que no existe: lo dice en una línea y lleva de vuelta. Con sesión, dentro de la tienda de siempre (la cabecera con el
 * menú, el buscador y la bolsa) y al Inicio; sin sesión, con la cabecera de la portada y a la portada. Antes salía siempre «Entrar» y
 * «Volver a la portada», también a quien ya había entrado (revisión de la tienda, 2026-10-15).
 */
export default async function NoEncontrada() {
  const conCuenta = (await leerSesion()).estado === "con_sesion";
  const contenido = (
    <div className="t-ancho">
      <div className="t-vacio">
        <Icono nombre="tienda" />
        <h3>Esta página no está</h3>
        <p>Puede que el enlace esté mal escrito o que la página ya no exista.</p>
        <Link className="t-btn" href={conCuenta ? "/inicio" : "/"}>
          {conCuenta ? "Ir al inicio" : "Volver a la portada"}
        </Link>
      </div>
    </div>
  );
  if (conCuenta) return <MarcoCuenta conCuenta>{contenido}</MarcoCuenta>;
  return (
    <div className="tienda">
      <Cabecera />
      <main className="t-pagina">{contenido}</main>
    </div>
  );
}
