import Link from "next/link";
import { Isotipo } from "./Isotipo";

/**
 * La cabecera de las páginas de la cuenta y de ayuda para quien no tiene sesión (entrar, crear la cuenta, cómo separar, las tiendas):
 * en la computadora, «Ver la tienda» (el catálogo es de todos desde el 2026-10-17) y por dónde conocer cómo se separa, las tiendas y el
 * Club; a la derecha, «Entrar» y «Crear mi cuenta» (la de la página donde ya se está no se repite). El catálogo mismo lleva la cabecera de
 * la tienda (`CabeceraConCuenta`, que sin sesión ofrece entrar o crear la cuenta desde el ícono de la persona).
 */
export function Cabecera({ enPagina }: { enPagina?: "entrar" | "crear-cuenta" }) {
  return (
    <header className="t-cab">
      <div className="t-cab-fila">
        <Link className="t-logo" href="/inicio" aria-label="CAYLA, ir al inicio">
          <Isotipo />
          <span>CAYLA</span>
        </Link>
        <nav className="t-nav" aria-label="Conoce CAYLA">
          <Link className="t-nav-b" href="/catalogo">
            Ver la tienda
          </Link>
          <Link className="t-nav-b" href="/como-separar">
            Cómo separar
          </Link>
          <Link className="t-nav-b" href="/tiendas">
            Nuestras tiendas
          </Link>
          <Link className="t-nav-b" href="/inicio#club-cayla">
            Club CAYLA
          </Link>
        </nav>
        <span className="t-esp" />
        {enPagina !== "entrar" && (
          <Link className="t-btn t-btn-sec t-btn-chico" href="/entrar">
            Entrar
          </Link>
        )}
        {enPagina !== "crear-cuenta" && (
          <Link className="t-btn t-btn-chico t-solo-grande" href="/crear-cuenta">
            Crear mi cuenta
          </Link>
        )}
      </div>
    </header>
  );
}
