import Link from "next/link";
import { Icono, type NombreIcono } from "./Icono";
import { InvitacionClub } from "./InvitacionClub";

// Solo el título de cada beneficio: se entiende de un vistazo (el detalle, en los Términos del Club y en el perfil). Los cuatro de la maqueta
// Premium (2026-11-07), cada uno con su regla en los Términos del Club. «Lo nuevo, primero» sigue en el cartel de la caja (apps/web,
// club-cartel-reglas.ts), solo cuando no hay regalo de cumpleaños; aquí el cumpleaños siempre está.
const BENEFICIOS: [NombreIcono, string][] = [
  ["chispa", "Puntos en cada compra"],
  ["regalo", "Puntos de regalo en tu cumpleaños"],
  ["ticket", "Cupones al canjear tus puntos"],
  ["pedido", "Tus pedidos en un solo lugar"],
];

/**
 * El Club CAYLA (maqueta, `seccionClub`): los beneficios y la invitación (G · Pasarela). Sin cuenta, invita a crearla con «Tu nombre aquí»; con cuenta,
 * la invitación lleva su nombre y el botón lleva a «Mi perfil». `regaloCumple`: los puntos de regalo del cumpleaños (la configuración vigente,
 * `tienda_puntos_config`, programa de puntos), en un sello sobre la tarjeta; sin el dato, sin sello (nunca un número inventado).
 */
export function SeccionClub({
  nombre,
  desde,
  conCuenta,
  esDelClub = conCuenta,
  regaloCumple = null,
}: {
  nombre: string | null;
  desde: number;
  conCuenta: boolean;
  /** Con cuenta pero sin Club (ADR-0438): se une al separar, o ahora, completando su documento y su celular. */
  esDelClub?: boolean;
  regaloCumple?: number | null;
}) {
  return (
    <section className="t-club" aria-labelledby="club-cayla">
      {/* El bloque vino va dentro del ancho de la página, con sus esquinas (rediseño Premium): el rojo queda para las acciones. */}
      <div className="t-ancho">
      <div className="t-club-in">
        <div data-revela>
          <span className="t-ceja">Club CAYLA</span>
          <h2 id="club-cayla">
            {esDelClub ? (
              <>
                Eres <em>del club.</em>
              </>
            ) : conCuenta ? (
              <>
                Entra al <em>club.</em>
              </>
            ) : (
              <>
                Tu cuenta es tu <em>invitación.</em>
              </>
            )}
          </h2>
          <ul className="t-beneficios">
            {BENEFICIOS.map(([icono, titulo]) => (
              <li key={titulo}>
                <span>
                  <Icono nombre={icono} />
                </span>
                <span>
                  <b>{titulo}</b>
                </span>
              </li>
            ))}
          </ul>
          {esDelClub ? (
            <Link className="t-btn" href="/cuenta">
              Ver mi perfil
            </Link>
          ) : conCuenta ? (
            <Link className="t-btn" href="/cuenta/club">
              Entrar al Club
            </Link>
          ) : (
            <Link className="t-btn" href="/crear-cuenta">
              Crear mi cuenta
            </Link>
          )}
        </div>
        <div className="t-club-tarjeta">
          <InvitacionClub nombre={nombre} desde={desde} />
          {regaloCumple !== null && regaloCumple > 0 && (
            <span className="t-club-sello">
              <b>+{regaloCumple.toLocaleString("es-PE")}</b>
              <small>puntos en tu cumpleaños</small>
            </span>
          )}
        </div>
      </div>
      </div>
    </section>
  );
}
