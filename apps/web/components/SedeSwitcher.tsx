"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cambiarSedeActiva } from "@/app/actions/sede";
import { Desplegable } from "@/components/ui/campos";

// Selector de sede del Líder: "pararse" en TRU, AQP, LIM o el Taller y que toda la
// app (caja, almacén, recibir) trabaje sobre esa sede. Las Encargadas no lo ven.
//
// Desde el 2026-09-09 usa el `Desplegable` del sistema y no un <select> nativo: era
// el último control de la cabecera con la lista gris que dibuja Windows, justo al
// lado del buscador y del lateral que ya hablan la gramática de CAYLA. El cambio de
// fondo no es visual — antes, mientras la app se repuntaba a la otra sede, lo único
// que avisaba era un `disabled:opacity-50`, o sea nada; ahora corre el barrido del
// hilo, que es lo que le dice a quien está en el mostrador que el sistema no se colgó.
export function SedeSwitcher({
  sedes,
  sedeActualId,
}: {
  sedes: { id: string; codigo: string }[];
  sedeActualId: string;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [valor, setValor] = useState(sedeActualId);

  return (
    <Desplegable
      forma="pastilla"
      // La lista crece con su contenido y se pega al borde derecho: el
      // disparador dice "TRU" y mide 60px, y una lista de 60px no se lee.
      alineacion="derecha"
      etiquetaAccesible="Cambiar de sede"
      valor={valor}
      opciones={sedes.map((s) => ({ valor: s.id, texto: s.codigo }))}
      trabajando={pendiente}
      onValor={(sedeId) => {
        setValor(sedeId);
        startTransition(async () => {
          await cambiarSedeActiva(sedeId);
          router.refresh();
        });
      }}
    />
  );
}
