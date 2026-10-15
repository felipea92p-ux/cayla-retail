import Link from "next/link";
import { MODULOS, esClaveModulo } from "@/lib/modulos";
import { aterrizajeDe } from "@/lib/menu";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { Aventurero } from "@/components/ui/Aventurero";

// «Sin acceso» (ADR-0161 B2): a dónde cae quien llega por URL directa a un módulo que su rol no ve (`exigirModulo`).
// Dice qué módulo es y a quién pedírselo; no dice por qué ni muestra nada del módulo. El candado real sigue en la base.
//
// También es a donde aterriza una cuenta cuyo rol no ve NINGUNA pantalla, ni el Inicio (`aterrizajeDe`). Ahí «Volver al inicio»
// era una vuelta en redondo: el Inicio la manda de nuevo aquí. Por eso ese caso se reconoce por la cuenta (la misma regla que
// decide el aterrizaje), no por la URL, y su botón es para DESPUÉS de que un líder le active algo: entra a lo que ya ve.
//
// Aventurero (2026-10-15) abre la tarjeta con su meme; lo que hay que hacer lo sigue diciendo el texto de abajo.
export default async function SinAccesoPage({ searchParams }: { searchParams: Promise<{ modulo?: string }> }) {
  const [{ modulo }, persona] = await Promise.all([searchParams, requirePersonaActualV2()]);
  const nombre = modulo && esClaveModulo(modulo) ? MODULOS.find((m) => m.clave === modulo)?.nombre : null;
  const noVeNinguna =
    aterrizajeDe({
      terminal: persona.terminal,
      modulos: persona.modulos.map((m) => m.clave),
      pantallaPrincipal: persona.pantallaPrincipal,
      esAdmin: persona.esAdmin,
      vista: persona.vista,
    }) === "/sin-acceso";

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="card-cayla anim-entrada w-full max-w-md overflow-hidden text-center">
        <Aventurero motivo="sin-acceso" />
        <div className="p-8 pt-6">
          <p className="label-cayla text-[11px] text-taupe-profundo">Sin acceso</p>
          {noVeNinguna ? (
            <>
              <h1 className="font-display mt-2 text-2xl text-tinta">Tu cuenta todavía no ve ninguna pantalla</h1>
              <p className="mt-3 text-sm text-tinta/75">
                Lo que ve cada cuenta lo decide su rol, y el tuyo aún no tiene pantallas. Pídele a un líder de equipo que te las
                active en Colaboradores, en la pestaña Roles y accesos. Cuando lo haga, entra con este botón.
              </p>
              <div className="mt-6 flex justify-center">
                <Link href="/" className="btn-cayla btn-primario">
                  Ya me lo activaron
                </Link>
              </div>
            </>
          ) : (
            <>
              <h1 className="font-display mt-2 text-2xl text-tinta">{nombre ? `Tu rol no ve «${nombre}»` : "Tu rol no ve este módulo"}</h1>
              <p className="mt-3 text-sm text-tinta/75">
                Lo que ve cada cuenta lo decide su rol. Si necesitas entrar aquí, pídele a un líder de equipo que lo active en
                Colaboradores, en la pestaña Roles y accesos.
              </p>
              <div className="mt-6 flex justify-center">
                <Link href="/" className="btn-cayla btn-primario">
                  Volver al inicio
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
