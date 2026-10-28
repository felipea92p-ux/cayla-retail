"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { destinoQueSaleDeLaPantalla, registrarGuardia } from "@/lib/salida-sin-guardar";
import { MARCA_HOJA } from "@/lib/hojas-atras";
import { cuandoSinHojas, hojasEnElHistorial, useHojasEnElHistorial } from "@/components/ui/useAtrasCierraLaHoja";

/* ====================================================================
   useSalidaSinGuardar · «¿Salir sin guardar?» (2026-09-28)

   Un formulario con cambios sin guardar no se pierde en silencio por ninguna de estas puertas:
     1. un enlace del ERP (menú lateral, «← Productos») → se frena el clic y se pregunta con <Modal>;
     2. un botón propio que sale («Cancelar») → `pedirSalir(destino)`;
     3. un gesto que descarta sin salir de la pantalla (cerrar un modal con Escape, el velo o la ✕) → `pedirAccion(fn)`;
     4. la flecha atrás del navegador (o el gesto en el teléfono) → una entrada de historial «de guardia»: al volver, se
        repone y se pregunta; si confirma, se retrocede de verdad;
     5. cerrar o recargar la pestaña → el aviso nativo del navegador (el único que se permite ahí).
   Sin cambios no hace nada. La guardia se retira sola cuando ya no hay nada que perder (el cambio se deshizo, se guardó
   y la pantalla se limpió, o el modal se cerró), para que «atrás» no pida dos toques.

   Quien guarda y NAVEGA llama a `soltar()` antes, para que su propia salida no pregunte ni toque el historial.

   `{ soloAlCerrar: true }`: solo la puerta 3, para una hoja que vive dentro de una pantalla que ya cuida el «atrás» con su propia
   guardia (la hoja de la prenda de «Compré ropa»). Dos guardias en el historial a la vez preguntaban dos veces por el mismo gesto.

   La puerta 4 cede ante las hojas del teléfono (ADR-0528): mientras haya una hoja que cierra con «atrás» (toda `<Modal>` y `<Cajon>`
   bajo 640 px) o una entrada suya en el historial, la guardia no se pone ni se retira, y su `popstate` no pregunta. Así un formulario
   que vive en una hoja no pone guardia nunca en el teléfono: su «atrás» cierra la hoja y pregunta por la puerta 3 (`antesDeCerrar`).
   Y la guardia de una pantalla entera (Nuevo producto) espera a que se cierre la hoja que se abrió encima para ponerse.
   ==================================================================== */

type Destino = { tipo: "ruta"; ruta: string } | { tipo: "atras" } | { tipo: "accion"; hacer: () => void };

/** Lo que se pierde, dicho como lo diría la pantalla. Por defecto, la ficha que se está editando. */
const QUE_SE_PIERDE = "Hiciste cambios en esta ficha que todavía no se guardaron. Si sales ahora, se pierden.";

/** Marca de la entrada de guardia en `history.state`: solo se retira una entrada que pusimos nosotros. */
const MARCA = "__guardiaSalida";
const esGuardia = () => Boolean((window.history.state as Record<string, unknown> | null)?.[MARCA]);
/** El estado de la guardia: el de Next (para que su router no pierda el árbol) con la MARCA. Sin la marca de una hoja: copiada,
 *  la entrada pasaría por la de esa hoja (ADR-0528). */
function estadoDeGuardia() {
  const estado: Record<string, unknown> = { ...(window.history.state ?? {}), [MARCA]: true };
  delete estado[MARCA_HOJA];
  return estado;
}
/** El `popstate` que provoca retirar la guardia no es la persona pulsando «atrás»: se ignora una vez. */
let ignorarProximoPop = false;
/** Quien espera a que la guardia termine de irse (`retirarYa`): se avisa con ESE popstate. */
let alRetirarse: (() => void) | null = null;
function guardiaRetirada() {
  ignorarProximoPop = false;
  const avisar = alRetirarse;
  alRetirarse = null;
  avisar?.();
}

/* Ese `popstate` propio tampoco le llega al router de Next (2026-10-08). Retirar la guardia vuelve a la MISMA URL, así que no
   hay nada que restaurar; pero Next restaura el árbol guardado en la entrada de abajo, y esa entrada puede ser vieja: Existencias
   cambia sus filtros con `history.replaceState`, sin navegar, y la entrada sigue con el árbol de antes de la búsqueda. Con ese
   árbol Next volvía a montar la pantalla entera (se perdía la vista elegida, la página, lo abierto) y, si en ese instante corría
   el `router.refresh()` del guardado, recargaba la página completa. Visto al bajar al piso: el panel se cerraba solo, la lista
   volvía a las tarjetas y el aviso de «listo» se perdía con la recarga.
   Se escucha en la CAPTURA de `window`: en el destino, los escuchadores de captura corren antes que el de Next (que escucha sin
   captura), y `stopImmediatePropagation` corta a todos los demás, también a los `alVolver` de los formularios montados, que de
   todos modos lo ignoraban. Se instala una sola vez, al cargar el módulo. */
if (typeof window !== "undefined") {
  window.addEventListener(
    "popstate",
    (e) => {
      if (!ignorarProximoPop) return;
      guardiaRetirada();
      e.stopImmediatePropagation();
    },
    { capture: true }
  );
}

export function useSalidaSinGuardar(
  conCambios: boolean,
  mensaje: string = QUE_SE_PIERDE,
  { soloAlCerrar = false }: { soloAlCerrar?: boolean } = {}
) {
  const router = useRouter();
  // Con `soloAlCerrar`, las puertas del historial, los enlaces y la pestaña no se instalan: no hay cambios que cuidar ahí.
  const vigilaSalidas = conCambios && !soloAlCerrar;
  const vigilaAtras = vigilaSalidas;
  // Con una hoja del teléfono abierta, «atrás» es suyo: la guardia espera (ver arriba).
  const conHojas = useHojasEnElHistorial();
  const [pendiente, setPendiente] = useState<Destino | null>(null);
  // Refs y no estado: los escuchadores se registran una vez y leen siempre el valor del momento.
  const hayCambios = useRef(conCambios);
  const saliendo = useRef(false);
  const conGuardia = useRef(false);
  const urlGuardia = useRef("");
  useEffect(() => {
    hayCambios.current = conCambios;
  }, [conCambios]);
  /** ¿Hay algo que perder ahora mismo? Se pregunta en el momento del gesto, no al dibujar. Con una guía interactiva en curso no hay nada que
   *  perder: lo que el piloto escribió o eligió es de la demo (que nunca guarda), y preguntar dejaba la hoja abierta bajo el resto de la guía. */
  const debePreguntar = useCallback(() => hayCambios.current && !saliendo.current && !document.querySelector("[data-guia-motor]"), []);

  const soltar = useCallback(() => {
    saliendo.current = true;
  }, []);

  const pedirSalir = useCallback(
    (ruta: string) => {
      if (!debePreguntar()) return void router.push(ruta);
      setPendiente({ tipo: "ruta", ruta });
    },
    [router, debePreguntar]
  );

  const pedirAccion = useCallback(
    (hacer: () => void) => {
      if (!debePreguntar()) return void hacer();
      setPendiente({ tipo: "accion", hacer });
    },
    [debePreguntar]
  );

  // 6. Lo que rehace la pantalla sin navegar (el selector de sede) pregunta a esta guardia antes (`antesDeRehacerLaPantalla`).
  useEffect(() => registrarGuardia({ debePreguntar, pedirAccion }), [debePreguntar, pedirAccion]);

  // 5. Cerrar o recargar la pestaña.
  useEffect(() => {
    if (!vigilaSalidas) return;
    const alDescargar = (e: BeforeUnloadEvent) => {
      if (!debePreguntar()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", alDescargar);
    return () => window.removeEventListener("beforeunload", alDescargar);
  }, [vigilaSalidas, debePreguntar]);

  // 1. Enlaces. En la captura de `window`: corre antes que el `onClick` de <Link> (React escucha en su raíz).
  useEffect(() => {
    if (soloAlCerrar) return;
    const alClic = (e: MouseEvent) => {
      if (!debePreguntar()) return;
      const enlace = (e.target as Element | null)?.closest?.("a");
      if (!enlace) return;
      const ruta = destinoQueSaleDeLaPantalla(
        {
          boton: e.button,
          conTecla: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey,
          yaAtendido: e.defaultPrevented,
          href: enlace.getAttribute("href"),
          target: enlace.getAttribute("target"),
          descarga: enlace.hasAttribute("download"),
        },
        window.location.href
      );
      if (!ruta) return;
      e.preventDefault();
      e.stopPropagation();
      setPendiente({ tipo: "ruta", ruta });
    };
    window.addEventListener("click", alClic, true);
    return () => window.removeEventListener("click", alClic, true);
  }, [debePreguntar, soloAlCerrar]);

  // 4. Atrás. La guardia se pone con el primer cambio y se retira cuando ya no hay cambios. Copia el `history.state` de
  //    Next (para que su router no pierda el árbol de la pantalla) y le suma la MARCA.
  const retirarGuardia = useCallback(() => {
    // Encima está la entrada de una hoja: un «atrás» se la llevaría a ella. Se retira cuando la hoja se va (el efecto de abajo).
    if (!conGuardia.current || hojasEnElHistorial()) return;
    conGuardia.current = false;
    if (esGuardia() && window.location.href === urlGuardia.current) {
      // La bandera la apaga ESE popstate, en el escuchador de captura de arriba, aunque ya no quede ningún formulario
      // escuchando (un modal que se cerró): sin eso, el primer «atrás» del próximo formulario se tragaba sin preguntar.
      ignorarProximoPop = true;
      window.history.back();
    }
  }, []);
  /** Retira la guardia AHORA y avisa cuando el navegador terminó de volver. Para quien guardó y va a refrescar: el
   *  `router.refresh()` tiene que correr DESPUÉS de ese «atrás», nunca a la vez. Si corren juntos, Next puede caer a una
   *  recarga completa de la página (visto al bajar al piso en Existencias con una búsqueda recién escrita, 2026-10-08). */
  const retirarYa = useCallback((): Promise<void> => {
    hayCambios.current = false;
    if (!conGuardia.current) return Promise.resolve();
    return new Promise<void>((listo) => {
      alRetirarse = listo;
      retirarGuardia();
      // No había entrada que retirar (otra navegación ya la sacó), o el popstate nunca llega: no se espera para siempre.
      if (!ignorarProximoPop) return guardiaRetirada();
      window.setTimeout(() => {
        if (alRetirarse === listo) guardiaRetirada();
      }, 600);
    });
  }, [retirarGuardia]);
  useEffect(() => {
    if (saliendo.current || conHojas) return;
    if (vigilaAtras && !conGuardia.current) {
      urlGuardia.current = window.location.href;
      window.history.pushState(estadoDeGuardia(), "", window.location.href);
      conGuardia.current = true;
    } else if (!vigilaAtras) {
      retirarGuardia();
    }
  }, [vigilaAtras, conHojas, retirarGuardia]);
  useEffect(() => {
    const alVolver = () => {
      // Respaldo: el escuchador de captura ya corta este popstate; un navegador que no corra la captura primero lo deja pasar.
      if (ignorarProximoPop) {
        guardiaRetirada();
        return;
      }
      if (!conGuardia.current || !debePreguntar() || hojasEnElHistorial()) return;
      window.history.pushState(estadoDeGuardia(), "", window.location.href);
      setPendiente({ tipo: "atras" });
    };
    window.addEventListener("popstate", alVolver);
    return () => {
      window.removeEventListener("popstate", alVolver);
      // El formulario desaparece (un modal que se cerró) sin que nadie haya navegado: su guardia sobra. Se mira DESPUÉS
      // de que asiente la navegación que pudo desmontarlo: si Next ya empujó otra entrada, no es nuestra y no se toca.
      if (conGuardia.current && !saliendo.current) window.setTimeout(retirarGuardia, 0);
    };
  }, [debePreguntar, retirarGuardia]);

  const seguirEditando = useCallback(() => setPendiente(null), []);

  function confirmarSalida() {
    const destino = pendiente;
    setPendiente(null);
    if (!destino) return;
    // Descartar sin salir (cerrar el modal): la guardia se retira sola cuando el formulario se va.
    if (destino.tipo === "accion") return void destino.hacer();
    soltar();
    // La pregunta es una hoja: en el teléfono tiene su entrada encima de la guardia. Se sale cuando la retiró (ADR-0528).
    cuandoSinHojas(() => {
      if (destino.tipo === "ruta") router.push(destino.ruta);
      // Dos pasos: la guardia repuesta y la entrada de esta pantalla.
      else window.history.go(-2);
    });
  }

  const aviso = pendiente ? (
    <Modal titulo="¿Salir sin guardar?" onClose={seguirEditando}>
      {(cerrar) => (
        <div className="mt-3 space-y-5">
          <p className="text-sm text-tinta/75">{mensaje}</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Boton type="button" peso="fantasma" className="flex-1" onClick={confirmarSalida}>
              Salir sin guardar
            </Boton>
            <Boton type="button" peso="primario" className="flex-1" onClick={cerrar} autoFocus>
              Seguir editando
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  ) : null;

  return { pedirSalir, pedirAccion, soltar, retirarYa, aviso };
}
