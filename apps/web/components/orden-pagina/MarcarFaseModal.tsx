"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { traducirError } from "@/lib/error-escritura";
import { RPC_MARCAR_FASE, type FasePagina, type OrdenPagina } from "@/lib/orden-pagina-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Ploteo hecho» (ADR-0400 act. k y l, R1): una fase que se MARCA en vez de contar prendas (Ploteo, la marcada a escala real). Un solo control, quién lo hace: la base firma cada
// escritura (ADR-0161/0162). Marcar es una fila que solo se agrega (`marcar_fase_hecha`); nada se borra. Quitar la marca ya no vive aquí: es de un líder y con motivo, en
// «Quitar la marca» (`CambioConMotivoModal`, ADR-0586 act. 2). No decide nada: la base rechaza lo que no se puede (`marca_ya_hecha`, `orden_cerrada`) y `traducirError` lo dice
// en palabras de tienda.

export function MarcarFaseModal({ datos, fase, onClose }: { datos: OrdenPagina; fase: FasePagina; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable({ ubicacionId: datos.orden.ubicacionId, etiqueta: datos.orden.ubicacionNombre });
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current) return;
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    enVuelo.current = true;
    setCargando(true);
    let fallo: Parameters<typeof traducirError>[0] = null;
    try {
      const cliente = createClient();
      const { error } = await firmar(cliente.rpc(RPC_MARCAR_FASE as never, { p_fase_id: fase.id } as never), responsable.firma());
      responsable.despues(error);
      fallo = error;
    } finally {
      enVuelo.current = false;
    }
    setCargando(false);
    if (fallo) {
      avisar.error(traducirError(fallo, `marcar ${fase.nombre} como hecho`, { confirmarAntesDeRepetir: true }));
      router.refresh();
      return;
    }
    avisar.exito(`${fase.nombre} quedó hecho`, { detalle: datos.orden.numeroTexto });
    onClose();
    router.refresh();
  }

  return (
    <Modal
      titulo={`¿Marcar ${fase.nombre} como hecho?`}
      subtitulo="No cuenta prendas: queda anotado quién lo marcó y cuándo."
      variante="hoja"
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="mt-3.5 space-y-4">
        <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
        <PieAcciones>
          <Boton type="button" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton type="submit" peso="primario" cargando={cargando} textoCargando="Marcando…" disabled={!responsable.listo} title={responsable.motivo ?? undefined}>
            {`${fase.nombre} hecho`}
          </Boton>
        </PieAcciones>
      </form>
    </Modal>
  );
}
