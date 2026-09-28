"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { destinoQueSaleDeLaPantalla } from "@/lib/salida-sin-guardar";

/* ====================================================================
   useSalidaSinGuardar · «¿Salir sin guardar?» (2026-09-28)

   Un formulario con cambios sin guardar no se pierde en silencio por ninguna de las cuatro puertas:
     1. un enlace del ERP (menú lateral, «← Productos») → se frena el clic y se pregunta con <Modal>;
     2. un botón propio que sale («Cancelar») → llama a `pedirSalir(destino)`;
     3. la flecha atrás del navegador (o el gesto en el teléfono) → se deja una entrada de historial «de guardia»:
        al volver, se repone y se pregunta; si confirma, se retrocede de verdad;
     4. cerrar o recargar la pestaña → el aviso nativo del navegador (el único que se permite ahí).
   Sin cambios no hace nada: ni guardia en el historial ni aviso.

   Quien guarda con éxito llama a `soltar()` antes de navegar, para que su propia salida no pregunte.
   ==================================================================== */

type Destino = { tipo: "ruta"; ruta: string } | { tipo: "atras" };

export function useSalidaSinGuardar(conCambios: boolean) {
  const router = useRouter();
  const [pendiente, setPendiente] = useState<Destino | null>(null);
  // Refs y no estado: los escuchadores se registran una vez y leen siempre el valor del momento.
  const hayCambios = useRef(conCambios);
  const saliendo = useRef(false);
  const conGuardia = useRef(false);
  useEffect(() => {
    hayCambios.current = conCambios;
  }, [conCambios]);
  /** ¿Hay algo que perder ahora mismo? Se pregunta en el momento del clic, no al dibujar. */
  const debePreguntar = useCallback(() => hayCambios.current && !saliendo.current, []);

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

  // 4. Cerrar o recargar la pestaña.
  useEffect(() => {
    if (!conCambios) return;
    const alDescargar = (e: BeforeUnloadEvent) => {
      if (!debePreguntar()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", alDescargar);
    return () => window.removeEventListener("beforeunload", alDescargar);
  }, [conCambios, debePreguntar]);

  // 1. Enlaces. En la captura de `window`: corre antes que el `onClick` de <Link> (React escucha en su raíz).
  useEffect(() => {
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
  }, [debePreguntar]);

  // 3. Atrás. La guardia se pone recién con el primer cambio (sin cambios, «atrás» sale como siempre) y copia el
  //    `history.state` de Next para que su router no pierda el árbol de la pantalla.
  useEffect(() => {
    if (!conCambios || conGuardia.current) return;
    window.history.pushState(window.history.state, "", window.location.href);
    conGuardia.current = true;
  }, [conCambios]);
  useEffect(() => {
    const alVolver = () => {
      if (!conGuardia.current || !debePreguntar()) return;
      window.history.pushState(window.history.state, "", window.location.href);
      setPendiente({ tipo: "atras" });
    };
    window.addEventListener("popstate", alVolver);
    return () => window.removeEventListener("popstate", alVolver);
  }, [debePreguntar]);

  function confirmarSalida() {
    const destino = pendiente;
    soltar();
    setPendiente(null);
    if (!destino) return;
    if (destino.tipo === "ruta") router.push(destino.ruta);
    // Dos pasos: la guardia repuesta y la entrada de esta pantalla.
    else window.history.go(-2);
  }

  const aviso = pendiente ? (
    <Modal titulo="¿Salir sin guardar?" onClose={() => setPendiente(null)}>
      {(cerrar) => (
        <div className="mt-3 space-y-5">
          <p className="text-sm text-tinta/75">Hiciste cambios en esta ficha que todavía no se guardaron. Si sales ahora, se pierden.</p>
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

  return { pedirSalir, soltar, aviso };
}
