import Link from "next/link";
import { salir } from "@/app/acciones/cuenta";
import { BotonCerrarSesion } from "./BotonCerrarSesion";
import { SeccionDelPerfil } from "./SeccionDelPerfil";

// «Tu cuenta», al final de «Mi perfil» (Felipe 2026-10-15): con qué correo entra, «Cambiar mi correo», «Cerrar sesión» (antes, «Salir de
// mi cuenta», suelto bajo la tarjeta del Club: lo primero que se leía en el celular) y, discreto y aparte, «Eliminar mi cuenta». Todo lo
// de la cuenta, junto y al final, donde se busca. Su propio correo se ve entero (es suyo).
export function TuCuentaWeb({ correo }: { correo: string }) {
  return (
    <SeccionDelPerfil id="pf-cuenta" titulo="Tu cuenta">
      <div className="pf-acceso">
        <p className="pf-acceso-correo">
          <span>Entras con</span> <b className="w-correo">{correo}</b>
        </p>
        <div className="pf-acceso-acc">
          <Link className="t-btn t-btn-sec t-btn-chico" href="/cuenta/correo">
            Cambiar mi correo
          </Link>
          <form action={salir}>
            <BotonCerrarSesion className="t-btn t-btn-sec t-btn-chico" />
          </form>
        </div>
        <Link className="t-enlace pf-acceso-eliminar" href="/cuenta/eliminar">
          Eliminar mi cuenta
        </Link>
      </div>
    </SeccionDelPerfil>
  );
}
