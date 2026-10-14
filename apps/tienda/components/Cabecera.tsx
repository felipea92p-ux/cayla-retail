import Link from "next/link";
import { salir } from "@/app/acciones/cuenta";
import { Isotipo } from "./Isotipo";

/**
 * La cabecera. Sin cuenta: a la derecha, «Entrar» y «Crear mi cuenta» (la de la página donde ya se está no se repite). Con
 * cuenta (`conCuenta`): «Mi cuenta» y «Salir», como la maqueta. Lo dice la página: la portada no lee la sesión (así se guarda
 * en caché) y a quien tiene sesión el proxy lo lleva a «Mi cuenta»; las páginas de la cuenta sí la leen.
 */
export function Cabecera({ conCuenta = false, enPagina }: { conCuenta?: boolean; enPagina?: "entrar" | "crear-cuenta" | "cuenta" }) {
  return (
    <header className="t-cab">
      <div className="t-cab-fila">
        <Link className="t-logo" href="/" aria-label="CAYLA, ir a la portada">
          <Isotipo />
          <span>CAYLA</span>
        </Link>
        <span className="t-esp" />
        {conCuenta ? (
          <>
            {enPagina !== "cuenta" && (
              <Link className="t-btn t-btn-sec t-btn-chico" href="/cuenta">
                Mi cuenta
              </Link>
            )}
            <form action={salir}>
              <button className="t-btn t-btn-sec t-btn-chico" type="submit">
                Salir
              </button>
            </form>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </header>
  );
}
