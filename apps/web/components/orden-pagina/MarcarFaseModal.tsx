"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { traducirError } from "@/lib/error-escritura";
import { RPC_DESHACER_MARCA, RPC_MARCAR_FASE, type FasePagina, type OrdenPagina } from "@/lib/orden-pagina-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Ploteo hecho» y su «Deshacer» (ADR-0400 act. k y l, R1): una fase que se MARCA en vez de contar prendas (Ploteo, la marcada a escala real). Un solo control, quién lo hace: la base firma cada
// escritura (ADR-0161/0162). Marcar y deshacer son dos filas que solo se agregan (`marcar_fase_hecha`, `deshacer_marca_fase`); nada se borra. No decide nada: la base rechaza lo que no se puede
// (`marca_ya_hecha`, `marca_inexistente`, `orden_cerrada`) y `traducirError` lo dice en palabras de tienda.

export function MarcarFaseModal({ datos, fase, modo, onClose }: { datos: OrdenPagina; fase: FasePagina; modo: "marcar" | "deshacer"; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable({ ubicacionId: datos.orden.ubicacionId, etiqueta: datos.orden.ubicacionNombre });
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);
  const marcar = modo === "marcar";

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
      const { error } = await firmar(cliente.rpc((marcar ? RPC_MARCAR_FASE : RPC_DESHACER_MARCA) as never, { p_fase_id: fase.id } as never), responsable.firma());
      responsable.despues(error);
      fallo = error;
    } finally {
      enVuelo.current = false;
    }
    setCargando(false);
    if (fallo) {
      avisar.error(traducirError(fallo, marcar ? `marcar ${fase.nombre} como hecho` : `deshacer la marca de ${fase.nombre}`, { confirmarAntesDeRepetir: true }));
      router.refresh();
      return;
    }
    avisar.exito(marcar ? `${fase.nombre} quedó hecho` : `Deshiciste la marca de ${fase.nombre}`, { detalle: datos.orden.numeroTexto });
    onClose();
    router.refresh();
  }

  return (
    <Modal
      titulo={marcar ? `¿Marcar ${fase.nombre} como hecho?` : `¿Deshacer la marca de ${fase.nombre}?`}
      subtitulo={marcar ? "No cuenta prendas: queda anotado quién lo marcó y cuándo." : `${fase.nombre} vuelve a quedar por hacer.`}
      variante="hoja"
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="mt-3.5 space-y-4">
        <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
        <PieAcciones>
          <Boton type="button" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton type="submit" peso="primario" cargando={cargando} textoCargando={marcar ? "Marcando…" : "Deshaciendo…"} disabled={!responsable.listo} title={responsable.motivo ?? undefined}>
            {marcar ? `${fase.nombre} hecho` : "Deshacer la marca"}
          </Boton>
        </PieAcciones>
      </form>
    </Modal>
  );
}
