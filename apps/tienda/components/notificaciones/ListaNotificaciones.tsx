"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { borrarAvisosDelPanel, borrarTodasLasNotificaciones } from "@/app/acciones/campanita";
import { Icono } from "../Icono";
import { cookieDeClave, PREFIJO_LEIDO } from "@/lib/campanita";
import "@/app/estilos/campanita.css";

export type FilaNotificacion = {
  clave: string;
  tipo: "llego" | "respuesta";
  titulo: string;
  texto: string;
  href: string;
  /** Cuándo la recibió la cuenta (ISO). */
  recibidoEn: string;
  /** ¿Todavía no se leyó en profundidad? (su punto de color). */
  sinVer: boolean;
};

/** Escribe una cookie de este aparato (leído). Si el navegador no deja guardar, no pasa nada. */
function marcarLeidaEnEsteAparato(clave: string) {
  try {
    document.cookie = cookieDeClave(PREFIJO_LEIDO, clave, location.protocol === "https:");
  } catch {
    // El navegador no deja guardar: la notificación queda con su punto.
  }
}

/** «19 oct., 2:50 p. m.», en hora de Lima. */
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Lima" });

/**
 * La lista de «Todas las notificaciones»: cada una con su casilla para elegirla, su «×» para quitarla, y arriba «Eliminar seleccionadas» y
 * «Eliminar todas». Borrar marca la notificación en el historial de la cuenta (no sale más aquí ni en el panel). Hacer clic en una la deja
 * leída en este aparato y lleva a su prenda o a la respuesta.
 */
export function ListaNotificaciones({ filas, total, busqueda }: { filas: FilaNotificacion[]; total: number; busqueda: string }) {
  const router = useRouter();
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [, iniciar] = useTransition();

  function alternar(clave: string) {
    setSeleccion((actual) => {
      const nueva = new Set(actual);
      if (nueva.has(clave)) nueva.delete(clave);
      else nueva.add(clave);
      return nueva;
    });
  }

  function borrar(claves: string[]) {
    iniciar(async () => {
      await borrarAvisosDelPanel(claves);
      setSeleccion(new Set());
      router.refresh();
    });
  }

  function borrarTodas() {
    if (!window.confirm("¿Eliminar todas tus notificaciones?")) return;
    iniciar(async () => {
      await borrarTodasLasNotificaciones();
      setSeleccion(new Set());
      router.refresh();
    });
  }

  return (
    <section className="n-lista-caja" aria-label="Tus notificaciones">
      <div className="n-barra">
        <span>
          {total === 1 ? "1 notificación" : `${total} notificaciones`}
          {busqueda ? ` para «${busqueda}»` : ""}
        </span>
        <div className="n-acciones">
          <button type="button" className="t-btn t-btn-sec" disabled={seleccion.size === 0} onClick={() => borrar([...seleccion])}>
            Eliminar seleccionadas{seleccion.size > 0 ? ` (${seleccion.size})` : ""}
          </button>
          <button type="button" className="t-btn t-btn-peligro" disabled={total === 0} onClick={borrarTodas}>
            Eliminar todas
          </button>
        </div>
      </div>

      {filas.length === 0 ? (
        <p className="n-vacio">
          {busqueda ? "No encontramos notificaciones con esa búsqueda." : "Todavía no tienes notificaciones. Cuando una talla que esperabas llegue o el equipo te responda, aparece aquí."}
        </p>
      ) : (
        <ul className="n-lista">
          {filas.map((f) => (
            <li key={f.clave} className="n-fila">
              <input
                type="checkbox"
                className="n-casilla"
                aria-label={`Seleccionar: ${f.titulo}`}
                checked={seleccion.has(f.clave)}
                onChange={() => alternar(f.clave)}
              />
              <Link className="n-enlace" href={f.href} onClick={() => marcarLeidaEnEsteAparato(f.clave)}>
                <span className="n-ic" aria-hidden="true">
                  <Icono nombre={f.tipo === "respuesta" ? "chat" : "campana"} />
                </span>
                <span className="n-txt">
                  <b>{f.titulo}</b>
                  <small>{f.texto}</small>
                  <time dateTime={f.recibidoEn}>{fechaHora(f.recibidoEn)}</time>
                </span>
                {f.sinVer ? <span className="t-avisos-punto" role="img" aria-label="Sin leer" /> : null}
              </Link>
              <button type="button" className="t-avisos-borrar" aria-label={`Eliminar: ${f.titulo}`} onClick={() => borrar([f.clave])}>
                <Icono nombre="cerrar" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
