import type { ReactNode } from "react";
import {
  BENEFICIOS_DE_ENTRADA,
  CONFIANZA_ACCESO,
  CONFIANZA_CLUB,
  PASOS_DE_ACCESO,
  PROMESA_ACCESO,
  PROMESA_CLUB,
  type CaminoDeAcceso,
} from "@/lib/panel-entrada";
import { Icono } from "../Icono";
import { Isotipo } from "../Marca";
import { TarjetaClub } from "../TarjetaClub";
import { EntradaViva, PasosDeAcceso, TarjetaConTuNombre } from "./EntradaViva";

// La pantalla partida de «Entrar», «Crear cuenta» y las páginas para volver a entrar (revisión «a nivel mundial», Felipe 2026-10-16):
// desde 960 px, el panel de marca a la izquierda (los colores de la campaña de la portada, el colibrí, la promesa) y el formulario a la
// derecha; en el celular, el formulario primero y el panel debajo, para que nada lo empuje fuera de la primera pantalla. En el código
// el formulario va primero: un lector de pantalla y el teclado llegan antes a lo que hay que hacer. Estilos: app/estilos/entrada.css.

/**
 * El marco partido. `alto`: «largo» para un formulario que pasa de una pantalla (el de crear la cuenta), que empieza arriba; «corto»
 * lo centra. `ancho`: «ancho» para el formulario de crear la cuenta, con más campos por fila.
 */
export function PantallaDeEntrada({
  panel,
  alto = "corto",
  ancho = "angosto",
  children,
}: {
  panel: ReactNode;
  alto?: "corto" | "largo";
  ancho?: "angosto" | "ancho";
  children: ReactNode;
}) {
  return (
    <EntradaViva>
      <div className="en-partida" data-alto={alto} data-ancho={ancho}>
        <div className="en-lado">
          <div className="en-form">{children}</div>
        </div>
        {panel}
      </div>
    </EntradaViva>
  );
}

/** Lo que va arriba en los dos paneles: la ceja con el colibrí, y la promesa (con su última parte en cursiva). */
function Promesa({ id, ceja, linea, cursiva }: { id: string; ceja: string; linea: string; cursiva: string }) {
  return (
    <div className="en-promesa">
      <span className="en-ceja">
        <Isotipo className="en-colibri" />
        {ceja}
      </span>
      <h2 id={id} className="en-promesa-t">
        {linea} <em>{cursiva}</em>
      </h2>
    </div>
  );
}

/**
 * El panel del Club, al lado de «Entrar» y «Crear cuenta»: la promesa, los tres beneficios y la tarjeta del Club. En «Crear cuenta»
 * (`nombreVivo`) la tarjeta lleva el nombre de quien la crea apenas el formulario lo sabe.
 */
export function PanelDelClub({ desde, nombreVivo = false }: { desde: number; nombreVivo?: boolean }) {
  return (
    <aside className="en-panel" data-panel="club" aria-labelledby="en-panel-club">
      <div className="en-panel-in">
        <Promesa id="en-panel-club" {...PROMESA_CLUB} />
        <ul className="en-beneficios">
          {BENEFICIOS_DE_ENTRADA.map((b) => (
            <li key={b.titulo}>
              <span className="en-beneficio-ic">
                <Icono nombre={b.icono} />
              </span>
              <span>
                <b>{b.titulo}</b>
                <small>{b.texto}</small>
              </span>
            </li>
          ))}
        </ul>
        <div className="en-tarjeta">
          {nombreVivo ? <TarjetaConTuNombre desde={desde} /> : <TarjetaClub nombre="Tu nombre aquí" desde={desde} />}
        </div>
        <p className="en-confianza">
          <Icono nombre="traslado" />
          {CONFIANZA_CLUB}
        </p>
      </div>
    </aside>
  );
}

/**
 * El panel de las páginas para volver a entrar: los tres pasos del camino, con el que toca encendido (`actual`, desde 0; el formulario
 * lo mueve al avanzar), y lo que tranquiliza: la cuenta y lo que tiene siguen ahí.
 */
export function PanelDeAcceso({ camino, actual }: { camino: CaminoDeAcceso; actual: number }) {
  return (
    <aside className="en-panel" data-panel="acceso" aria-labelledby="en-panel-acceso">
      <div className="en-panel-in">
        <Promesa id="en-panel-acceso" {...PROMESA_ACCESO} />
        <PasosDeAcceso pasos={PASOS_DE_ACCESO[camino]} inicial={actual} />
        <p className="en-confianza">
          <Icono nombre="check" />
          {CONFIANZA_ACCESO}
        </p>
      </div>
    </aside>
  );
}
