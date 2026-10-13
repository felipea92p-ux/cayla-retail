"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { avisar } from "@/components/ui/Avisos";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { camposDeLaEdicion } from "@/lib/plan-compra-guia";
import {
  RPC_EDITAR_CAMPANA,
  RPC_QUITAR_CAMPANA,
  RPC_RESTAURAR_CAMPANA,
  accionDeQuitar,
  argsEditarCampana,
  borradorDeEdicion,
  diferenciaConLaEtiqueta,
  edicionCambio,
  quitarBorra,
  textoDeQuitar,
  type BorradorEdicion,
  type CampanaPlan,
  type EtiquetaCampana,
} from "@/lib/plan-compra-reglas";

// «Editar campaña» del plan (ADR-0372, B5): cambia el nombre y las fechas (la etiqueta de Catálogo ▸ Etiquetas a la que está ligada no cambia) y,
// al pie, «Quitar»: si la campaña está vacía (ninguna categoría armada, sin tope) se BORRA —es irreversible, así que se confirma con el resumen—; si
// tiene algo, se ARCHIVA —reversible: sale un «Deshacer» y se restaura desde «Campañas archivadas»— (Felipe, 2026-10-10). La abre quien tiene el módulo Plan de campaña (ADR-0387; la
// base lo exige también). Guía de foco (ADR-0284): `camposDeLaEdicion` sale de la misma regla que la base. Salir con cambios pregunta.

export function EditarCampanaModal({
  campana,
  etiqueta,
  otrosNombres,
  esLaActual,
  onClose,
}: {
  campana: CampanaPlan;
  /** La etiqueta a la que está ligada (para decir si las fechas difieren); undefined si no tiene. */
  etiqueta: EtiquetaCampana | undefined;
  /** Los nombres de las demás campañas: el de esta puede quedarse igual. */
  otrosNombres: readonly string[];
  /** Es la campaña que está abierta en la pantalla: al quitarla, la pantalla pasa a la más reciente. */
  esLaActual: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [b, setB] = useState<BorradorEdicion>(() => borradorDeEdicion(campana));
  const [trabajando, setTrabajando] = useState(false);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  // Un segundo envío mientras el primero viaja (doble clic, Enter repetido) no sale.
  const enviando = useRef(false);
  const guia = useGuiaCampos(camposDeLaEdicion(b, otrosNombres, { listo: responsable.listo, motivo: responsable.motivo }));
  const cambio = edicionCambio(b, campana);
  const salida = useSalidaSinGuardar(cambio, "Cambiaste esta campaña y todavía no se guardó. Si sales ahora, se pierde lo que cambiaste.");
  const nota = diferenciaConLaEtiqueta(b, etiqueta);
  const quitar = textoDeQuitar(campana);

  async function llamar(rpc: string, args: object): Promise<{ data: unknown; error: Parameters<typeof traducirError>[0] } | null> {
    if (enviando.current) return null;
    enviando.current = true;
    setTrabajando(true);
    const { data, error } = await firmar(createClient().rpc(rpc as never, args as never), responsable.firma());
    responsable.despues(error);
    setTrabajando(false);
    enviando.current = false;
    return { data, error };
  }

  async function guardar(cerrar: () => void) {
    if (!guia.puedeConfirmar || !cambio) return;
    const r = await llamar(RPC_EDITAR_CAMPANA, argsEditarCampana(campana.id, b));
    if (!r) return;
    if (r.error) {
      if (esFalloDeRed(r.error)) return void avisar.error("Se cortó la conexión mientras guardabas la campaña: no sabemos si llegó. Vuelve a pulsar «Guardar cambios»; si ya se había guardado, queda igual.");
      return void avisar.error(traducirError(r.error, "guardar la campaña"));
    }
    const fuera = salida.retirarYa();
    avisar.exito("Campaña guardada", { detalle: b.nombre.replace(/\s+/g, " ").trim() });
    cerrar();
    void fuera.then(() => router.refresh());
  }

  async function quitarCampana(cerrar: () => void) {
    if (!responsable.listo) return void avisar.error(responsable.motivo ?? "Elige quién hace esta operación.");
    const r = await llamar(RPC_QUITAR_CAMPANA, { p_plan_id: campana.id });
    if (!r) return;
    setConfirmarBorrado(false);
    if (r.error) {
      router.refresh();
      if (esFalloDeRed(r.error)) return void avisar.error("Se cortó la conexión mientras quitabas la campaña: puede que se haya quitado. Mira el selector antes de volver a intentarlo.");
      return void avisar.error(traducirError(r.error, "quitar la campaña"));
    }
    // La base decide qué hizo: si entre medio alguien armó una categoría, archivó en vez de borrar.
    const accion = accionDeQuitar(r.data) ?? (quitarBorra(campana) ? "borrado" : "archivado");
    // «Deshacer» restaura firmado por la misma persona que archivó (la hoja ya no estará abierta cuando lo pulsen).
    const firma = responsable.firma();
    const fuera = salida.retirarYa();
    if (accion === "borrado") avisar.exito("Campaña borrada", { detalle: campana.nombre });
    else
      avisar.exito("Campaña archivada", {
        detalle: `${campana.nombre} ya no sale en el selector.`,
        accion: {
          texto: "Deshacer",
          onClick: () => {
            void firmar(createClient().rpc(RPC_RESTAURAR_CAMPANA as never, { p_plan_id: campana.id } as never), firma).then(({ error }) => {
              if (error) return void avisar.error(traducirError(error, "restaurar la campaña"));
              avisar.exito("Campaña restaurada", { detalle: campana.nombre });
              router.push(`/compras/plan?plan=${campana.id}`);
            });
          },
        },
      });
    cerrar();
    // Si era la que estaba abierta, la pantalla pasa a la más reciente. `replace` + `refresh`: si la URL ya era `/compras/plan`, un `push` a la
    // misma dirección no vuelve a leer y seguía mostrando la campaña quitada.
    void fuera.then(() => {
      if (esLaActual) router.replace("/compras/plan");
      router.refresh();
    });
  }

  return (
    <Modal
      titulo="Editar campaña"
      subtitulo="Cambia su nombre o sus fechas. La campaña de Etiquetas a la que está ligada no cambia."
      onClose={onClose}
      antesDeCerrar={salida.pedirAccion}
      bloqueado={trabajando}
      variante="hoja"
      ancho="max-w-lg"
    >
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void guardar(cerrar);
          }}
          className="space-y-5"
        >
          <CampoGuiado id="nombre" guia={guia} titulo="Nombre del plan" ayuda="Como se verá en el selector">
            <CampoTexto etiqueta="Nombre del plan" caja value={b.nombre} onChange={(e) => setB((x) => ({ ...x, nombre: e.target.value }))} />
          </CampoGuiado>
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoGuiado id="desde" guia={guia} titulo="Desde">
              <CampoFecha etiqueta={<span className="sr-only">Desde</span>} caja estricto valor={b.desde} onValor={(iso) => setB((x) => ({ ...x, desde: iso }))} />
            </CampoGuiado>
            <CampoGuiado id="hasta" guia={guia} titulo="Hasta">
              <CampoFecha etiqueta={<span className="sr-only">Hasta</span>} caja estricto valor={b.hasta} onValor={(iso) => setB((x) => ({ ...x, hasta: iso }))} />
            </CampoGuiado>
          </div>
          {nota && <p className="nota-cayla">{nota}</p>}
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={trabajando} />
          </CampoGuiado>

          {/* Quitar, aparte de guardar: dice antes qué va a pasar (borrar o archivar) y por qué. */}
          <div className="rounded-xl border border-sand px-4 py-3">
            {confirmarBorrado ? (
              <div className="space-y-3">
                <p className="text-sm text-tinta">
                  ¿Borrar <b className="font-semibold">{campana.nombre}</b>? {quitar.explica}
                </p>
                <div className="flex flex-wrap justify-end gap-3">
                  <Boton type="button" onClick={() => setConfirmarBorrado(false)} disabled={trabajando}>
                    No, dejarla
                  </Boton>
                  <Boton type="button" peso="peligro" cargando={trabajando} onClick={() => void quitarCampana(cerrar)}>
                    Sí, borrar campaña
                  </Boton>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="min-w-0 flex-1 basis-60 text-[13px] text-tinta/75">{quitar.explica}</p>
                <Boton
                  type="button"
                  peso="peligro"
                  disabled={trabajando || !responsable.listo}
                  title={responsable.motivo ?? undefined}
                  onClick={() => (quitarBorra(campana) ? setConfirmarBorrado(true) : void quitarCampana(cerrar))}
                >
                  {quitar.boton}
                </Boton>
              </div>
            )}
          </div>

          <div className="pie-hoja-fijo">
            <PieGuia guia={guia} listo={cambio ? "Todo listo para guardar." : "Sin cambios todavía."} />
            <div className="flex justify-end gap-3 pt-2">
              <Boton type="button" onClick={() => salida.pedirAccion(cerrar)}>
                Cancelar
              </Boton>
              <Boton
                type="submit"
                peso="primario"
                cargando={trabajando}
                disabled={!guia.puedeConfirmar || !cambio}
                title={responsable.motivo ?? guia.frase ?? (cambio ? undefined : "No cambiaste nada")}
                className={guia.claseConfirmar}
              >
                Guardar cambios
              </Boton>
            </div>
          </div>
          {salida.aviso}
        </form>
      )}
    </Modal>
  );
}
