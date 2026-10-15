import Link from "next/link";
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
 * la tarjeta lleva su nombre y el botón lleva a «Mi cuenta».
 */
export function SeccionClub({ nombre, desde, conCuenta }: { nombre: string | null; desde: number; conCuenta: boolean }) {
  return (
    <section className="t-club" aria-labelledby="club-cayla">
      <div className="t-ancho t-club-in">
        <div className="t-revela">
          <span className="t-ceja">Club CAYLA</span>
          <h2 id="club-cayla">
            {conCuenta ? (
              <>
                Eres del club. <em>Esto es para ti.</em>
              </>
            ) : (
              <>
                Crea tu cuenta y <em>ya eres del club.</em>
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
              Ver mi cuenta
            </Link>
          ) : (
            <Link className="t-btn" href="/crear-cuenta">
              Crear mi cuenta
            </Link>
          )}
        </div>
        <TarjetaClub nombre={nombre ?? "Tu nombre aquí"} desde={desde} />
      </div>
    </section>
  );
}
