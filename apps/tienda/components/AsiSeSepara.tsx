import Link from "next/link";
import { pasosParaSeparar } from "@/lib/ayuda";
import { leerSedes } from "@/lib/tiendas-servidor";

/**
 * «Así se separa» (maqueta, `seccionComo`): los cuatro pasos, en la portada y en el Inicio, con la MISMA línea de tiempo y los mismos
 * textos que «Cómo separar» (`pasosParaSeparar`, revisión «a nivel mundial» 2026-10-16). Antes eran cuatro cajas con textos propios, que
 * decían «tu DNI» (la cuenta también se crea con carné de extranjería o pasaporte) y «Ya eres parte del Club». Las tiendas son las de
 * la web («En cada prenda ves cuánto hay en Lima y Trujillo»): las lee de la misma lectura que la página ya hizo (`leerSedes` va una vez
 * por petición). En el Inicio (`conCuenta`) el primero ya está hecho y lo dice con su visto; en la portada, sin cuenta, invita a crearla.
 */
export async function AsiSeSepara({ conCuenta = false }: { conCuenta?: boolean }) {
  const sedes = await leerSedes();
  // Los mismos cuatro pasos de «Cómo separar» (`pasosParaSeparar`), con su título y UNA frase corta bajo cada uno (Pasarela: el número
  // grande en Didone, el título y una línea); el detalle completo vive en «Cómo separar».
  const [elige] = pasosParaSeparar(
    sedes.map((s) => s.nombre),
    conCuenta,
  );
  const pasos: { titulo: string; texto: string; hecho: boolean }[] = [
    { titulo: elige.titulo, texto: elige.texto.split(". ")[0].replace(/\.$/, "") + ".", hecho: false },
    conCuenta
      ? { titulo: "Ya tienes tu cuenta", texto: "Con ella separas y sigues tus pedidos.", hecho: true }
      : { titulo: "Entra o crea tu cuenta", texto: "Con tu correo, en un minuto.", hecho: false },
    { titulo: "Toca «Separar» y mándalo por WhatsApp", texto: "El mensaje ya va escrito. No pagas nada en la web.", hecho: false },
    { titulo: "Paga y recógelo", texto: "Coordinas el pago con la tienda y lo recoges con tu código.", hecho: false },
  ];
  return (
    <section className="t-sec t-ancho ay-asi" aria-labelledby="asi-se-separa">
      <div className="t-cab-centro" data-revela>
        <Link className="t-ceja" href="/como-separar">
          Sin pagar en la web
        </Link>
        <h2 id="asi-se-separa">
          Así se <em>separa</em>
        </h2>
      </div>
      <ol className="as-pasos" data-revela-lista aria-label="Los pasos para separar">
        {pasos.map((p, i) => (
          <li key={p.titulo} className="as-paso" data-hecho={p.hecho ? "" : undefined}>
            <span className="as-n" aria-hidden="true">
              {String(i + 1).padStart(2, "0")}
            </span>
            <b>
              {p.hecho && <span className="t-sr">Hecho: </span>}
              {p.titulo}
            </b>
            <span className="as-x">{p.texto}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
