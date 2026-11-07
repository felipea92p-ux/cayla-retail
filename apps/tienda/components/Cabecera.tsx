import Link from "next/link";
import { Logo } from "./Marca";

/**
 * La cabecera de quien está entrando (A · Muro, Felipe 2026-10-19): solo el logo al centro y, a la derecha, el otro camino como una palabra
 * («Crear mi cuenta» desde Entrar; «Entrar» desde Crear cuenta y desde recuperar la contraseña). Quien llega a entrar no necesita un menú, y
 * el logo lleva al inicio. Toda otra página lleva la cabecera de la tienda (`CabeceraConCuenta`), con o sin sesión (auditoría 2026-11-06:
 * «Nuestras tiendas» y «Cómo separar» traían otra, sin menú, buscador ni bolsa).
 */
export function Cabecera({ enPagina }: { enPagina?: "entrar" | "crear-cuenta" }) {
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
