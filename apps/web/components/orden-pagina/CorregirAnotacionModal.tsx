"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MatrizCantidades } from "@/components/alta-producto/MatrizCantidades";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { FilasDeFalla } from "@/components/orden-pagina/FilasDeFalla";
import { avisar } from "@/components/ui/Avisos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Modal, campoEtiqueta } from "@/components/ui/Modal";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { traducirError } from "@/lib/error-escritura";
import { hoyLima } from "@/lib/fechas-lima";
import { camposDeCorreccion } from "@/lib/orden-pagina-guia";
import {
  MAX_MOTIVO_CAMBIO,
  MOTIVOS_CORREGIR,
  RPC_CORREGIR_ANOTACION,
  RPC_ELIMINAR_ANOTACION,
  buenasConFallas,
  cantidadesQueFaltan,
  correccionSinCambios,
  diaCorto,
  disponiblesParaCorregir,
  fallasDeLaAnotacion,
  fechaLimaDe,
  lineasDeFallas,
  problemaDeCantidadesCorregidas,
  problemaDeDia,
  problemaDeMotivoCambio,
  problemasDeFallas,
  totalFallas,
  type AnotacionCorregible,
  type FallaBorrador,
  type FasePagina,
  type OrdenPagina,
} from "@/lib/orden-pagina-reglas";
import { lineasDeModeloExistente, tablaDeModeloExistente } from "@/lib/orden-tabla-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Corregir» un «Terminé» de cualquier día (ADR-0570, actividad 3; Felipe 2026-10-29: «editar con facilidad, eliminar con historial de cambio y comentario para entender qué pasó»).
// La hoja nace con lo anotado tal como quedó —las buenas por talla y color, sus prendas con falla y su día— y se cambia lo que estaba mal. Siempre con el porqué, a un toque o con tus
// palabras. «Eliminar», en la misma hoja y a la izquierda del pie (como «Desactivar» en Catálogo), saca la anotación de la vista con el mismo motivo; la historia la cuenta y trae su
// «Restaurar». Nada se borra: la base deshace lo viejo y anota lo nuevo en un solo paso (`corregir_anotacion_orden`, `eliminar_anotacion_orden`), con las mismas reglas de «Terminé» y
// sin dejar a la fase siguiente con más prendas de las que le llegaron. Un doble clic no escribe dos veces: una marca síncrona corta la segunda llamada.

export function CorregirAnotacionModal({ datos, fase, anotacion, onClose }: { datos: OrdenPagina; fase: FasePagina; anotacion: AnotacionCorregible; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable({ ubicacionId: datos.orden.ubicacionId, etiqueta: datos.orden.ubicacionNombre });
  const disponibles = useMemo(() => disponiblesParaCorregir(cantidadesQueFaltan(fase, datos.fases), anotacion), [fase, datos.fases, anotacion]);
  const deFabrica = useMemo(() => fallasDeLaAnotacion(anotacion), [anotacion]);
  const [cantidades, setCantidades] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(anotacion.buenas).map(([id, n]) => [id, String(n)])));
  const [fallas, setFallas] = useState<FallaBorrador[]>(deFabrica.fallas);
  const [motivoFalla, setMotivoFalla] = useState(deFabrica.motivo);
  const [dia, setDia] = useState(anotacion.dia);
  const [porque, setPorque] = useState("");
  const [cargando, setCargando] = useState<"corregir" | "eliminar" | null>(null);
  const [hoy] = useState(() => hoyLima());
  const apertura = fechaLimaDe(datos.orden.creadoEn);
  const enVuelo = useRef(false);

  const tabla = useMemo(() => tablaDeModeloExistente(datos.lineas.map((l) => ({ varianteId: l.varianteId, talla: l.talla, color: l.colorNombre, colorHex: l.colorHex }))), [datos.lineas]);
  const lineasPorId = useMemo(() => new Map(datos.lineas.map((l) => [l.varianteId, l] as const)), [datos.lineas]);
  const nombreDe = (id: string) => {
    const l = lineasPorId.get(id);
    return l ? `${l.colorNombre ?? "Sin color"} · ${l.talla ?? "Única"}` : "esa talla y color";
  };
  const lineas = lineasDeModeloExistente(datos.lineas, cantidades);
  const opcionesVariante = datos.lineas.filter((l) => (disponibles[l.varianteId] ?? 0) > 0).map((l) => ({ valor: l.varianteId, texto: `${nombreDe(l.varianteId)} (caben ${disponibles[l.varianteId]})` }));
  const nombreMinuscula = fase.nombre.toLocaleLowerCase("es");

  const problemaCantidades = problemaDeCantidadesCorregidas(disponibles, cantidades, fallas, nombreDe);
  const problemasFallas = problemasDeFallas(disponibles, cantidades, fallas, motivoFalla, nombreDe);
  const problemaDiaElegido = problemaDeDia(dia, hoy, apertura);
  const sinCambios = correccionSinCambios(anotacion, cantidades, fallas, motivoFalla, dia);
  const problemaMotivo = problemaDeMotivoCambio(porque);
  const guia = useGuiaCampos(
    camposDeCorreccion({
      problemaCantidades,
      hayFallas: fallas.length > 0,
      problemaFallas: problemasFallas[0] ?? null,
      problemaDia: problemaDiaElegido,
      sinCambios,
      problemaMotivo,
      responsableListo: responsable.listo,
    })
  );

  // Una falla nueva baja sola las buenas de su talla y color (nunca las sube), como en «Terminé».
  function cambiarFallas(nuevas: FallaBorrador[]) {
    setFallas(nuevas);
    setCantidades((c) => buenasConFallas(disponibles, c, nuevas));
  }

  // «¿Salir sin guardar?» (ADR-0136): la hoja nace con lo anotado, así que solo cuenta lo que la persona cambió.
  const fotoActual = fotoFormulario({ cantidades, fallas, motivoFalla, dia, porque });
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(fotoActual !== fotoAlAbrir, "Cambiaste lo anotado y todavía no se guardó. Si cierras ahora, se pierde lo que cambiaste.");
  function cerrarTrasGuardar() {
    const guardiaFuera = avisoSalida.retirarYa();
    onClose();
    void guardiaFuera.then(() => router.refresh());
  }

  async function guardar(que: "corregir" | "eliminar") {
    if (enVuelo.current) return;
    const primero = que === "corregir" ? (problemaCantidades ?? problemasFallas[0] ?? problemaDiaElegido ?? (sinCambios ? "No cambiaste nada todavía: si estaba bien, cierra la hoja." : null) ?? problemaMotivo) : problemaMotivo;
    if (primero) {
      avisar.error(primero);
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    enVuelo.current = true;
    setCargando(que);
    const lineasFalla = lineasDeFallas(fallas, motivoFalla);
    const llamada =
      que === "corregir"
        ? createClient().rpc(RPC_CORREGIR_ANOTACION as never, { p_ids: anotacion.ids, p_lineas: lineas, p_fallas: lineasFalla.length > 0 ? lineasFalla : null, p_hecho_en: dia, p_motivo: porque.trim() } as never)
        : createClient().rpc(RPC_ELIMINAR_ANOTACION as never, { p_ids: anotacion.ids, p_motivo: porque.trim() } as never);
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
      // La base pudo guardar y la respuesta perderse: se dice que no se sabe y se pide mirar la historia antes de repetir.
      avisar.error(traducirError(error, que === "corregir" ? `corregir lo terminado en ${nombreMinuscula}` : `eliminar lo terminado en ${nombreMinuscula}`, { confirmarAntesDeRepetir: true }));
      router.refresh();
      return;
    }
    if (que === "corregir") avisar.exito(`Corregiste lo terminado en ${fase.nombre}`, { detalle: `${datos.orden.numeroTexto} · lo de antes queda en la historia` });
    else avisar.exito(`Eliminaste lo terminado en ${fase.nombre}`, { detalle: `${datos.orden.numeroTexto} · queda en la historia, con «Restaurar»` });
    cerrarTrasGuardar();
  }

  const total = lineas.reduce((s, l) => s + l.cantidad, 0) + totalFallas(fallas);

  return (
    <Modal
      titulo={`Corregir lo terminado en ${nombreMinuscula}`}
      subtitulo={`Lo anotado del ${diaCorto(anotacion.dia)}, tal como quedó. Cambia lo que estaba mal: lo de antes queda en la historia.`}
      variante="hoja"
      tamano="ancha"
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
        <div data-guia="prod-orden-corregir.cantidades">
          <CampoGuiado id="cantidades" guia={guia} className="space-y-2">
            <span className={campoEtiqueta}>{guia.etiqueta("cantidades", "Cuántas salieron bien, por talla y color")}</span>
            <MatrizCantidades
              soloCantidades
              teclado
              celdas={tabla.celdas}
              tallas={tabla.tallas}
              colores={tabla.colores}
              excluidas={tabla.excluidas}
              cantidades={cantidades}
              onCantidad={(clave, valor) => setCantidades((c) => ({ ...c, [clave]: valor }))}
              preguntaCelda="Cuántas terminaste de"
              fantasma={() => "0"}
              tituloDe={(clave) => {
                const l = lineasPorId.get(clave);
                return [l?.codigo, `antes ${anotacion.buenas[clave] ?? 0}`, `caben ${disponibles[clave] ?? 0}`].filter(Boolean).join(" · ");
              }}
            />
            <p className="text-xs text-tinta/65">{problemaCantidades ?? "Escribe cómo debió quedar. Una raya (—) es una combinación que este modelo no tiene."}</p>
          </CampoGuiado>
        </div>

        <div data-guia="prod-orden-corregir.fallas">
          <FilasDeFalla
            fallas={fallas}
            motivo={motivoFalla}
            opciones={opcionesVariante}
            nombreDe={nombreDe}
            guia={guia}
            problema={problemasFallas[0] ?? null}
            onFallas={cambiarFallas}
            onMotivo={setMotivoFalla}
          />
        </div>

        <div data-guia="prod-orden-corregir.dia" className="grid gap-4 sm:grid-cols-2">
          <CampoGuiado id="dia" guia={guia}>
            <CampoFecha
              etiqueta={guia.etiqueta("dia", "¿Cuándo lo terminaste?")}
              id="corregir-dia"
              valor={dia}
              onValor={setDia}
              tono={problemaDiaElegido ? "error" : "neutro"}
              pie={problemaDiaElegido ?? (dia === anotacion.dia ? "El mismo día que estaba anotado." : `Antes decía ${diaCorto(anotacion.dia)}.`)}
            />
          </CampoGuiado>
        </div>

        <div data-guia="prod-orden-corregir.porque">
          <CampoGuiado id="porque" guia={guia} className="space-y-2">
            <span className={campoEtiqueta}>{guia.etiqueta("porque", "¿Por qué lo corriges?")}</span>
            <div className="flex flex-wrap gap-2">
              {MOTIVOS_CORREGIR.map((m) => (
                <button key={m} type="button" className="pildora-cayla" aria-pressed={porque === m} onClick={() => setPorque(m)}>
                  {m}
                </button>
              ))}
            </div>
            <CampoTexto etiqueta="O cuéntalo con tus palabras" id="corregir-porque" pie="Queda en la historia de la orden" value={porque} onChange={(e) => setPorque(e.target.value)} maxLength={MAX_MOTIVO_CAMBIO} />
          </CampoGuiado>
        </div>

        <div data-guia="prod-orden-corregir.cierre" className="space-y-3">
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
                  data-guia="prod-orden-corregir.eliminar"
                  cargando={cargando === "eliminar"}
                  textoCargando="Eliminando…"
                  disabled={cargando !== null}
                  title="Sale de la vista y queda en la historia, con «Restaurar». Pide el mismo porqué."
                  onClick={() => void guardar("eliminar")}
                >
                  Eliminar
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
                {total > 0 ? `Guardar ${total}` : "Guardar"}
              </Boton>
            </PieAcciones>
          </div>
        </div>
      </form>
      {avisoSalida.aviso}
    </Modal>
  );
}
