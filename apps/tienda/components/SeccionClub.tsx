import Link from "next/link";
import { pctTexto } from "@/lib/portada";
import { Icono, type NombreIcono } from "./Icono";
import { TarjetaClub } from "./TarjetaClub";

const BENEFICIOS: [NombreIcono, string, string][] = [
  ["regalo", "Descuento en tu cumpleaños", "Te avisamos por WhatsApp y lo ves en tu cuenta."],
  ["ticket", "Un vale de compra por cada año", "Cada aniversario con CAYLA suma un vale."],
  ["chispa", "Lo nuevo, primero", "Lo ves aquí, en tu cuenta. Sin mensajes de publicidad."],
  ["pedido", "Tus pedidos en un lugar", "Ves cada separación, si ya la confirmaron y cuánto falta pagar."],
];

/**
 * El Club CAYLA (maqueta, `seccionClub`): los beneficios y la tarjeta. Sin cuenta, invita a crearla con «Tu nombre aquí»; con cuenta,
 * la tarjeta lleva su nombre y el botón lleva a «Mi perfil». `cumplePct`: el descuento de cumpleaños que cobra la caja
 * (`tienda_club_beneficios`), en un sello sobre la tarjeta; sin el dato, sin sello (nunca un número inventado).
 */
export function SeccionClub({
  nombre,
  desde,
  conCuenta,
  cumplePct = null,
}: {
  nombre: string | null;
  desde: number;
  conCuenta: boolean;
  cumplePct?: number | null;
}) {
  return (
    <section className="t-club" aria-labelledby="club-cayla">
      <div className="t-ancho t-club-in">
        <div className="t-revela">
          <span className="t-ceja">Club CAYLA</span>
          <h2 id="club-cayla">
            {conCuenta ? (
              <>
                Eres miembro del club. <em>Esto es para ti.</em>
              </>
            ) : (
              <>
                Crea tu cuenta y <em>forma parte del club.</em>
              </>
            )}
          </h2>
          <ul className="t-beneficios">
            {BENEFICIOS.map(([icono, titulo, texto]) => (
              <li key={titulo}>
                <span>
                  <Icono nombre={icono} />
                </span>
                <span>
                  <b>{titulo}</b>
                  <small>{texto}</small>
                </span>
              </li>
            ))}
          </ul>
          {conCuenta ? (
            <Link className="t-btn" href="/cuenta">
              Ver mi perfil
            </Link>
          ) : (
            <Link className="t-btn" href="/crear-cuenta">
              Crear mi cuenta
            </Link>
          )}
        </div>
        <div className="t-club-tarjeta">
          <TarjetaClub nombre={nombre ?? "Tu nombre aquí"} desde={desde} />
          {cumplePct !== null && (
            <span className="t-club-sello">
              <b>−{pctTexto(cumplePct)} %</b>
              <small>en tu cumpleaños</small>
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
