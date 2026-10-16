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
import {
  RPC_DEVOLVER_INSUMO,
  RPC_REGISTRAR_CONSUMO,
  anotarConsumoEnLotes,
  cantidadDeFabrica,
  leerCantidad,
  problemaDeTelaUsada,
  telasDeLaOrden,
  textoAnotasteTela,
  type ModoDeTela,
} from "@/lib/orden-tela-usada-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Anotar lo que usaste» y «Devolver lo que sobró» de la tela y los avíos de la orden (ADR-0400, actividad 7). Lo que se anota sale del estante del Taller —de los lotes, el más antiguo primero— y
// queda en la orden: el costo de la tela y de los avíos lo calcula la base con lo realmente descontado, nadie lo teclea. Si lo que se usó cruza de un lote al siguiente, la hoja lo parte sola en
// las llamadas que la base pide (`anotarConsumoEnLotes`); si la tela se acaba a la mitad, lo ya anotado queda anotado y se dice cuánto falta. Devolver trae de vuelta lo que sobró, al lote del que salió.
// Se anota con quien se elige en «Responsable» (ADR-0161/0162). Un doble clic no anota dos veces: una marca síncrona corta la segunda llamada.

export function TelaUsadaModal({ datos, modo, insumoId, onClose }: { datos: OrdenPagina; modo: ModoDeTela; insumoId?: string; onClose: () => void }) {
  const router = useRouter();
  const devuelve = modo === "devolver";
  const responsable = useResponsable({ ubicacionId: datos.orden.ubicacionId, etiqueta: datos.orden.ubicacionNombre });
  const telas = useMemo(() => telasDeLaOrden(datos.insumos), [datos.insumos]);
  const candidatas = devuelve ? telas.filter((t) => t.usado > 0) : telas;
  const inicial = candidatas.find((t) => t.insumoId === insumoId) ?? candidatas.find((t) => (devuelve ? t.usado > 0 : t.falta > 0)) ?? candidatas[0] ?? null;
  const [elegida, setElegida] = useState(inicial?.insumoId ?? "");
  const tela = candidatas.find((t) => t.insumoId === elegida) ?? inicial;
  const [cantidad, setCantidad] = useState(!devuelve && inicial ? cantidadDeFabrica(inicial) : "");
  const [nota, setNota] = useState("");
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);

  const problema = tela ? problemaDeTelaUsada(tela, cantidad, modo) : "No hay nada que anotar.";
  const guia = useGuiaCampos(camposDeTelaUsada({ problema, responsableListo: responsable.listo }, devuelve));

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
    const t = candidatas.find((x) => x.insumoId === id);
    if (t && !devuelve) setCantidad(cantidadDeFabrica(t));
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
    let hecho = 0;
    let falta = n;
    let fallo: { message: string } | null = null;
    try {
      if (devuelve) {
        const { error } = await firmar(cliente.rpc(RPC_DEVOLVER_INSUMO as never, { p_produccion_id: datos.orden.id, p_insumo_id: tela.insumoId, p_cantidad: n, p_nota: notaFinal } as never), firma);
        if (error) fallo = error;
        else hecho = n;
      } else {
        const r = await anotarConsumoEnLotes(n, (c) => firmar(cliente.rpc(RPC_REGISTRAR_CONSUMO as never, { p_produccion_id: datos.orden.id, p_insumo_id: tela.insumoId, p_cantidad: c, p_nota: notaFinal } as never), firma));
        hecho = r.anotado;
        falta = r.falta;
        fallo = r.error;
      }
    } finally {
      enVuelo.current = false;
    }
    responsable.despues(fallo);
    setCargando(false);
    if (fallo) {
      const dicho = traducirError(fallo, devuelve ? "devolver al estante" : "anotar lo que usaste", { confirmarAntesDeRepetir: hecho === 0 });
      avisar.error(hecho > 0 ? `Se anotaron ${cantidadConUnidad(hecho, tela.unidad)} de ${cantidadConUnidad(n, tela.unidad)}. Faltan ${cantidadConUnidad(falta, tela.unidad)}: ${dicho}` : dicho);
      if (hecho > 0) router.refresh();
      return;
    }
    avisar.exito(textoAnotasteTela(tela, hecho, modo), { detalle: `${datos.orden.numeroTexto} · ${datos.orden.producto.referencia}` });
    cerrarTrasGuardar();
  }

  const unidad = tela ? (tela.unidad === "metro" ? "metros" : tela.unidad === "unidad" ? "unidades" : tela.unidad) : "";
  return (
    <Modal
      titulo={devuelve ? "¿Cuánto devuelves al estante?" : "¿Cuánto usaste?"}
      subtitulo={devuelve ? "Lo que sobró vuelve al lote del que salió, a su mismo costo." : "Sale del estante del Taller y queda en la orden. El costo lo calcula el sistema con lo que realmente se usó."}
      variante="hoja"
      tamano="mediana"
      onClose={onClose}
      antesDeCerrar={avisoSalida.pedirAccion}
    >
      <form onSubmit={onSubmit} className="mt-3.5 space-y-5">
        {candidatas.length === 0 || !tela ? (
          <p className="text-sm text-tinta/75">{devuelve ? "Esta orden no tiene nada descontado: no hay nada que devolver." : "Esta orden no declaró qué tela ni qué avíos lleva."}</p>
        ) : (
          <>
            <div data-guia="prod-orden-tela.cantidad" className="space-y-4">
              {candidatas.length > 1 ? (
                <CampoSelect etiqueta="Qué tela o avío" valor={tela.insumoId} onValor={cambiarTela} opciones={candidatas.map((t) => ({ valor: t.insumoId, texto: t.nombre }))} />
              ) : (
                <p className="font-display text-xl text-tinta">{tela.nombre}</p>
              )}
              <CampoGuiado id="cantidad" guia={guia}>
                <CampoTexto
                  id="tela-cantidad"
                  etiqueta={guia.etiqueta("cantidad", devuelve ? `Cuántos ${unidad} devuelves` : `Cuántos ${unidad} usaste`)}
                  inputMode="decimal"
                  pie={`El plan pide ${cantidadConUnidad(tela.plan, tela.unidad)} · ya se ${tela.usado === 1 ? "usó" : "usaron"} ${cantidadConUnidad(tela.usado, tela.unidad)} · en el estante hay ${cantidadConUnidad(tela.saldo, tela.unidad)}`}
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  maxLength={12}
                />
              </CampoGuiado>
              <CampoTexto id="tela-nota" etiqueta="Nota" pie="Opcional" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />
            </div>

            <div data-guia="prod-orden-tela.cierre" className="space-y-3">
              <CampoGuiado id="quien" guia={guia}>
                <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
              </CampoGuiado>
              <PieGuia guia={guia} listo={devuelve ? "Todo listo para devolver." : "Todo listo para anotar."} conFrase />
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
                {devuelve ? "Devolver" : "Anotar"}
              </Boton>
            )}
          </div>
        </div>
      </form>
      {avisoSalida.aviso}
    </Modal>
  );
}
