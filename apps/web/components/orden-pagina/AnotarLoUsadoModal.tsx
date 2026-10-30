"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Modal, campoEtiqueta } from "@/components/ui/Modal";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { traducirError } from "@/lib/error-escritura";
import { camposDeLoUsado } from "@/lib/orden-pagina-guia";
import { cantidadConUnidad, type OrdenPagina } from "@/lib/orden-pagina-reglas";
import { RPC_ANOTAR_INSUMOS, comoSeAnota, lineasDeUso, pendientesDeAnotar, problemaDeLoUsado, textoDeLoUsado, usoDeLaFila, valorDeFabrica, type TelaDeLaOrden } from "@/lib/orden-tela-usada-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Anotar lo usado» de la tela y los avíos de la orden (ADR-0570, actividad 4; Felipe 2026-10-29: «¿cuánto quedó?» por color). Todo lo que falta anotar va en una sola hoja: de cada
// tela se escribe lo que QUEDÓ en el estante (se mide el rollo; lo usado es lo que había menos eso), de cada avío cuántos se usaron. Viene con lo que quedaría si se usó lo que pide el
// plan; una fila vacía no se anota. Todo viaja en UNA llamada (`anotar_insumos_de_la_orden`): la base descuenta de los lotes del más antiguo al más nuevo, todo o nada. Si apareció tela
// que no estaba anotada, primero «Encontré tela». Se anota con quien se elige en «Responsable». Un doble clic no anota dos veces: una marca síncrona corta la segunda llamada.

export function AnotarLoUsadoModal({ datos, onClose }: { datos: OrdenPagina; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable({ ubicacionId: datos.orden.ubicacionId, etiqueta: datos.orden.ubicacionNombre });
  const filas = useMemo(() => pendientesDeAnotar(datos.insumos), [datos.insumos]);
  const [escrito, setEscrito] = useState<Record<string, string>>(() => Object.fromEntries(filas.map((t) => [t.insumoId, valorDeFabrica(t)])));
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);

  const problema = filas.length === 0 ? "No queda nada por anotar en esta orden." : problemaDeLoUsado(filas, escrito);
  const guia = useGuiaCampos(camposDeLoUsado({ problema, responsableListo: responsable.listo }));
  const resumen = textoDeLoUsado(filas, escrito);

  // «¿Salir sin guardar?» (ADR-0136): la hoja nace con lo del plan, así que solo cuenta lo que la persona cambió.
  const fotoActual = fotoFormulario({ escrito });
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(fotoActual !== fotoAlAbrir, "Cambiaste lo que ibas a anotar y todavía no se guardó. Si cierras ahora, se pierde lo que cambiaste.");
  function cerrarTrasGuardar() {
    const guardiaFuera = avisoSalida.retirarYa();
    onClose();
    void guardiaFuera.then(() => router.refresh());
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current) return;
    if (problema) {
      avisar.error(problema);
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    enVuelo.current = true;
    setCargando(true);
    let resultado;
    try {
      resultado = await firmar(createClient().rpc(RPC_ANOTAR_INSUMOS as never, { p_produccion_id: datos.orden.id, p_lineas: lineasDeUso(filas, escrito), p_nota: null } as never), responsable.firma());
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      // Todo o nada: si la base no lo guardó, no se guardó ninguna; si la respuesta se perdió, no se sabe, y se pide mirar antes de repetir.
      avisar.error(traducirError(error, "anotar lo usado", { confirmarAntesDeRepetir: true }));
      return;
    }
    avisar.exito(resumen ?? "Anotaste lo usado", { detalle: `${datos.orden.numeroTexto} · ${datos.orden.producto.referencia}` });
    cerrarTrasGuardar();
  }

  const unidadLarga = (t: TelaDeLaOrden) => (t.unidad === "metro" ? "metros" : t.unidad === "unidad" ? "unidades" : t.unidad);
  // «Había 45 m · usaste 33 m (el plan pedía 32,45 m)»: lo que dice lo escrito, mientras se escribe.
  const pieDe = (t: TelaDeLaOrden) => {
    const { usado, problema: suyo } = usoDeLaFila(t, escrito[t.insumoId] ?? "");
    if (suyo) return suyo;
    const habia = `Había ${cantidadConUnidad(t.saldo, t.unidad)} en el estante`;
    if (usado === null) return `${habia} · vacío: no se anota ahora`;
    return comoSeAnota(t) === "quedo" ? `${habia} · usaste ${cantidadConUnidad(usado, t.unidad)} (el plan pedía ${cantidadConUnidad(t.falta, t.unidad)})` : `${habia} · el plan pedía ${cantidadConUnidad(t.falta, t.unidad)}`;
  };

  return (
    <Modal
      titulo="¿Cuánto quedó en el estante?"
      subtitulo="Mide lo que quedó de cada tela: lo usado es lo que había menos eso, y queda en la orden. De los avíos, cuántos usaste. El costo lo calcula el sistema."
      variante="hoja"
      tamano="ancha"
      onClose={onClose}
      antesDeCerrar={avisoSalida.pedirAccion}
    >
      <form onSubmit={onSubmit} className="mt-3.5 space-y-5">
        {filas.length === 0 ? (
          <p className="text-sm text-tinta/75">No queda nada por anotar: toda la tela y los avíos del plan ya están anotados.</p>
        ) : (
          <>
            <div data-guia="prod-orden-tela.cantidad">
              <CampoGuiado id="cantidades" guia={guia} className="space-y-3">
                <span className={campoEtiqueta}>{guia.etiqueta("cantidades", "Lo que quedó de cada tela y lo que usaste de cada avío")}</span>
                <div className="grid gap-3 sm:grid-cols-2">
                  {filas.map((t) => (
                    <CampoTexto
                      key={t.insumoId}
                      id={`usado-${t.insumoId}`}
                      etiqueta={comoSeAnota(t) === "quedo" ? `Quedó de ${t.nombre} (${unidadLarga(t)})` : `Usaste de ${t.nombre} (${unidadLarga(t)})`}
                      inputMode="decimal"
                      tono={usoDeLaFila(t, escrito[t.insumoId] ?? "").problema ? "error" : "neutro"}
                      pie={pieDe(t)}
                      value={escrito[t.insumoId] ?? ""}
                      onChange={(e) => setEscrito((u) => ({ ...u, [t.insumoId]: e.target.value }))}
                      maxLength={12}
                    />
                  ))}
                </div>
                {resumen && <p className="text-sm text-tinta">{resumen}.</p>}
              </CampoGuiado>
            </div>

            <div data-guia="prod-orden-tela.cierre" className="space-y-3">
              <CampoGuiado id="quien" guia={guia}>
                <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
              </CampoGuiado>
              <PieGuia guia={guia} listo="Todo listo para anotar." conFrase />
            </div>
          </>
        )}

        <div className="pie-hoja-fijo">
          <div className="pie-acciones border-t border-sand pt-3">
            <Boton type="button" onClick={() => avisoSalida.pedirAccion(onClose)}>
              Cancelar
            </Boton>
            {filas.length > 0 && (
              <Boton type="submit" peso="primario" cargando={cargando} textoCargando="Anotando…" disabled={!guia.puedeConfirmar} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
                Anotar
              </Boton>
            )}
          </div>
        </div>
      </form>
      {avisoSalida.aviso}
    </Modal>
  );
}
