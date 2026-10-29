"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { traducirError } from "@/lib/error-escritura";
import type { InsumoVista } from "@/lib/insumos";
import { motivoParaNoRetirar, RPC_RETIRAR_COLOR } from "@/lib/retirar-color-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Retirar color» (ADR-0554): un color de tela que se eligió por error deja de salir en la lista de Insumos. NO se borra nada: conserva su código, sus lotes y su historial (el libro de movimientos es solo de
// agregar). Es del líder (la base lo exige; el botón solo se ofrece a él). La base se niega si el color tiene saldo, está en una orden en proceso, tiene tela por recibir o es parte de la receta de un modelo, y
// `traducirError` dice cuál en palabras de tienda; aquí solo se adelanta lo del saldo, que la pantalla ya sabe. Un solo control, quién lo retira: la base firma cada escritura (ADR-0161/0162).
// Retirar dos veces es inofensivo (la base lo dice «ya estaba»), así que repetir tras un corte de red no duplica nada.

export function RetirarColorModal({ insumo, tallerId, onClose }: { insumo: InsumoVista; tallerId: string; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);
  const motivoSaldo = motivoParaNoRetirar({ saldo: insumo.saldo, unidad: insumo.unidad });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current || motivoSaldo) return;
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    enVuelo.current = true;
    setCargando(true);
    let fallo: Parameters<typeof traducirError>[0] = null;
    let yaEstaba = false;
    try {
      // La función es nueva (ADR-0554) y los tipos generados todavía no la traen: la llamada se tipa a mano, como `editar_material`.
      const { data, error } = await firmar(createClient().rpc(RPC_RETIRAR_COLOR as never, { p_insumo_id: insumo.id, p_ubicacion_id: tallerId } as never), responsable.firma());
      responsable.despues(error);
      fallo = error;
      yaEstaba = !error && !!(data as { ya_estaba?: boolean } | null)?.ya_estaba;
    } finally {
      enVuelo.current = false;
    }
    setCargando(false);
    if (fallo) {
      avisar.error(traducirError(fallo, "retirar el color", { confirmarAntesDeRepetir: true }));
      // Lo que la base dice (saldo nuevo, una orden que se abrió) puede ser más nuevo que la pantalla: se pone al día sin cerrar la hoja.
      router.refresh();
      return;
    }
    avisar.exito(yaEstaba ? `${insumo.nombre} ya estaba retirado` : `${insumo.nombre} salió de la lista`, { detalle: "No se borró nada: conserva su código y su historial." });
    onClose();
    router.refresh();
  }

  return (
    <Modal titulo={`¿Retirar «${insumo.nombre}»?`} subtitulo="Deja de salir en la lista de Insumos. No se borra nada: conserva su código y su historial." variante="hoja" onClose={onClose}>
      <form onSubmit={onSubmit} className="mt-3.5 space-y-4">
        {motivoSaldo ? (
          <Aviso tono="atencion" chico>
            {motivoSaldo}
          </Aviso>
        ) : (
          <p className="nota-cayla">Desde la pantalla no se vuelve a mostrar: si lo necesitas otra vez, hay que pedirlo aparte.</p>
        )}
        <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
        <PieAcciones>
          <Boton type="button" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton type="submit" peso="peligro" cargando={cargando} textoCargando="Retirando…" disabled={!responsable.listo || !!motivoSaldo} title={motivoSaldo ?? responsable.motivo ?? undefined}>
            Retirar color
          </Boton>
        </PieAcciones>
      </form>
    </Modal>
  );
}
