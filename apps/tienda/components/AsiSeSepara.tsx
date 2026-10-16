import Link from "next/link";
import { pasosParaSeparar } from "@/lib/ayuda";
import { leerSedes } from "@/lib/tiendas-servidor";
import { LineaDePasos } from "./ayuda/LineaDePasos";
import { Icono } from "./Icono";

/**
 * «Así se separa» (maqueta, `seccionComo`): los cuatro pasos, en la portada y en el Inicio, con la MISMA línea de tiempo y los mismos
 * textos que «Cómo separar» (`pasosParaSeparar`, revisión «a nivel mundial» 2026-10-16). Antes eran cuatro cajas con textos propios, que
 * decían «tu DNI» (la cuenta también se crea con carné de extranjería o pasaporte) y «Ya eres parte del Club». Las tiendas son las de
 * la web («En cada prenda ves cuánto hay en Lima y Trujillo»): las lee de la misma lectura que la página ya hizo (`leerSedes` va una vez
 * por petición). En el Inicio (`conCuenta`) el primero ya está hecho y lo dice con su visto; en la portada, sin cuenta, invita a crearla.
 */
export async function AsiSeSepara({ conCuenta = false }: { conCuenta?: boolean }) {
  const sedes = await leerSedes();
  const pasos = pasosParaSeparar(
    sedes.map((s) => s.nombre),
    conCuenta,
  );
  return (
    <section className="t-sec t-ancho ay-asi" aria-labelledby="asi-se-separa">
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
      <LineaDePasos pasos={pasos} />
    </section>
  );
}
