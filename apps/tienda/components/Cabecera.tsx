import Link from "next/link";
import { Isotipo } from "./Isotipo";

/**
 * La cabecera de quien no tiene cuenta (la portada, entrar, crear la cuenta, las páginas públicas): a la derecha, «Entrar» y «Crear mi
 * cuenta» (la de la página donde ya se está no se repite). Con cuenta, la cabecera es otra (`CabeceraConCuenta`, actividad 5: el menú,
 * el buscador y «Mi cuenta»); a quien tiene sesión el proxy lo lleva de la portada al Inicio.
 */
export function Cabecera({ enPagina }: { enPagina?: "entrar" | "crear-cuenta" }) {
  return (
    <header className="t-cab">
      <div className="t-cab-fila">
        <Link className="t-logo" href="/" aria-label="CAYLA, ir a la portada">
          <Isotipo />
          <span>CAYLA</span>
        </Link>
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
