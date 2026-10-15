import Link from "next/link";
import { Icono, type NombreIcono } from "./Icono";

const PASOS: [NombreIcono, string, string][] = [
  ["persona", "Crea tu cuenta", "Con tu correo, tu DNI y tu celular. Ya eres del Club CAYLA."],
  ["tienda", "Elige y toca «Separar»", "Mira cuánto hay en cada tienda. No pagas nada aquí."],
  ["chat", "Mándalo por WhatsApp", "El mensaje ya va escrito con tu número de pedido. La tienda te confirma."],
  ["bolsa", "Paga y recógelo", "Coordinas el pago por WhatsApp y lo recoges en tu tienda."],
];

/** «Así se separa» (maqueta, `seccionComo`): los cuatro pasos, en la portada y en el Inicio. */
export function AsiSeSepara() {
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
        {PASOS.map(([icono, titulo, texto]) => (
          <li key={titulo}>
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
