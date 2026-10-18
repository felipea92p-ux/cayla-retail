"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PantallaAventurero } from "@/components/ui/Aventurero";
import { Boton } from "@/components/ui/campos";
import { msHastaReintentar } from "@/lib/base-caida-reglas";

/** Cuánto se espera la respuesta de una pregunta antes de darla por no recibida. */
const MS_TOPE_DE_LA_PREGUNTA = 8_000;

/**
 * «Sin conexión con la base» (ADR-0450). La base no respondió y la sesión sigue abierta: aquí se espera, sin pedir contraseña, y cuando
 * `/api/salud` dice que la base contesta, vuelve sola a la pantalla de la que se salió (`desde`, ya validada por la página).
 *
 * Cuida a la base justo cuando está más frágil: cada aparato pregunta cada vez más espaciado y con un margen al azar
 * (`msHastaReintentar`), y una pestaña que nadie está mirando no pregunta (al volver a verla, pregunta enseguida). Ninguna pregunta
 * abre el loader de pantalla completa (`x-espera: no`, ADR-0149).
 */
export function SinBase({ desde }: { desde: string }) {
  const [preguntando, setPreguntando] = useState(false);
  const [segundos, setSegundos] = useState<number | null>(null);
  const [volviendo, setVolviendo] = useState(false);
  const intento = useRef(0);
  const reloj = useRef<number | undefined>(undefined);
  const cuenta = useRef<number | undefined>(undefined);
  const enCurso = useRef(false);
  // La espera vuelve a llamar a `preguntar`, que es quien la programa: se guarda en una referencia para no nombrarla dentro de sí misma.
  const volverAPreguntar = useRef<() => void>(() => {});

  const detenerRelojes = useCallback(() => {
    window.clearTimeout(reloj.current);
    window.clearInterval(cuenta.current);
    setSegundos(null);
  }, []);

  const preguntar = useCallback(async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    detenerRelojes();
    setPreguntando(true);
    let responde = false;
    try {
      const control = new AbortController();
      const corte = window.setTimeout(() => control.abort(), MS_TOPE_DE_LA_PREGUNTA);
      const respuesta = await fetch("/api/salud", { cache: "no-store", headers: { "x-espera": "no" }, signal: control.signal });
      window.clearTimeout(corte);
      responde = respuesta.ok;
    } catch {
      responde = false;
    }
    enCurso.current = false;
    setPreguntando(false);
    if (responde) {
      setVolviendo(true);
      // Una carga completa y no `router.replace`: tras una caída, lo que la pantalla traía a medias no sirve.
      window.location.replace(desde);
      return;
    }
    // `intento.current` cuenta las preguntas sin respuesta que ya hubo: la primera espera es la corta (~8 s) y cada una crece.
    const espera = msHastaReintentar(intento.current, Math.random());
    intento.current += 1;
    const hasta = Date.now() + espera;
    setSegundos(Math.ceil(espera / 1000));
    cuenta.current = window.setInterval(() => setSegundos(Math.max(0, Math.ceil((hasta - Date.now()) / 1000))), 1000);
    reloj.current = window.setTimeout(() => {
      // Una pestaña escondida no pregunta: lo hará al volver a verse.
      if (document.visibilityState === "visible") volverAPreguntar.current();
      else detenerRelojes();
    }, espera);
  }, [desde, detenerRelojes]);

  useEffect(() => {
    volverAPreguntar.current = () => void preguntar();
  }, [preguntar]);

  useEffect(() => {
    // La primera pregunta, al llegar: la base pudo volver mientras se redirigía.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void preguntar();
    // Al volver a ver la pestaña, pregunta ya (si había una espera corriendo, `preguntar` la cancela).
    const alVolverALaPestana = () => {
      if (document.visibilityState === "visible" && !enCurso.current) void preguntar();
    };
    document.addEventListener("visibilitychange", alVolverALaPestana);
    return () => {
      document.removeEventListener("visibilitychange", alVolverALaPestana);
      window.clearTimeout(reloj.current);
      window.clearInterval(cuenta.current);
    };
  }, [preguntar]);

  return (
    <PantallaAventurero motivo="error">
      <p className="label-cayla text-[11px] text-taupe-profundo">Sin conexión con la base</p>
      <h1 className="font-display mt-2 text-2xl text-tinta sm:text-3xl">No logramos conectar con el sistema</h1>
      <p className="mt-3 text-sm text-tinta/75 sm:text-base">
        Tu sesión sigue abierta y lo que ya habías guardado no se pierde. Esta pantalla vuelve sola cuando el sistema responda: no hace falta
        escribir tu contraseña otra vez.
      </p>
      <p className="mt-2 text-sm text-tinta/75 sm:text-base">Si pasan más de unos minutos, avisa a un líder de equipo.</p>

      <p className="mt-4 text-sm text-tinta/75" role="status" aria-live="polite">
        {volviendo
          ? "El sistema respondió. Volviendo…"
          : preguntando
            ? "Preguntando si ya responde…"
            : segundos !== null
              ? `Todavía sin respuesta. Vuelvo a preguntar en ${segundos}\u00a0s.`
              : ""}
      </p>

      <div className="mt-4 flex justify-center">
        <Boton type="button" peso="primario" cargando={preguntando || volviendo} textoCargando={volviendo ? "Volviendo…" : "Preguntando…"} onClick={() => void preguntar()}>
          Reintentar ahora
        </Boton>
      </div>
    </PantallaAventurero>
  );
}
