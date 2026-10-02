"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/ui/Avisos";
import { avisoGuardado, CLAVE_AVISO_DE_SESION, decidirAccionDeSesion, DESTINO_DE_ACCION } from "@/lib/sesion-entre-pestanas-reglas";

/* ====================================================================
   SesionEntrePestanas · una cuenta por navegador (ADR-0307)

   Montado UNA vez en `app/layout.tsx`. La sesión vive en cookies compartidas: si en una pestaña alguien sale y entra con
   otra cuenta, las demás seguían mostrando el menú y los datos de la anterior. Acá cada pestaña recuerda con qué cuenta
   se dibujó y, cuando la cuenta del navegador cambia, se va sola a /login (se cerró) o al inicio (entró otra), y allí un aviso dice por qué.

   Se entera por dos vías, porque ninguna sola alcanza: los avisos de autenticación de Supabase (que ya viajan entre
   pestañas) y, al volver a mirar la pestaña, una lectura de la cuenta de las cookies (cubre una pestaña dormida o un
   navegador sin esos avisos). El trabajo guardado sin conexión vive en el equipo y no se pierde al irse.
   ==================================================================== */
export function SesionEntrePestanas() {
  const pathname = usePathname();
  const idMio = useRef<string | null>(null);

  // El salto recarga la página y se lleva cualquier aviso en pantalla: el motivo queda anotado y lo cuenta la pantalla
  // de destino (el aviso espera solo a que termine el loader general, ADR-0149).
  useEffect(() => {
    try {
      const aviso = avisoGuardado(sessionStorage.getItem(CLAVE_AVISO_DE_SESION));
      sessionStorage.removeItem(CLAVE_AVISO_DE_SESION);
      if (aviso) avisar.aviso(aviso.texto, { detalle: aviso.detalle });
    } catch {
      // Sin sessionStorage (ventana privada, datos bloqueados): se va igual, solo que sin el aviso.
    }
  }, []);

  // Cada navegación de ESTA pestaña (entrar desde /login, salir) vuelve a anotar con qué cuenta está. Un cambio hecho
  // en otra pestaña no navega esta, así que no la pisa.
  useEffect(() => {
    let vivo = true;
    void createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (vivo) idMio.current = data.session?.user.id ?? null;
      });
    return () => {
      vivo = false;
    };
  }, [pathname]);

  useEffect(() => {
    const supabase = createClient();
    let yendo = false;

    async function comprobar() {
      if (yendo) return;
      const { data } = await supabase.auth.getSession();
      const accion = decidirAccionDeSesion(idMio.current, data.session?.user.id ?? null);
      if (accion === "nada") return;
      yendo = true;
      try {
        sessionStorage.setItem(CLAVE_AVISO_DE_SESION, accion);
      } catch {
        // ver arriba: el aviso es un extra, el salto no depende de él
      }
      window.location.assign(DESTINO_DE_ACCION[accion]);
    }

    const { data: suscripcion } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "TOKEN_REFRESHED") return;
      void comprobar();
    });
    const alVolver = () => {
      if (document.visibilityState === "visible") void comprobar();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    return () => {
      suscripcion.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, []);

  return null;
}
