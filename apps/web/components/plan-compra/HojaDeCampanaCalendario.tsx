"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoTexto, Segmentado } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Chip } from "@/components/ui/Chip";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { avisar } from "@/components/ui/Avisos";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { RangoDeVentas } from "@/components/plan-compra/RangoDeVentas";
import { createClient } from "@/lib/supabase/client";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { camposDeLaHojaDelCalendario } from "@/lib/plan-compra-guia";
import { RPC_GUARDAR_CALENDARIO, RPC_QUITAR_CALENDARIO, RPC_RESTAURAR_CALENDARIO, argsQuitar, argsRestaurar, type UsoDeCampana } from "@/lib/plan-compra-calendario";
import { multiplicadorLegible, notaDelAnioRaro, pocaHistoria, textoDeAnios, veredictoDe, type EvidenciaDeCampana } from "@/lib/plan-compra-calendario-evidencia";
import {
  anioDeLaHoja,
  argsGuardarCampana,
  atajosDePausa,
  borradorDeLaCampana,
  hojaCambio,
  pausaPorDefecto,
  problemasDeLaHoja,
  type BorradorDeCampanaDelCalendario,
} from "@/lib/plan-compra-calendario-hoja";
import { textoDelRegreso, type CampanaDelCalendario } from "@/lib/plan-compra-calendario-vista";

// La hoja «Configurar campaña» / «Campaña nueva» del Calendario del Plan (ADR-0525, spike ①): lo que se decide de una campaña —si se repite cada año o solo este, si entra a mi plan, descansa
// o no la compro, y sus fechas— y, a su lado, lo que dijo su historia. Lo que cambies aquí es de TU plan de compra: no toca la insignia, la tienda web ni la meta de caja. Una campaña
// nueva vive solo en tu plan; si también la quieres en la tienda web, se crea en Catálogo ▸ Insignias. «Quitar del calendario» la archiva (nunca la borra) y se puede deshacer.
// Guía de foco (ADR-0284): `camposDeLaHojaDelCalendario` sale de la misma regla que la base. Salir con cambios pregunta (`useSalidaSinGuardar`).

const ESTADOS: { valor: UsoDeCampana; texto: string }[] = [
  { valor: "activa", texto: "Activa" },
  { valor: "pausada", texto: "Pausada" },
  { valor: "no", texto: "No compro" },
];

/** Las dos tarjetas de «¿Se repite?»: un radiogroup (una sola parada de Tab y las flechas cambian de opción). */
function OpcionesDeRepeticion({ valor, anio, onValor }: { valor: "anual" | "unica"; anio: number; onValor: (v: "anual" | "unica") => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const opciones: { v: "anual" | "unica"; titulo: string; texto: string }[] = [
    { v: "anual", titulo: "Cada año", texto: "Vuelve sola al calendario: te ofrece armar su plan cuando faltan 90 días." },
    { v: "unica", titulo: `Solo ${anio}`, texto: "Se arma este año y después desaparece del calendario. Lo vendido queda en el Historial." },
  ];
  const alTeclado = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const paso = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!paso) return;
    e.preventDefault();
    const j = (i + paso + opciones.length) % opciones.length;
    onValor(opciones[j].v);
    refs.current[j]?.focus();
  };
  return (
    <div role="radiogroup" aria-label="¿Se repite?" className="cal-opciones" data-guia="calendario-hoja.repite">
      {opciones.map((o, i) => (
        <button
          key={o.v}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={valor === o.v}
          tabIndex={valor === o.v ? 0 : -1}
          className="cal-op"
          onClick={() => onValor(o.v)}
          onKeyDown={(e) => alTeclado(e, i)}
        >
          <div>
            <b>{o.titulo}</b>
            <span>{o.texto}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

/** «Qué dice tu historia»: la mediana, el veredicto y la barra, con lo que significan; o por qué no hay. */
function BloqueDeHistoria({ evidencia, tienda, nueva, historiaFallo }: { evidencia: EvidenciaDeCampana | null; tienda: { nombre: string } | null; nueva: boolean; historiaFallo: boolean }) {
  if (!evidencia) {
    return (
      <div className="cal-ev" data-guia="calendario-hoja.historia">
        <p className="mt-0! text-sm font-semibold text-tinta">{historiaFallo ? "No se pudo leer tu historia" : "Sin historia propia"}</p>
        <p>
          {historiaFallo
            ? "Se guarda igual; la historia vuelve cuando recargues la página."
            : nueva
              ? "Cuando la guardes, el Historial empieza a medirla con sus fechas."
              : "El sistema no tiene ventas de esas fechas. Se compra con lo que tú supongas, y al terminar quedará la primera medida."}
        </p>
      </div>
    );
  }
  const v = veredictoDe(evidencia);
  const nota = notaDelAnioRaro(evidencia);
  return (
    <div className="cal-ev" data-guia="calendario-hoja.historia">
      <p className="mt-0! mb-1.5 text-[15px] font-semibold text-tinta">
        Qué dice tu historia{" "}
        <small className="text-xs font-normal text-taupe">
          {tienda ? `${tienda.nombre} · ` : ""}
          {textoDeAnios(evidencia.porAnio.length)}
        </small>
      </p>
      <div className="cal-ev-g">
        {multiplicadorLegible(evidencia.mediana)}
        <Chip tono={v.tono} versalitas={false}>
          {v.texto}
        </Chip>
      </div>
      <RangoDeVentas evidencia={evidencia} />
      <p>
        Un día de esta campaña vendió {multiplicadorLegible(evidencia.mediana)} lo de un día normal del año (entre {multiplicadorLegible(evidencia.min)} y {multiplicadorLegible(evidencia.max)}).
        {nota ? ` ${nota}` : ""} Mide los soles de toda la tienda, no una categoría: si vendes con descuento, vendes más prendas por menos soles.
      </p>
      {pocaHistoria(evidencia) && <p>Con {textoDeAnios(evidencia.porAnio.length)} de historia, el número dice poco: tómalo como una pista, no como una regla.</p>}
    </div>
  );
}

export function HojaDeCampanaCalendario({
  campana,
  anio,
  hoy,
  evidencia,
  tienda,
  historiaFallo,
  otrosNombres,
  nombresDeInsignias,
  onClose,
}: {
  /** La campaña que se configura; null = una campaña nueva (siempre propia: vive solo en tu plan). */
  campana: CampanaDelCalendario | null;
  /** El año que se mira (el de «Solo este año»). */
  anio: number;
  hoy: string;
  evidencia: EvidenciaDeCampana | null;
  /** La tienda con la que se midió la historia; null si ninguna tiene. */
  tienda: { id: string; nombre: string } | null;
  /** La lectura de la historia falló: no es lo mismo que «no hay». */
  historiaFallo: boolean;
  /** Los nombres de las demás campañas propias (esta puede quedarse con el suyo). */
  otrosNombres: readonly string[];
  /** Los nombres de las campañas de Catálogo ▸ Insignias (una propia no puede llamarse igual). */
  nombresDeInsignias: readonly string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const nueva = campana === null;
  const propia = nueva || campana.esPropia;
  const [inicial] = useState(() => borradorDeLaCampana(campana));
  const [b, setB] = useState<BorradorDeCampanaDelCalendario>(inicial);
  const [trabajando, setTrabajando] = useState(false);
  const [confirmandoQuitar, setConfirmandoQuitar] = useState(false);
  // Un segundo envío mientras el primero viaja (doble clic, Enter repetido) no sale (chaos 2026-10-10).
  const enviando = useRef(false);
  const ctx = { hoy, otrosNombres, nombresDeInsignias };
  const guia = useGuiaCampos(camposDeLaHojaDelCalendario(b, campana, ctx, { listo: responsable.listo, motivo: responsable.motivo }));
  const problemas = problemasDeLaHoja(b, campana, ctx);
  const cambio = hojaCambio(b, inicial);
  const salida = useSalidaSinGuardar(cambio, "Cambiaste esta campaña y todavía no se guardó. Si sales ahora, se pierde lo que cambiaste.");
  const anioDeLaCampana = anioDeLaHoja(b, anio);
  const nombreLimpio = b.nombre.replace(/\s+/g, " ").trim();

  const cambiar = (c: Partial<BorradorDeCampanaDelCalendario>) => setB((x) => ({ ...x, ...c }));
  const elegirEstado = (uso: UsoDeCampana) => cambiar({ uso, pausaHasta: uso === "pausada" ? (b.pausaHasta || pausaPorDefecto(hoy)) : "" });

  async function llamar(rpc: string, args: object) {
    if (enviando.current) return null;
    enviando.current = true;
    setTrabajando(true);
    const r = await firmar(createClient().rpc(rpc as never, args as never), responsable.firma());
    responsable.despues(r.error);
    setTrabajando(false);
    enviando.current = false;
    return r;
  }

  async function guardar(cerrar: () => void) {
    if (!guia.puedeConfirmar || (!cambio && !nueva)) return;
    const r = await llamar(RPC_GUARDAR_CALENDARIO, argsGuardarCampana(campana, b, anio));
    if (!r) return;
    if (r.error) {
      // Puede que SÍ se haya guardado (se cortó la red después): se relee para que el calendario diga la verdad.
      router.refresh();
      if (esFalloDeRed(r.error)) return void avisar.error("Se cortó la conexión mientras guardabas: puede que se haya guardado. Mira el calendario antes de volver a intentarlo.");
      return void avisar.error(traducirError(r.error, nueva ? "crear la campaña" : "guardar la campaña"));
    }
    const fuera = salida.retirarYa();
    avisar.exito(nueva ? "Campaña creada" : "Campaña guardada", {
      detalle: nueva ? `«${nombreLimpio}» ${b.repite === "unica" ? `solo para ${anioDeLaCampana}` : "se repite cada año"}.` : campana.nombre,
    });
    cerrar();
    void fuera.then(() => router.refresh());
  }

  async function quitar(cerrar: () => void) {
    if (!campana) return;
    if (!responsable.listo) return void avisar.error(responsable.motivo ?? "Elige quién hace esta operación.");
    const r = await llamar(RPC_QUITAR_CALENDARIO, argsQuitar(campana));
    if (!r) return;
    setConfirmandoQuitar(false);
    if (r.error) {
      router.refresh();
      if (esFalloDeRed(r.error)) return void avisar.error("Se cortó la conexión mientras la quitabas: puede que se haya quitado. Mira el calendario antes de volver a intentarlo.");
      return void avisar.error(traducirError(r.error, "quitar la campaña"));
    }
    // «Deshacer» restaura firmado por la misma persona que la quitó (la hoja ya no estará abierta cuando lo pulsen).
    const id = (r.data as { id?: string } | null)?.id ?? campana.decisionId;
    const firma = responsable.firma();
    const fuera = salida.retirarYa();
    avisar.exito("Campaña quitada del calendario", {
      detalle: `${campana.nombre} se archivó: no se borró nada.`,
      accion: id
        ? {
            texto: "Deshacer",
            onClick: () => {
              void firmar(createClient().rpc(RPC_RESTAURAR_CALENDARIO as never, argsRestaurar(id) as never), firma).then(({ error }) => {
                if (error) return void avisar.error(traducirError(error, "restaurar la campaña"));
                avisar.exito("Campaña restaurada", { detalle: campana.nombre });
                router.refresh();
              });
            },
          }
        : undefined,
    });
    cerrar();
    void fuera.then(() => router.refresh());
  }

  const subtitulo = nueva
    ? "Una fecha que no está en el calendario del sistema."
    : campana.esPropia
      ? "Una campaña tuya: vive solo en tu plan de compra."
      : "De Catálogo ▸ Insignias. Lo que cambies aquí es de tu plan de compra: no toca la insignia, la tienda web ni la meta de caja.";
  const sinFechasEnInsignias = !nueva && !campana.esPropia && campana.fechasDeLaInsignia === null;
  const ensancha =
    !nueva &&
    !campana.esPropia &&
    campana.fechasDeLaInsignia !== null &&
    b.desde !== "" &&
    b.hasta !== "" &&
    (b.desde !== campana.fechasDeLaInsignia.desde || b.hasta !== campana.fechasDeLaInsignia.hasta);
  const estados = nueva ? ESTADOS.filter((e) => e.valor !== "no") : ESTADOS;
  const hayPlan = !nueva && campana.plan !== null;

  const encabezadoDeFecha = (texto: string): ReactNode => `${texto} (${anio})`;

  return (
    <Modal
      titulo={nueva ? "Campaña nueva" : `Configurar «${campana.nombre}»`}
      subtitulo={subtitulo}
      onClose={onClose}
      antesDeCerrar={salida.pedirAccion}
      bloqueado={trabajando}
      variante="hoja"
      tamano="ancha"
    >
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void guardar(cerrar);
          }}
          className="space-y-5"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-4">
              {propia && (
                <CampoGuiado id="nombre" guia={guia} titulo="Nombre de la campaña" ayuda="Como saldrá en el calendario">
                  <CampoTexto
                    etiqueta={<span className="sr-only">Nombre de la campaña</span>}
                    caja
                    value={b.nombre}
                    onChange={(e) => cambiar({ nombre: e.target.value })}
                    maxLength={120}
                    autoFocus={nueva}
                    // sugerir-fijo: es el primer dato de una campaña nueva, no depende de nada elegido antes
                    placeholder={nueva ? "Ej. Día del Padre" : undefined}
                    // Lo que choca (ya está en el calendario, o ya hay una con ese nombre) se dice bajo el campo; un nombre vacío solo lo pide la guía.
                    {...(nombreLimpio && problemas.nombre ? { tono: "error" as const, pie: problemas.nombre } : {})}
                  />
                </CampoGuiado>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <CampoGuiado id="desde" guia={guia} titulo={encabezadoDeFecha("Desde")}>
                  <CampoFecha
                    etiqueta={<span className="sr-only">Desde</span>}
                    caja
                    estricto
                    valor={b.desde}
                    onValor={(iso) => cambiar({ desde: iso })}
                    rango={{ desde: b.desde || null, hasta: b.hasta || null }}
                    // Lo que está mal escrito se dice bajo su campo; una fecha que falta solo la pide la guía.
                    {...(problemas.desde && b.desde !== "" ? { tono: "error" as const, pie: problemas.desde } : {})}
                  />
                </CampoGuiado>
                <CampoGuiado id="hasta" guia={guia} titulo={encabezadoDeFecha("Hasta")}>
                  <CampoFecha
                    etiqueta={<span className="sr-only">Hasta</span>}
                    caja
                    estricto
                    valor={b.hasta}
                    onValor={(iso) => cambiar({ hasta: iso })}
                    rango={{ desde: b.desde || null, hasta: b.hasta || null }}
                    {...(problemas.hasta && b.hasta !== "" ? { tono: "error" as const, pie: problemas.hasta } : {})}
                  />
                </CampoGuiado>
              </div>
              {sinFechasEnInsignias && (
                <p className="nota-cayla">
                  <b className="font-semibold">«{campana.nombre}» no tiene fechas en Insignias.</b> Ponlas aquí para tu plan de compra: no cambian la insignia, la tienda web ni la meta de caja. Tú decides si participas.
                </p>
              )}
              {ensancha && <p className="nota-cayla">Las fechas del plan pueden ser más anchas que las de la venta: una ventana de compra empieza antes.</p>}

              <div className="space-y-1.5">
                <p className="text-[13px] font-semibold text-tinta">¿Se repite?</p>
                <OpcionesDeRepeticion valor={b.repite} anio={anioDeLaCampana} onValor={(repite) => cambiar({ repite })} />
              </div>

              <div className="space-y-2" data-guia="calendario-hoja.estado">
                <Segmentado etiqueta="Estado" valor={b.uso} onValor={elegirEstado} opciones={estados} />
                {b.uso === "pausada" && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Hasta cuándo descansa">
                      {atajosDePausa(hoy).map((a) => (
                        <button key={a.texto} type="button" className="pildora-cayla" aria-pressed={(a.fecha ?? "") === b.pausaHasta} onClick={() => cambiar({ pausaHasta: a.fecha ?? "" })}>
                          {a.texto}
                        </button>
                      ))}
                    </div>
                    <CampoGuiado id="pausaHasta" guia={guia} titulo="Reactivar el" ayuda="Opcional">
                      <CampoFecha
                        etiqueta={<span className="sr-only">Reactivar el</span>}
                        caja
                        estricto
                        valor={b.pausaHasta}
                        onValor={(iso) => cambiar({ pausaHasta: iso })}
                        {...(problemas.pausaHasta ? { tono: "error" as const, pie: problemas.pausaHasta } : {})}
                      />
                    </CampoGuiado>
                    <p className="text-[12.5px] text-taupe">
                      {b.pausaHasta && !problemas.pausaHasta ? `No se ofrece armar su plan hasta el ${textoDelRegreso(b.pausaHasta)}; ese día vuelve sola.` : "Queda pausada hasta que tú la reactives."} Lo que ya armaste se conserva.
                    </p>
                  </div>
                )}
                {b.uso === "no" && <p className="text-[12.5px] text-taupe">No se ofrece armar su plan. Lo que ya armaste se conserva.</p>}
              </div>
            </div>

            <div className="space-y-3 self-start">
              <BloqueDeHistoria evidencia={evidencia} tienda={tienda} nueva={nueva} historiaFallo={historiaFallo} />
              {nueva && (
                <p className="nota-cayla">
                  Vive solo en tu plan de compra. Si también la quieres en la tienda web, créala en Catálogo ▸ Insignias: aparecerá aquí sola.
                </p>
              )}
              {!nueva && campana.plan && (
                <p className="nota-cayla">
                  Tiene su plan de {anio} («{campana.plan.nombre}»). Cambiar sus fechas aquí no cambia las de ese plan: se editan en el selector.
                </p>
              )}
            </div>
          </div>

          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={trabajando} />
          </CampoGuiado>

          {confirmandoQuitar && !nueva && (
            <Aviso
              tono="atencion"
              chico
              titulo={hayPlan ? "Tiene un plan armado: se archiva" : "Se archiva: no se borra nada"}
              accion={
                <Boton type="button" peso="peligro" cargando={trabajando} textoCargando="Archivando…" onClick={() => void quitar(cerrar)}>
                  Archivar
                </Boton>
              }
            >
              Deja de salir en el calendario y en el selector, y se puede restaurar cuando quieras. {hayPlan ? "Su plan y sus ventas se conservan." : "Lo que ya armaste se conserva."}
            </Aviso>
          )}

          <div className="pie-hoja-fijo">
            <PieGuia guia={guia} listo={cambio || nueva ? "Todo listo para guardar." : "Sin cambios todavía."} />
            <PieAcciones
              className="pt-2"
              izquierda={
                !nueva ? (
                  <Boton type="button" peso="peligro" disabled={trabajando} onClick={() => setConfirmandoQuitar((x) => !x)} aria-expanded={confirmandoQuitar} data-guia="calendario-hoja.quitar">
                    Quitar del calendario
                  </Boton>
                ) : undefined
              }
            >
              <Boton type="button" onClick={() => salida.pedirAccion(cerrar)}>
                Cancelar
              </Boton>
              <Boton
                type="submit"
                peso="primario"
                cargando={trabajando}
                disabled={!guia.puedeConfirmar || (!cambio && !nueva)}
                title={responsable.motivo ?? guia.frase ?? (cambio || nueva ? undefined : "No cambiaste nada")}
                className={guia.claseConfirmar}
              >
                {nueva ? "Crear campaña" : "Guardar"}
              </Boton>
            </PieAcciones>
          </div>
          {salida.aviso}
        </form>
      )}
    </Modal>
  );
}
