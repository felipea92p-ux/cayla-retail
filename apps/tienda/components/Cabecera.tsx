import Link from "next/link";
import { Logo } from "./Marca";

/**
 * La cabecera de las páginas de la cuenta y de ayuda para quien no tiene sesión (entrar, crear la cuenta, cómo separar, las tiendas).
 * En «Entrar» y «Crear cuenta» (A · Muro, Felipe 2026-10-19: sin las cuatro opciones de arriba) es solo el logo al centro y, a la
 * derecha, el otro camino como una palabra («Crear mi cuenta» desde Entrar, «Entrar» desde Crear cuenta): quien llega a entrar no
 * necesita un menú, y el logo lleva al inicio. En las páginas de ayuda sigue con «Ver la tienda», «Cómo separar», «Nuestras tiendas» y
 * «Club CAYLA» a la izquierda y «Entrar» / «Crear mi cuenta» a la derecha. El catálogo mismo lleva la cabecera de la tienda
 * (`CabeceraConCuenta`, que sin sesión ofrece entrar o crear la cuenta desde la cuenta).
 */
export function Cabecera({ enPagina }: { enPagina?: "entrar" | "crear-cuenta" }) {
  if (enPagina) {
    return (
      <header className="t-cab">
        <div className="t-cab-fila t-cab-simple">
          <Link className="t-logo" href="/inicio" aria-label="CAYLA, ir al inicio">
            <Logo />
          </Link>
          <span className="t-esp" />
          {enPagina === "entrar" ? (
            <Link className="t-nav-b" href="/crear-cuenta">
              Crear mi cuenta
            </Link>
          ) : (
            <Link className="t-nav-b" href="/entrar">
              Entrar
            </Link>
          )}
        </div>
      </header>
    );
  }
  return (
    <header className="t-cab">
      <div className="t-cab-fila">
        <Link className="t-logo" href="/inicio" aria-label="CAYLA, ir al inicio">
          <Logo />
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
        <Link className="t-btn t-btn-sec t-btn-chico" href="/entrar">
          Entrar
        </Link>
        <Link className="t-btn t-btn-chico t-solo-grande" href="/crear-cuenta">
          Crear mi cuenta
        </Link>
      </div>
    </header>
  );
}
