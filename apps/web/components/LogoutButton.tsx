"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { borrarCopiasSinConexion } from "@/components/SinConexion";
import { Modal } from "@/components/ui/Modal";
import { leerPendientesSinSubir } from "@/lib/usePendientesSinSubir";

export function LogoutButton() {
  const router = useRouter();
  const [preguntando, setPreguntando] = useState<{ pendientes: number; rechazadas: number } | null>(null);

  async function salir() {
    // Las copias de pantallas para usar sin internet (ADR-0207) tienen datos de esta cuenta: se van con ella. Lo que
    // espera en las colas sin conexión NO se borra: es trabajo de la tienda que todavía no subió.
    await borrarCopiasSinConexion();
    // «local»: cierra solo este equipo. El valor por defecto («global») revoca la sesión de la cuenta en TODOS
    // los equipos, y las cuentas de caja se comparten entre la tienda y otros dispositivos.
    await createClient().auth.signOut({ scope: "local" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => {
          // Con algo guardado sin conexión todavía en este equipo, se pregunta antes (ADR-0207, «huecos»): al salir no se
          // pierde, pero subirá recién cuando alguien vuelva a entrar AQUÍ, con su propia sesión.
          const cuenta = leerPendientesSinSubir();
          if (cuenta.pendientes + cuenta.rechazadas > 0) setPreguntando(cuenta);
          else void salir();
        }}
        className="label-cayla text-[11px] text-tinta/70 transition-colors hover:text-rojo"
      >
        Salir
      </button>
      {preguntando && (
        <Modal
          titulo="Hay trabajo sin subir en este equipo"
          subtitulo={
            preguntando.pendientes > 0
              ? `${preguntando.pendientes === 1 ? "1 operación guardada sin conexión espera" : `${preguntando.pendientes} operaciones guardadas sin conexión esperan`} subir.`
              : `${preguntando.rechazadas === 1 ? "1 operación no pudo subir" : `${preguntando.rechazadas} operaciones no pudieron subir`} y espera${preguntando.rechazadas === 1 ? "" : "n"} que alguien la revise.`
          }
          onClose={() => setPreguntando(null)}
        >
          <div className="space-y-4">
            <p className="text-sm text-tinta/75">
              Si sales, no se pierde: queda en este equipo y sube la próxima vez que alguien entre aquí con internet. Lo mejor es esperar a que suba (o
              revisar lo rechazado) antes de salir.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setPreguntando(null)} className="btn-cayla btn-primario">
                Quedarme
              </button>
              <button type="button" onClick={() => void salir()} className="btn-cayla btn-secundario">
                Salir igual
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
