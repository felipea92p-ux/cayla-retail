"use client";

import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { Modal } from "@/components/ui/Modal";
import { Volver } from "@/components/ui/Volver";
import type { ControlResponsable } from "@/lib/useResponsable";

// «¿Quién va a contar?»: lo primero que se ve al entrar a Contar en una terminal (un aparato sin persona). Sin responsable la base rechaza
// todo guardado («Elige quién hace esta operación»), y el combo vivía al fondo del resumen, donde nadie lo veía. La hoja no se cierra por su
// cuenta (ni con Escape ni con el velo): se va al elegir —el padre deja de dibujarla cuando el responsable queda listo— o saliendo de la pantalla.

export function ElegirQuienCuenta({ responsable, sede }: { responsable: ControlResponsable; sede: string }) {
  const router = useRouter();
  return (
    <Modal
      titulo={
        // La flecha va ANTES del título, en su misma línea (Felipe 2026-11-03): la vuelta a Recibir, para quien entró por error.
        <span className="flex items-center gap-3">
          <Volver onClick={() => router.push("/recibir")} a="Volver a Recibir" />
          ¿Quién va a contar?
        </span>
      }
      subtitulo={`Todo lo que cuentes en ${sede} queda a su nombre. Elígelo para empezar.`}
      onClose={() => {}}
      bloqueado
      tamano="angosta"
    >
      {() => <ComboResponsable control={responsable} />}
    </Modal>
  );
}
