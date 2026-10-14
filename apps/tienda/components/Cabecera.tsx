import Link from "next/link";
import { Isotipo } from "./Isotipo";

/** La cabecera sin cuenta: el logo vuelve a la portada; a la derecha, entrar o crear la cuenta. */
export function Cabecera() {
  return (
    <header className="t-cab">
      <div className="t-cab-fila">
        <Link className="t-logo" href="/" aria-label="CAYLA, ir a la portada">
          <Isotipo />
          <span>CAYLA</span>
        </Link>
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
