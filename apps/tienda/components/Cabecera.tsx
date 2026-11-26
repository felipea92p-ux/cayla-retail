import Link from "next/link";
import { Logo } from "./Marca";

/**
 * La cabecera de quien está entrando (Entrar, Crear cuenta y las páginas para volver a entrar): solo el logo, que lleva al inicio (Felipe
 * 2026-11-26: el enlace suelto al lado del logo, «Entrar» o «Volver a la tienda», no le gustaba). Cada formulario ya trae su otro camino
 * («¿Ya tienes cuenta? Entra», «Volver a entrar», «Crear mi cuenta»), y quien llega a entrar no necesita un menú. Toda otra página lleva la
 * cabecera de la tienda (`CabeceraConCuenta`), con o sin sesión (auditoría 2026-11-06).
 */
export function Cabecera() {
  return (
    <header className="t-cab">
      <div className="t-cab-fila t-cab-simple">
        <Link className="t-logo" href="/inicio" aria-label="CAYLA, ir al inicio">
          <Logo />
        </Link>
        <span className="t-esp" />
      </div>
    </header>
  );
}
