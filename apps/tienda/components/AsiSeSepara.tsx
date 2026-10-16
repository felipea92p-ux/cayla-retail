import Link from "next/link";
import { Icono, type NombreIcono } from "./Icono";

const PASOS: [NombreIcono, string, string][] = [
  ["persona", "Crea tu cuenta", "Con tu correo, tu DNI y tu celular, y forma parte del Club CAYLA."],
  ["tienda", "Elige y toca «Separar»", "Mira cuánto hay en cada tienda. No pagas nada aquí."],
  ["chat", "Mándalo por WhatsApp", "El mensaje ya va escrito con tu número de pedido. La tienda te confirma."],
  ["bolsa", "Paga y recógelo", "Coordinas el pago por WhatsApp y lo recoges en tu tienda."],
];

/** El primer paso para quien ya entró con su cuenta: pedirle «Crea tu cuenta» a quien ya la tiene confundía. */
const YA_TIENES_CUENTA: [NombreIcono, string, string] = ["check", "Ya tienes tu cuenta", "Ya eres parte del Club CAYLA. Tus pedidos quedan en «Mi perfil»."];

/**
 * «Así se separa» (maqueta, `seccionComo`): los cuatro pasos, en la portada y en el Inicio. En el Inicio (`conCuenta`) el primero ya está
 * hecho y lo dice (con su visto); en la portada, sin cuenta, invita a crearla.
 */
export function AsiSeSepara({ conCuenta = false }: { conCuenta?: boolean }) {
  const pasos = conCuenta ? [YA_TIENES_CUENTA, ...PASOS.slice(1)] : PASOS;
  return (
    <section className="t-sec t-ancho" aria-labelledby="asi-se-separa">
      <div className="t-sec-cab">
        <div>
          <span className="t-ceja">Sin pagar en la web</span>
          <h2 id="asi-se-separa">
            Así se <em>separa</em>
          </h2>
        </div>
        <Link className="t-ver" href="/como-separar">
          Cómo funciona <Icono nombre="flecha" />
        </Link>
      </div>
      <ol className="t-como">
        {pasos.map(([icono, titulo, texto], i) => (
          <li key={titulo} data-hecho={conCuenta && i === 0 ? "" : undefined}>
            <span className="t-como-ic">
              <Icono nombre={icono} />
            </span>
            <b>{titulo}</b>
            <span>{texto}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
