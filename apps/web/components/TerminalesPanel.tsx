"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Terminal } from "@/lib/colaboradores";
import type { Ubicacion } from "@/lib/ubicaciones";
import type { RolVista } from "@/lib/roles-reglas";
import type { ResultadoClave } from "@/lib/terminales-alta";
import type { EntradaTerminal } from "@/lib/terminales-reglas";
import { cambiarClaveTerminal, crearTerminal } from "@/app/actions/terminales";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { TablaTerminales } from "@/components/ColaboradoresTablas";
import { CambiarClaveModal, NuevaTerminalModal } from "@/components/TerminalesModales";

// Colaboradores ▸ Terminales (ADR-0162; sin tipo y creadas desde aquí desde el 2026-09-22, decisión de Felipe). Aparatos
// de cada tienda con cuenta propia y SIN persona. Aquí se crean (tienda + nombre + rol), se les cambia la clave, el rol, y
// se desactivan o reactivan. Crear y cambiar la clave pasan por una Server Action (`app/actions/terminales.ts`) que primero
// pregunta a la base si quien llama es líder y recién ahí usa la llave de servicio. Desactivar/Reactivar y Cambiar rol
// siguen en `ColaboradoresPanel` (sus modales ya existían) y llegan como `onAlternar` / `onCambiarRol`.

export type AccionesTerminales = {
  crear: (entrada: EntradaTerminal) => Promise<ResultadoClave>;
  cambiarClave: (terminalId: string) => Promise<ResultadoClave>;
};

export const accionesTerminalesServidor: AccionesTerminales = {
  crear: (entrada) => crearTerminal(entrada),
  cambiarClave: (terminalId) => cambiarClaveTerminal({ terminalId }),
};

type Modal = { tipo: "nueva" } | { tipo: "clave"; terminal: Terminal };

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="font-display card-cayla py-8 text-center text-base italic text-tinta/65">{children}</p>;
}

export function TerminalesPanel({
  terminales,
  ubicaciones,
  roles,
  ocupadoId,
  onAlternar,
  onCambiarRol,
  acciones = accionesTerminalesServidor,
  alActualizar,
}: {
  /** `null` = no se pudieron leer (p. ej. la base aún no tiene la migración); el resto de la pantalla sigue. */
  terminales: Terminal[] | null;
  ubicaciones: Ubicacion[];
  roles: RolVista[] | null;
  ocupadoId: string | null;
  onAlternar: (t: Terminal) => void;
  onCambiarRol?: (t: Terminal) => void;
  acciones?: AccionesTerminales;
  alActualizar?: () => void;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<Modal | null>(null);
  // La lista se refresca al CERRAR el paso de la clave, no al crearla: refrescar con el modal abierto no cambia nada que se
  // vea y evita que la tabla salte detrás de la clave que se está leyendo.
  const [refrescarAlCerrar, setRefrescarAlCerrar] = useState(false);

  function cerrar() {
    setModal(null);
    if (refrescarAlCerrar) {
      setRefrescarAlCerrar(false);
      (alActualizar ?? (() => router.refresh()))();
    }
  }

  return (
    <section aria-label="Terminales" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-tinta/70">
          Aparatos compartidos de cada tienda. No son personas: lo que ven lo decide su rol, y lo que hacen lo firma quien se elige como responsable.
        </p>
        <Boton peso="primario" onClick={() => setModal({ tipo: "nueva" })} disabled={terminales === null}>
          + Nueva terminal
        </Boton>
      </div>
      {terminales === null ? (
        <Vacio>No se pudieron leer las terminales. Lo demás de esta pantalla sí está al día.</Vacio>
      ) : terminales.length === 0 ? (
        <Vacio>Ninguna tienda tiene una terminal todavía.</Vacio>
      ) : (
        <TablaTerminales
          filas={terminales}
          ocupadoId={ocupadoId}
          onAlternar={onAlternar}
          onCambiarClave={(t) => setModal({ tipo: "clave", terminal: t })}
          onCambiarRol={onCambiarRol}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card-cayla px-4 py-3.5 text-[13.5px] leading-relaxed text-tinta/80">
          <p className="label-cayla text-[11px] text-taupe-profundo">La clave</p>
          <p className="mt-1.5">
            Se ve <strong className="font-semibold text-tinta">una sola vez</strong>, al crear la terminal o al cambiarla: se escribe en el aparato y no se
            guarda en ningún otro lado.
          </p>
        </div>
        <div className="card-cayla px-4 py-3.5 text-[13.5px] leading-relaxed text-tinta/80">
          <p className="label-cayla text-[11px] text-taupe-profundo">Si se pierde el aparato</p>
          <p className="mt-1.5">
            <strong className="font-semibold text-tinta">Desactivar</strong> corta su sesión al instante. Si alguien deja la tienda no hace falta cambiar la clave:
            sin marcar su entrada no puede firmar.
          </p>
        </div>
      </div>

      {modal?.tipo === "nueva" && (
        <NuevaTerminalModal
          ubicaciones={ubicaciones}
          roles={roles}
          terminales={terminales ?? []}
          crear={acciones.crear}
          onCreada={(nombre) => {
            setRefrescarAlCerrar(true);
            avisar.exito("Terminal creada", { detalle: `${nombre} ya puede iniciar sesión.` });
          }}
          onClose={cerrar}
        />
      )}
      {modal?.tipo === "clave" && (
        <CambiarClaveModal
          terminal={modal.terminal}
          cambiar={acciones.cambiarClave}
          onCambiada={(nombre) => {
            setRefrescarAlCerrar(true);
            avisar.exito("Clave cambiada", { detalle: `La clave anterior de ${nombre} ya no sirve.` });
          }}
          onClose={cerrar}
        />
      )}
    </section>
  );
}
