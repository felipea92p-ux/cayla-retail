import type { ReactNode } from "react";
import { BENEFICIOS_DE_ENTRADA, CONFIANZA_ACCESO, PASOS_DE_ACCESO, PROMESA_ACCESO, type CaminoDeAcceso } from "@/lib/panel-entrada";
import { Icono } from "../Icono";
import { Isotipo } from "../Isotipo";
import { EntradaViva, PasosDeAcceso, TarjetaConTuNombre } from "./EntradaViva";
import { BotonCrearCuenta } from "./BotonCrearCuenta";

// «Entrar» y «Crear cuenta» en la dirección «A · Mostrador» (Felipe 2026-11-25, maqueta docs/maquetas/cuenta-profesional-2026-11): la
// pantalla marfil y tranquila de las tiendas de moda grandes, sin el rojo de fondo ni la tarjeta flotando. En «Entrar», las dos puertas
// lado a lado (entrar a la izquierda, «¿Primera vez en CAYLA?» a la derecha); en «Crear cuenta», el formulario y, al lado, la tarjeta del
// Club con el nombre de quien la crea y lo que gana. En el celular, una columna: el formulario primero. El rojo, solo en el botón
// principal. Estilos: app/estilos/cuenta-mostrador.css. Las páginas para volver a entrar («Olvidé mi contraseña», «Contraseña nueva»,
// «Restablecer mi acceso») usan el mismo marco desde el 2026-11-26, con los tres pasos al lado (`LadoDeAcceso`).

/**
 * El marco. `forma`: «entrar» (dos columnas iguales con una raya entre las dos), «crear» (el formulario y su lado, que se queda quieto;
 * en el celular, sin lado) o «acceso» (como «crear», pero en el celular el lado va debajo: los pasos dicen qué toca).
 */
export function PantallaDeCuenta({ forma, lado, children }: { forma: "entrar" | "crear" | "acceso"; lado: ReactNode; children: ReactNode }) {
  return (
    <EntradaViva>
      <div className="cu-pantalla" data-forma={forma}>
        <div className="cu-form">{children}</div>
        <div className="cu-raya" aria-hidden="true" />
        {lado}
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

/** El lado de «Crear cuenta»: la tarjeta del Club, con el nombre apenas el formulario lo sabe, y lo que se gana. */
export function LadoDelClub({ desde }: { desde: number }) {
  return (
    <aside className="cu-lado" aria-label="Lo que ganas con tu cuenta">
      <div className="cu-tarjeta">
        <TarjetaConTuNombre desde={desde} />
      </div>
      <Beneficios />
    </aside>
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
