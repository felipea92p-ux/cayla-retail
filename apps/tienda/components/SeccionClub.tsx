import Link from "next/link";
import { Icono, type NombreIcono } from "./Icono";
import { InvitacionClub } from "./InvitacionClub";

// Solo el título de cada beneficio: se entiende de un vistazo (el detalle, en «Cómo separar» y en el perfil).
const BENEFICIOS: [NombreIcono, string][] = [
  ["ticket", "Puntos en cada compra"],
  ["regalo", "Regalo en tu cumpleaños"],
  ["chispa", "Lo nuevo, primero"],
  ["pedido", "Tus pedidos en un lugar"],
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
      <div className="t-ancho t-club-in">
        <div className="t-revela">
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
    </section>
  );
}
