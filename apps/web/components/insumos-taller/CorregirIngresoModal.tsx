"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { avisar } from "@/components/ui/Avisos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Boton, CampoMonto, CampoTexto } from "@/components/ui/campos";
import { Modal, campoEtiqueta } from "@/components/ui/Modal";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { traducirError } from "@/lib/error-escritura";
import { diaMes, hoyLima } from "@/lib/fechas-lima";
import {
  MAX_MOTIVO_INGRESO,
  MAX_TEXTO_INGRESO,
  MOTIVOS_CORREGIR_INGRESO,
  RPC_CORREGIR_INGRESO,
  RPC_ELIMINAR_INGRESO,
  cambiosDelIngreso,
  escritoDeFabrica,
  ingresoLeido,
  problemaDeMotivoIngreso,
  problemasDelIngreso,
  resumenDeCambios,
  type IngresoEditable,
} from "@/lib/ingreso-insumo-reglas";
import type { InsumoVista } from "@/lib/insumos";
import { camposDeCorreccionDeIngreso } from "@/lib/insumos-guia";
import { UNIDADES_INSUMO, cantidadTexto, type LoteConSaldo } from "@/lib/insumos-reglas";
import { COSTO_UNITARIO_ILEGIBLE, costoUnitarioIlegible } from "@/lib/monto-plata-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Corregir un ingreso» de Insumos (ADR-0570, actividad 6a; Felipe 2026-10-29: «que me permita editar con facilidad, también eliminar con historial de cambio y comentario para entender qué pasó»).
// La hoja nace con el lote tal como quedó —cantidad, costo, día, documento y código— y se cambia lo que estaba mal, siempre con el porqué (a un toque o con tus palabras). «Eliminar», en la misma hoja
// y a la izquierda del pie (como en la orden), saca el ingreso de la estantería con el mismo motivo; la lista de abajo lo guarda con su «Restaurar». Nada se borra: la base deja el ingreso original en el
// libro y escribe el par «deshago + anoto», con el antes y el después en la historia (`corregir_ingreso_insumo`, `eliminar_ingreso_insumo`). Solo se deja en un lote que NADIE usó: el botón que abre esta hoja
// ya se apaga con la razón cuando de él salió material; la base repite la regla (`ingreso_no_corregible`) y es la última palabra. Un doble clic no escribe dos veces: una marca síncrona corta la segunda llamada.

export function CorregirIngresoModal({ insumo, lote, veCostos, onClose }: { insumo: InsumoVista; lote: LoteConSaldo; veCostos: boolean; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const unidad = UNIDADES_INSUMO[insumo.unidad];
  const original = useMemo<IngresoEditable>(
    () => ({ cantidad: lote.cantidadIngresada, costo: veCostos ? lote.costoUnitario : null, fecha: lote.ingreso, documento: lote.documento, codigo: lote.codigo }),
    [lote, veCostos]
  );
  const [escrito, setEscrito] = useState(() => escritoDeFabrica(original));
  const [porque, setPorque] = useState("");
  const [cargando, setCargando] = useState<"corregir" | "eliminar" | null>(null);
  const [hoy] = useState(() => hoyLima());
  const enVuelo = useRef(false);

  const problemas = problemasDelIngreso(escrito, original, { veCostos, hoy });
  const leido = ingresoLeido(escrito, original, { veCostos, hoy });
  const hayCambios = leido !== null && cambiosDelIngreso(original, leido).alguno;
  const problemaMotivo = problemaDeMotivoIngreso(porque);
  const costoIlegible = veCostos && costoUnitarioIlegible(escrito.costo);
  const guia = useGuiaCampos(camposDeCorreccionDeIngreso({ problemas, hayCambios, problemaMotivo, responsableListo: responsable.listo }));
  const poner = (campo: keyof typeof escrito, valor: string) => setEscrito((e) => ({ ...e, [campo]: valor }));

  // «¿Salir sin guardar?» (ADR-0136): la hoja nace con el lote tal como está, así que solo cuenta lo que la persona cambió.
  const fotoActual = fotoFormulario({ escrito, porque });
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(fotoActual !== fotoAlAbrir, "Cambiaste el ingreso y todavía no se guardó. Si cierras ahora, se pierde lo que cambiaste.");
  function cerrarTrasGuardar() {
    const guardiaFuera = avisoSalida.retirarYa();
    onClose();
    void guardiaFuera.then(() => router.refresh());
  }

  async function guardar(que: "corregir" | "eliminar") {
    if (enVuelo.current) return;
    const primero = que === "corregir" ? (problemas[0] ?? (hayCambios ? null : "No cambiaste nada todavía: si estaba bien, cierra la hoja.") ?? problemaMotivo) : problemaMotivo;
    if (primero) {
      avisar.error(primero);
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    if (que === "corregir" && !leido) return;
    enVuelo.current = true;
    setCargando(que);
    // Las funciones son nuevas (ADR-0570) y los tipos generados todavía no las traen: la llamada se tipa a mano, como `retirar_color_de_material`.
    const llamada =
      que === "corregir" && leido
        ? createClient().rpc(
            RPC_CORREGIR_INGRESO as never,
            {
              p_lote_id: lote.id,
              p_cantidad_antes: original.cantidad,
              p_cantidad: leido.cantidad,
              p_costo_unitario: veCostos ? leido.costo : null,
              p_fecha: leido.fecha,
              p_documento: leido.documento,
              p_codigo_lote: leido.codigo,
              p_motivo: porque.trim(),
            } as never
          )
        : createClient().rpc(RPC_ELIMINAR_INGRESO as never, { p_lote_id: lote.id, p_cantidad_antes: original.cantidad, p_motivo: porque.trim() } as never);
    let resultado;
    try {
      resultado = await firmar(llamada, responsable.firma());
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
    responsable.despues(error);
    setCargando(null);
    if (error) {
      // La base pudo guardar y la respuesta perderse: se dice que no se sabe y se pide mirar el libro antes de repetir.
      avisar.error(traducirError(error, que === "corregir" ? "corregir el ingreso" : "eliminar el ingreso", { confirmarAntesDeRepetir: true }));
      router.refresh();
      return;
    }
    if (que === "corregir" && leido) avisar.exito("Corregiste el ingreso", { detalle: `${insumo.nombre}${resumenDeCambios(original, leido, insumo.unidad) ? ` · ${resumenDeCambios(original, leido, insumo.unidad)}` : ""} · lo de antes queda en la historia` });
    else {
      // Si era el único saldo del color de una tela, ya se puede retirar: el aviso lo dice (de ahí salió esta hoja: «no me deja quitarlo porque tiene 9 metros»).
      const quedaEnCero = insumo.materialId && Math.abs(insumo.saldo - lote.cantidadIngresada) < 0.0005;
      avisar.exito(`Eliminaste el ingreso de ${cantidadTexto(lote.cantidadIngresada, insumo.unidad)}`, {
        detalle: quedaEnCero ? `${insumo.nombre} quedó sin saldo: ya puedes retirar el color. El ingreso sigue en la historia, con «Restaurar».` : `${insumo.nombre} · sigue en la historia, con «Restaurar»`,
      });
    }
    cerrarTrasGuardar();
  }

  return (
    <Modal
      titulo="Corregir este ingreso"
      subtitulo={`${insumo.nombre} · entró el ${diaMes(lote.ingreso)} con ${cantidadTexto(lote.cantidadIngresada, insumo.unidad)}. Cambia lo que estaba mal: lo de antes queda en la historia.`}
      variante="hoja"
      onClose={onClose}
      antesDeCerrar={avisoSalida.pedirAccion}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void guardar("corregir");
        }}
        className="mt-3.5 space-y-5"
      >
        <div data-guia="prod-insumos-corregir.cambios">
          <CampoGuiado id="cambios" guia={guia} className="space-y-3">
            <span className={campoEtiqueta}>{guia.etiqueta("cambios", "Qué corriges")}</span>
            <div className="grid gap-3 sm:grid-cols-2">
              <CampoTexto
                etiqueta={`Cantidad (${unidad.corta})`}
                id="corregir-ingreso-cantidad"
                inputMode="decimal"
                placeholder="0"
                value={escrito.cantidad}
                onChange={(e) => poner("cantidad", e.target.value)}
                tono={problemas.some((p) => p.includes("cantidad")) ? "error" : undefined}
                pie={problemas.find((p) => p.includes("cantidad")) ?? `Antes: ${cantidadTexto(original.cantidad, insumo.unidad)}`}
              />
              {veCostos && (
                <CampoMonto
                  etiqueta={`Costo por ${unidad.corta}`}
                  id="corregir-ingreso-costo"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={escrito.costo}
                  onChange={(e) => poner("costo", e.target.value)}
                  tono={costoIlegible ? "error" : undefined}
                  pie={costoIlegible ? COSTO_UNITARIO_ILEGIBLE : "sin IGV"}
                />
              )}
              <CampoFecha
                etiqueta="¿Qué día llegó?"
                id="corregir-ingreso-dia"
                valor={escrito.fecha}
                onValor={(v) => poner("fecha", v)}
                tono={problemas.some((p) => p.includes("día")) ? "error" : "neutro"}
                pie={problemas.find((p) => p.includes("día"))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <CampoTexto
                etiqueta="Documento"
                mono
                // sugerir-fijo: el formato de una factura (serie-número); no depende de nada elegido antes
                placeholder="F001-0000"
                value={escrito.documento}
                onChange={(e) => poner("documento", e.target.value)}
                maxLength={MAX_TEXTO_INGRESO}
              />
              <CampoTexto etiqueta="Código de lote" mono placeholder="Opcional" value={escrito.codigo} onChange={(e) => poner("codigo", e.target.value)} maxLength={MAX_TEXTO_INGRESO} />
            </div>
          </CampoGuiado>
        </div>

        <div data-guia="prod-insumos-corregir.porque">
          <CampoGuiado id="porque" guia={guia} className="space-y-2">
            <span className={campoEtiqueta}>{guia.etiqueta("porque", "¿Por qué lo cambias?")}</span>
            <div className="flex flex-wrap gap-2">
              {MOTIVOS_CORREGIR_INGRESO.map((m) => (
                <button key={m} type="button" className="pildora-cayla" aria-pressed={porque === m} onClick={() => setPorque(m)}>
                  {m}
                </button>
              ))}
            </div>
            <CampoTexto etiqueta="O cuéntalo con tus palabras" id="corregir-ingreso-porque" pie="Queda en la historia del ingreso" value={porque} onChange={(e) => setPorque(e.target.value)} maxLength={MAX_MOTIVO_INGRESO} />
          </CampoGuiado>
        </div>

        <div className="space-y-3">
          <CampoGuiado id="quien" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={cargando !== null} compacto />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para corregir." conFrase />
        </div>

        <div className="pie-hoja-fijo">
          <div className="border-t border-sand pt-3">
            <PieAcciones
              izquierda={
                <Boton
                  type="button"
                  peso="peligro"
                  data-guia="prod-insumos-corregir.eliminar"
                  cargando={cargando === "eliminar"}
                  textoCargando="Eliminando…"
                  disabled={cargando !== null}
                  title="Sale del estante y queda en la historia, con «Restaurar». Pide el mismo porqué."
                  onClick={() => void guardar("eliminar")}
                >
                  Eliminar el ingreso
                </Boton>
              }
            >
              <Boton type="button" onClick={() => avisoSalida.pedirAccion(onClose)}>
                Cancelar
              </Boton>
              <Boton
                type="submit"
                peso="primario"
                cargando={cargando === "corregir"}
                textoCargando="Guardando…"
                disabled={!guia.puedeConfirmar || cargando !== null}
                title={guia.frase ?? responsable.motivo ?? undefined}
                className={guia.claseConfirmar}
              >
                Guardar
              </Boton>
            </PieAcciones>
          </div>
        </div>
      </form>
      {avisoSalida.aviso}
    </Modal>
  );
}
