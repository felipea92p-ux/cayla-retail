"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { traducirError } from "@/lib/error-escritura";
import { camposDeTelaUsada } from "@/lib/orden-pagina-guia";
import { cantidadConUnidad, type OrdenPagina } from "@/lib/orden-pagina-reglas";
import { RPC_DEVOLVER_INSUMO, leerCantidad, problemaDeTelaUsada, telasDeLaOrden, textoAnotasteTela } from "@/lib/orden-tela-usada-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Devolver lo que sobró» de la tela y los avíos de la orden (ADR-0400, actividad 7): lo que sobró vuelve al estante del Taller, al lote del que salió y a su mismo costo; el costo de la orden
// lo recalcula la base. Anotar lo usado vive aparte, en «¿Cuánto quedó en el estante?» (`AnotarLoUsadoModal`, ADR-0570 actividad 4): una sola hoja para todos los colores.
// Se anota con quien se elige en «Responsable» (ADR-0161/0162). Un doble clic no devuelve dos veces: una marca síncrona corta la segunda llamada.

export function TelaUsadaModal({ datos, onClose }: { datos: OrdenPagina; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable({ ubicacionId: datos.orden.ubicacionId, etiqueta: datos.orden.ubicacionNombre });
  const telas = useMemo(() => telasDeLaOrden(datos.insumos), [datos.insumos]);
  const candidatas = telas.filter((t) => t.usado > 0);
  const inicial = candidatas[0] ?? null;
  const [elegida, setElegida] = useState(inicial?.insumoId ?? "");
  const tela = candidatas.find((t) => t.insumoId === elegida) ?? inicial;
  const [cantidad, setCantidad] = useState("");
  const [nota, setNota] = useState("");
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);

  const problema = tela ? problemaDeTelaUsada(tela, cantidad, "devolver") : "No hay nada que anotar.";
  const guia = useGuiaCampos(camposDeTelaUsada({ problema, responsableListo: responsable.listo }, true));

  // «¿Salir sin guardar?» (ADR-0136): la hoja puede nacer con la cantidad del plan, así que solo cuenta lo que la persona cambió.
  const fotoActual = fotoFormulario({ elegida, cantidad, nota });
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(fotoActual !== fotoAlAbrir, "Cambiaste lo que ibas a anotar y todavía no se guardó. Si cierras ahora, se pierde lo que cambiaste.");
  function cerrarTrasGuardar() {
    const guardiaFuera = avisoSalida.retirarYa();
    onClose();
    void guardiaFuera.then(() => router.refresh());
  }

  function cambiarTela(id: string) {
    setElegida(id);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current || !tela) return;
    if (problema) {
      avisar.error(problema);
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    const n = leerCantidad(cantidad);
    if (n === null) return;
    enVuelo.current = true;
    setCargando(true);
    const firma = responsable.firma();
    const cliente = createClient();
    const notaFinal = nota.trim() === "" ? null : nota.trim();
    let fallo: { message: string } | null = null;
    try {
      const { error } = await firmar(cliente.rpc(RPC_DEVOLVER_INSUMO as never, { p_produccion_id: datos.orden.id, p_insumo_id: tela.insumoId, p_cantidad: n, p_nota: notaFinal } as never), firma);
      fallo = error;
    } finally {
      enVuelo.current = false;
    }
    responsable.despues(fallo);
    setCargando(false);
    if (fallo) {
      avisar.error(traducirError(fallo, "devolver al estante", { confirmarAntesDeRepetir: true }));
      return;
    }
    avisar.exito(textoAnotasteTela(tela, n, "devolver"), { detalle: `${datos.orden.numeroTexto} · ${datos.orden.producto.referencia}` });
    cerrarTrasGuardar();
  }

  const unidad = tela ? (tela.unidad === "metro" ? "metros" : tela.unidad === "unidad" ? "unidades" : tela.unidad) : "";
  return (
    <Modal
      titulo="¿Cuánto devuelves al estante?"
      subtitulo="Lo que sobró vuelve al lote del que salió, a su mismo costo."
      variante="hoja"
      tamano="mediana"
      onClose={onClose}
      antesDeCerrar={avisoSalida.pedirAccion}
    >
      <form onSubmit={onSubmit} className="mt-3.5 space-y-5">
        {candidatas.length === 0 || !tela ? (
          <p className="text-sm text-tinta/75">Esta orden no tiene nada descontado: no hay nada que devolver.</p>
        ) : (
          <>
            <div data-guia="prod-orden-devolver.cantidad" className="space-y-4">
              {candidatas.length > 1 ? (
                <CampoSelect etiqueta="Qué tela o avío" valor={tela.insumoId} onValor={cambiarTela} opciones={candidatas.map((t) => ({ valor: t.insumoId, texto: t.nombre }))} />
              ) : (
                <p className="font-display text-xl text-tinta">{tela.nombre}</p>
              )}
              <CampoGuiado id="cantidad" guia={guia}>
                <CampoTexto
                  id="tela-cantidad"
                  etiqueta={guia.etiqueta("cantidad", `Cuántos ${unidad} devuelves`)}
                  inputMode="decimal"
                  pie={`El plan pide ${cantidadConUnidad(tela.plan, tela.unidad)} · ya se ${tela.usado === 1 ? "usó" : "usaron"} ${cantidadConUnidad(tela.usado, tela.unidad)} · en el estante hay ${cantidadConUnidad(tela.saldo, tela.unidad)}`}
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  maxLength={12}
                />
              </CampoGuiado>
              <CampoTexto id="tela-nota" etiqueta="Nota" pie="Opcional" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />
            </div>

            <div data-guia="prod-orden-devolver.cierre" className="space-y-3">
              <CampoGuiado id="quien" guia={guia}>
                <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
              </CampoGuiado>
              <PieGuia guia={guia} listo="Todo listo para devolver." conFrase />
            </div>
          </>
        )}

        <div className="pie-hoja-fijo">
          <div className="pie-acciones border-t border-sand pt-3">
            <Boton type="button" onClick={() => avisoSalida.pedirAccion(onClose)}>
              Cancelar
            </Boton>
            {tela && (
              <Boton type="submit" peso="primario" cargando={cargando} textoCargando="Anotando…" disabled={!guia.puedeConfirmar} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
                Devolver
              </Boton>
            )}
          </div>
        </div>
      </form>
      {avisoSalida.aviso}
    </Modal>
  );
}
