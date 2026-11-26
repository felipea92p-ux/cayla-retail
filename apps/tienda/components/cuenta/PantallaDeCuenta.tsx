import Image from "next/image";
import type { ReactNode } from "react";
import { BENEFICIOS_DE_ENTRADA, CONFIANZA_ACCESO, PASOS_DE_ACCESO, PROMESA_ACCESO, type CaminoDeAcceso } from "@/lib/panel-entrada";
import { Icono } from "../Icono";
import { Isotipo } from "../Isotipo";
import { EntradaViva, PasosDeAcceso } from "./EntradaViva";
import { BotonCrearCuenta } from "./BotonCrearCuenta";
import fotoDeEntrada from "./foto-de-entrada.jpg";

// «Entrar» y «Crear cuenta» en la dirección «A · Mostrador» (Felipe 2026-11-25, maqueta docs/maquetas/cuenta-profesional-2026-11): la
// pantalla marfil y tranquila de las tiendas de moda grandes, sin el rojo de fondo ni la tarjeta flotando. Desde el 2026-11-26, como Zara
// y Aritzia, llevan una foto de campaña a media pantalla a la izquierda (`foto`): en «Entrar», a su lado van entrar y, debajo,
// «¿Primera vez en CAYLA?»; en «Crear cuenta», el formulario (la foto reemplazó a la tarjeta del Club). En el celular, sin foto: el
// formulario primero. El rojo, solo en el botón principal. Estilos: app/estilos/cuenta-mostrador.css. Las páginas para volver a entrar
// («Olvidé mi contraseña», «Contraseña nueva», «Restablecer mi acceso») usan el mismo marco, con los tres pasos al lado (`LadoDeAcceso`).

/**
 * El marco. `forma`: «entrar» (dos columnas iguales con una raya entre las dos), «crear» (el formulario y su lado, que se queda quieto;
 * en el celular, sin lado), «acceso» (como «crear», pero en el celular el lado va debajo: los pasos dicen qué toca) o «sola» (una columna
 * sin lado: «Cambiar mi correo» y «Eliminar mi cuenta», 2026-11-26).
 */
export function PantallaDeCuenta({
  forma,
  lado,
  foto = false,
  children,
}: {
  forma: "entrar" | "crear" | "acceso" | "sola";
  lado?: ReactNode;
  /** La foto de campaña a media pantalla, a la izquierda (como Zara y Aritzia; Felipe 2026-11-26). Solo desde 960 px. */
  foto?: boolean;
  children: ReactNode;
}) {
  return (
    <EntradaViva>
      <div className="cu-pantalla" data-forma={forma} data-foto={foto ? "" : undefined}>
        {foto && (
          // Decorativa: el lector de pantalla no la anuncia. Recorte «B» (centrada en la persona), elegido mirando el 2026-11-26.
          <div className="cu-foto" aria-hidden="true">
            <Image src={fotoDeEntrada} alt="" fill priority sizes="(min-width: 960px) 50vw, 1px" placeholder="blur" />
          </div>
        )}
        <div className="cu-form">{children}</div>
        {lado && (
          <>
            <div className="cu-raya" aria-hidden="true" />
            {lado}
          </>
        )}
      </div>
    </EntradaViva>
  );
}

/** Los tres beneficios: el ícono en su círculo suave, el título y una línea (`corto`: solo el título). */
function Beneficios({ corto = false }: { corto?: boolean }) {
  return (
    <ul className="cu-beneficios">
      {BENEFICIOS_DE_ENTRADA.map((b) => (
        <li key={b.titulo}>
          <span className="cu-beneficio-ic" aria-hidden="true">
            <Icono nombre={b.icono} />
          </span>
          <span>
            <b>{b.titulo}</b>
            {!corto && <small>{b.texto}</small>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** La otra puerta de «Entrar»: quien llega sin cuenta ve qué gana y el botón para crearla. */
export function LadoPrimeraVez() {
  return (
    <section className="cu-lado" aria-labelledby="cu-primera-vez">
      <p className="cu-ceja">
        <Isotipo className="cu-colibri" />
        Club CAYLA
      </p>
      <h2 id="cu-primera-vez" className="cu-lado-t">
        ¿Primera vez en CAYLA?
      </h2>
      <p className="cu-linea">Crea tu cuenta y únete al Club.</p>
      <Beneficios />
      <BotonCrearCuenta />
    </section>
  );
}

/**
 * El lado de las páginas para volver a entrar: los tres pasos del camino, con el que toca encendido (`actual`, desde 0; el formulario lo
 * mueve al avanzar), y lo que tranquiliza: la cuenta y lo que tiene siguen ahí.
 */
export function LadoDeAcceso({ camino, actual }: { camino: CaminoDeAcceso; actual: number }) {
  return (
    <aside className="cu-lado cu-lado-acceso" aria-labelledby="cu-acceso">
      <p className="cu-ceja">
        <Isotipo className="cu-colibri" />
        {PROMESA_ACCESO.ceja}
      </p>
      <h2 id="cu-acceso" className="cu-lado-t">
        {PROMESA_ACCESO.linea} {PROMESA_ACCESO.cursiva}
      </h2>
      <PasosDeAcceso pasos={PASOS_DE_ACCESO[camino]} inicial={actual} />
      <p className="cu-confianza">
        <Icono nombre="check" />
        {CONFIANZA_ACCESO}
      </p>
    </aside>
  );
}
