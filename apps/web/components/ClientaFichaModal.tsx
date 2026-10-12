"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { CampoTexto, Boton, Interruptor } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { Pestanas } from "@/components/ui/Pestanas";
import { soltarPaginaEstable } from "@/components/ui/PaginaEstable";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoNumeroDocumento, CampoTipoDocumento, ID_NUMERO_DOCUMENTO } from "@/components/CampoDocumentoClienta";
import { CampoCelular, CamposCumpleanos, ID_ANIO_CLUB, ID_CELULAR_CLUB, ID_DIA_CLUB } from "@/components/clientas/club-piezas";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { avisar } from "@/components/ui/Avisos";
import { esVersionCambiada, traducirError, type ErrorEscritura } from "@/lib/error-escritura";
import { estaActiva, type Clienta, type FichaClienta } from "@/lib/clientas-reglas";
import { deducirTallas, estadoFrecuente } from "@/lib/clienta-actividad-reglas";
import { ajustarNumeroAlTipo, documentoLegible, problemaDocumento } from "@/lib/documento-clienta-reglas";
import { estadoClub } from "@/lib/club-reglas";
import { cajaDelProblemaCumple, cumpleCompleto, problemaCumple, type CumpleEscrito } from "@/lib/club-cumple-reglas";
import { avisoCambioDeCelular, cumpleLegible, faltaParaSerSocia } from "@/lib/club-clientas-reglas";
import { registrarBajaWhatsapp } from "@/lib/club-acciones";
import type { CampoDeGuia } from "@/lib/guia-campos";
import {
  archivarClienta,
  buscarClienta,
  cargarFichaClienta,
  editarClienta,
  reactivarClienta,
  unirClientas,
  type DatosEdicion,
} from "@/lib/clientas-acciones";
// Tanda 1f (ADR-0288 «Actualización 2026-09-30 (f)»): su sede y frecuente con compra neta, las preferencias y la historia del
// permiso. Viven en piezas aparte; aquí solo se enganchan.
import { frecuenteDeLaFicha, suSedeDeLaFicha } from "@/lib/clientas-lista-reglas";
import { PreferenciasClienta } from "@/components/clientas/PreferenciasClienta";
import { HistoriaPermisos } from "@/components/clientas/HistoriaPermisos";
import { ShoppingBag } from "lucide-react";
import { Vacio } from "@/components/ui/Vacio";

/** Lo que muestra la hoja: la ficha, o una de sus acciones (cada una responde adentro del mismo panel, ADR-0136). Del club
 *  queda «Registrar su BAJA» (`baja`): desde la tanda 1g (ADR-0288, G-1, G-7) ella se une sola desde el cartel, así que la
 *  ficha ya no une al club, no muestra un QR personal ni registra «Llegó su mensaje». */
type Modo = "ver" | "editar" | "archivar" | "unir" | "baja";
/** Las pestañas de la ficha: lo del club (permisos y preferencias) por un lado y lo que hizo en las tiendas por otro. */
type Vista = "club" | "actividad";

const FORMATO_FECHA = new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric" });
function fecha(iso: string): string {
  return FORMATO_FECHA.format(new Date(iso));
}
function soles(n: number): string {
  return `S/ ${n.toFixed(2)}`;
}
/** El cumpleaños de «Editar» como lo escriben las cajas (la ficha lo guarda en tres textos). */
const cumpleDeEdicion = (e: DatosEdicion): CumpleEscrito => ({ dia: e.cumpleDia, mes: e.cumpleMes, anio: e.cumpleAnio });

function datosDeEdicion(c: Clienta): DatosEdicion {
  return {
    documentoTipo: c.documentoTipo,
    documentoNumero: c.documentoNumero ?? "",
    nombre: c.nombre ?? "",
    telefonoWhatsapp: c.telefonoWhatsapp ?? "",
    cumpleDia: c.cumpleDia?.toString() ?? "",
    cumpleMes: c.cumpleMes?.toString() ?? "",
    cumpleAnio: c.cumpleAnio?.toString() ?? "",
    tallas: c.tallas,
  };
}

/**
 * Los campos de la guía de foco (CLAUDE.md «Guía de foco», ADR-0284) de lo que la hoja muestra ahora. Salen de las mismas
 * reglas que validan cada acción abajo (y que la base vuelve a exigir): no agregan ninguna.
 *   · editar: el documento, si se escribe, completo (D-2); a una socia no se le puede borrar el celular, el documento ni el
 *     nombre (`socia_sin_celular`, `socia_sin_documento`, CL-1); el año del cumpleaños, si se escribe, completo.
 *   · archivar: el motivo. · unir: la otra ficha. · baja: solo quién lo hace. · En todas, quién lo hace.
 */
function camposDeLaGuia(
  modo: Modo,
  c: Clienta | null,
  estado: { edicion: DatosEdicion | null; motivoArchivo: string; anonimizar: boolean; aFusionar: Clienta | null },
  responsableListo: boolean,
  anioActual: number,
): CampoDeGuia[] {
  if (!c) return [];
  const quien: CampoDeGuia = { id: "responsable", nombre: "Quién lo hace", requerido: true, hecho: responsableListo, pendiente: "Elige quién lo hace." };
  // La MISMA regla del cumpleaños que Cobrar (lib/club-cumple-reglas.ts): un día que el mes no tiene no pasa en ninguna.
  const cumple = (escrito: CumpleEscrito): CampoDeGuia => {
    const problema = problemaCumple(escrito, anioActual);
    return {
      id: "cumple",
      nombre: "Cumpleaños",
      requerido: problema !== null,
      sugerido: false,
      hecho: cumpleCompleto(escrito, anioActual),
      pendiente: problema ?? "Sin él no hay beneficio de cumpleaños.",
    };
  };
  switch (modo) {
    case "editar": {
      const e = estado.edicion;
      if (!e) return [];
      const problema = problemaDocumento(e.documentoTipo, e.documentoNumero);
      const socia = c.clubDesde !== null;
      return [
        {
          id: "documento",
          nombre: problema ? "Documento completo" : "Documento",
          requerido: problema !== null || socia,
          hecho: e.documentoNumero !== "" && problema === null,
          pendiente: problema ?? "Es miembro del club: su documento no se puede dejar vacío.",
        },
        { id: "nombre", nombre: "Nombre", requerido: socia, hecho: e.nombre.trim() !== "", pendiente: "Es miembro del club: su nombre no se puede dejar vacío." },
        {
          id: "celular",
          nombre: "Celular",
          requerido: c.clubDesde !== null,
          hecho: e.telefonoWhatsapp.trim() !== "",
          pendiente: "Es miembro del club: su celular no se puede dejar vacío.",
        },
        cumple(cumpleDeEdicion(e)),
        quien,
      ];
    }
    case "archivar":
      return [
        { id: "motivo", nombre: "Motivo", requerido: true, hecho: estado.motivoArchivo.trim() !== "", pendiente: "Escribe por qué se archiva." },
        { id: "anonimizar", nombre: "Anonimizar", requerido: false, hecho: estado.anonimizar, pendiente: "" },
        quien,
      ];
    case "unir":
      return [{ id: "otra", nombre: "La otra ficha", requerido: true, hecho: estado.aFusionar !== null, pendiente: "Busca y elige la otra ficha de este cliente." }, quien];
    case "baja":
      return [quien];
    case "ver":
      return [];
  }
}

/**
 * La ficha completa de una clienta (paso 2 del acta, `docs/datos/DECISIONES-2026-09-26-clientas.md`
 * sección H): ver su actividad, editar con candado optimista (ADR-0193 reusado), archivar/
 * anonimizar (Ley 29733, nunca `delete`) y unir con otra ficha (D-99). UN solo `<Modal
 * variante="hoja">` que cambia de contenido por `modo` — ADR-0136 no anida modales, cada acción
 * responde adentro del mismo panel.
 *
 * ADR-0288: la ficha dice dónde está frente al club (`estadoClub`). Desde la tanda 1g (G-1, G-2, G-7) ella se une sola
 * escaneando el cartel y ahí decide si quiere publicidad (G-12): la ficha no une al club ni marca la publicidad. Lo único del
 * club que se registra aquí es su BAJA, cuando escribe BAJA a la tienda; la historia de permisos lo muestra.
 */
export function ClientaFichaModal({ id, onClose, onCambiada }: { id: string; onClose: () => void; onCambiada: () => void }) {
  const [ficha, setFicha] = useState<FichaClienta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [modo, setModo] = useState<Modo>("ver");
  const [edicion, setEdicion] = useState<DatosEdicion | null>(null);
  const [motivoArchivo, setMotivoArchivo] = useState("");
  const [anonimizar, setAnonimizar] = useState(false);
  const [terminoUnir, setTerminoUnir] = useState("");
  const [resultadosUnir, setResultadosUnir] = useState<Clienta[] | null>(null);
  const [aFusionar, setAFusionar] = useState<Clienta | null>(null);
  const [guardando, setGuardando] = useState(false);
  // La pestaña de la ficha («ver»). `null` = la de siempre: «Club» si es miembro y «Actividad» si no.
  const [vista, setVista] = useState<Vista | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const responsable = useResponsable();
  const anioActual = new Date().getFullYear();

  // Cambiar de vista (ver → editar, Club → Actividad) acorta o alarga el contenido SIN cambiar de URL. `PaginaEstable`
  // (ADR-0185) lo toma por «un bloque que se acortó bajo el mouse» y reserva aire al fondo para no mover la vista: en
  // «Editar», tras bajar por la ficha, eso era un blanco enorme bajo el botón Guardar. Aquí es otra pantalla: se suelta la
  // reserva antes de pintar y la hoja empieza arriba, como una navegación.
  useLayoutEffect(() => {
    soltarPaginaEstable();
    const hoja = raiz.current?.closest<HTMLElement>('[role="dialog"]');
    if (hoja) hoja.scrollTop = 0;
  }, [modo, vista]);

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar / cambiar id
  }, [id]);

  const guia = useGuiaCampos(
    camposDeLaGuia(modo, ficha?.clienta ?? null, { edicion, motivoArchivo, anonimizar, aFusionar }, responsable.listo, anioActual),
  );

  async function cargar() {
    setCargando(true);
    const { ficha, error } = await cargarFichaClienta(id);
    setCargando(false);
    if (error || !ficha) {
      avisar.error(traducirError(error, "abrir la ficha del cliente"));
      onClose();
      return;
    }
    setFicha(ficha);
    setModo("ver");
  }

  if (cargando || !ficha) {
    return (
      <Modal titulo="Cliente" subtitulo="Cargando…" onClose={onClose} variante="hoja">
        <p className="text-sm text-tinta/65">Un momento…</p>
      </Modal>
    );
  }

  const c = ficha.clienta;
  const activa = estaActiva(c);
  const tallas = deducirTallas(ficha.compras);
  const frecuente = frecuenteDeLaFicha(ficha.resumenCompras ?? null, estadoFrecuente(ficha.compras, new Date()));
  const suSede = suSedeDeLaFicha(ficha.resumenCompras ?? null);
  // Dentro de la ficha el documento se ve completo, con su tipo («DNI 71234482», «CE 001234567»): quien la abre ya la
  // buscó a propósito. Lo que se enmascara es el mostrador del Punto de venta.
  const documento = documentoLegible(c.documentoTipo, c.documentoNumero, false);
  const enClub = estadoClub(c);
  // Solo una miembro tiene pestaña «Club» (permisos y preferencias); una ficha anonimizada no tiene nada del club que mostrar.
  const conClub = enClub !== "no_socia" && !c.anonimizada;
  const vistaActual: Vista = vista === "club" && !conClub ? "actividad" : (vista ?? (conClub ? "club" : "actividad"));
  const totalActividad = ficha.compras.length + ficha.cambios.length + ficha.devoluciones.length + ficha.separaciones.length;
  // Tanda 1g: se une desde el cartel con su documento; sin documento en esta ficha, se crearía otra.
  const faltaParaElClub = faltaParaSerSocia(c);
  // Al editar el celular de una socia con novedades, lo que pierde, ANTES de guardar (la base se las quita sola).
  const avisoCelular = edicion ? avisoCambioDeCelular(c, edicion.telefonoWhatsapp) : null;

  /** Lo común a toda acción que guarda: responsable, el aviso de la base y volver a leer la ficha. */
  async function guardarAccion(hacer: () => Promise<{ error: ErrorEscritura }>, que: string, listo: () => void, despues?: Modo) {
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const { error } = await hacer();
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      if (esVersionCambiada(error)) {
        avisar.error(traducirError(error, que), { accion: { texto: "Recargar", onClick: () => void cargar() } });
        return;
      }
      avisar.error(traducirError(error, que));
      return;
    }
    listo();
    onCambiada();
    await cargar();
    if (despues) setModo(despues);
  }

  async function onEditar(e: React.FormEvent) {
    e.preventDefault();
    if (!edicion) return;
    // El documento es opcional, pero si se escribe tiene que estar completo: la base rechaza uno a medias (ADR-0288 D-2).
    const problema = problemaDocumento(edicion.documentoTipo, edicion.documentoNumero);
    if (problema) {
      avisar.error(problema, { enfocar: ID_NUMERO_DOCUMENTO });
      return;
    }
    if (c.clubDesde !== null && edicion.telefonoWhatsapp.trim() === "") {
      avisar.error("Es miembro del club: su celular no se puede dejar vacío.", { enfocar: ID_CELULAR_CLUB });
      return;
    }
    if (c.clubDesde !== null && (edicion.documentoNumero.trim() === "" || edicion.nombre.trim() === "")) {
      avisar.error("Es miembro del club: su documento y su nombre no se pueden dejar vacíos.", edicion.documentoNumero.trim() === "" ? { enfocar: ID_NUMERO_DOCUMENTO } : undefined);
      return;
    }
    const cumpleEditado = cumpleDeEdicion(edicion);
    const problemaDelCumple = problemaCumple(cumpleEditado, anioActual);
    if (problemaDelCumple) {
      avisar.error(problemaDelCumple, { enfocar: cajaDelProblemaCumple(cumpleEditado, anioActual) === "anio" ? ID_ANIO_CLUB : ID_DIA_CLUB });
      return;
    }
    const firma = responsable.firma();
    const pierdeNovedades = avisoCelular !== null;
    await guardarAccion(
      () => editarClienta(id, edicion, c.version, firma),
      "editar la ficha",
      () =>
        avisar.exito("Ficha actualizada", {
          detalle: pierdeNovedades ? "Con el celular nuevo dejó de recibir novedades: las vuelve a pedir escaneando el cartel del club." : undefined,
        }),
    );
  }

  async function onArchivar(anonimizando: boolean) {
    if (motivoArchivo.trim() === "") {
      avisar.error("Escribe un motivo antes de archivar a este cliente.");
      return;
    }
    const firma = responsable.firma();
    await guardarAccion(
      () => archivarClienta(id, motivoArchivo, anonimizando, c.version, firma),
      anonimizando ? "anonimizar la ficha" : "archivar la ficha",
      () => avisar.exito(anonimizando ? "Ficha anonimizada" : "Cliente archivado"),
    );
  }

  async function onReactivar() {
    const firma = responsable.firma();
    await guardarAccion(() => reactivarClienta(id, c.version, firma), "reactivar la ficha", () => avisar.exito("Cliente reactivado"));
  }

  async function onBuscarParaUnir(e: React.FormEvent) {
    e.preventDefault();
    if (terminoUnir.trim() === "") {
      setResultadosUnir(null);
      return;
    }
    const { clientas, error } = await buscarClienta(terminoUnir);
    if (error) {
      avisar.error(traducirError(error, "buscar la otra ficha"));
      return;
    }
    setResultadosUnir(clientas.filter((otra) => otra.id !== id));
  }

  async function onUnir() {
    if (!aFusionar) return;
    const firma = responsable.firma();
    await guardarAccion(
      () => unirClientas(id, aFusionar.id, c.version, aFusionar.version, firma),
      "unir las dos fichas",
      () => avisar.exito("Fichas unidas", { detalle: "Sus ventas, cambios y apartados ahora están en esta ficha." }),
    );
  }

  // ---- El club: su BAJA (ADR-0288 tanda 1b; desde la 1g, lo único del club que se registra en la ficha) ----

  async function onBaja() {
    if (!c.telefonoWhatsapp) return;
    const firma = responsable.firma();
    const celular = c.telefonoWhatsapp;
    let fichas = 0;
    await guardarAccion(
      async () => {
        const r = await registrarBajaWhatsapp(celular, responsable.ubicacionId, firma);
        fichas = r.fichas;
        return r;
      },
      "registrar su BAJA",
      () =>
        avisar.exito("BAJA registrada", {
          detalle: fichas > 1 ? `Sin novedades por WhatsApp desde hoy, en las ${fichas} fichas con ese celular. Sigue siendo miembro.` : "Sin novedades por WhatsApp desde hoy. Sigue siendo miembro.",
        }),
    );
  }

  const volverAVer = (
    <Boton type="button" onClick={() => setModo("ver")}>
      Cancelar
    </Boton>
  );

  return (
    <Modal
      titulo={c.nombre ?? documento ?? "Sin nombre"}
      subtitulo={
        !activa
          ? c.anonimizada
            ? "Ficha anonimizada — sin datos personales (Ley 29733)"
            : c.fusionadaEnId
              ? "Esta ficha se unió a otra"
              : `Ficha archivada: ${c.motivoArchivo}`
          : [documento, c.telefonoWhatsapp, c.codigoClub].filter(Boolean).join(" · ") || "Sin documento ni celular"
      }
      onClose={onClose}
      variante="hoja"
      ancho="max-w-2xl"
    >
      {() => (
        <div ref={raiz} className="space-y-5">
          {modo === "ver" && (
            <>
              {/* Lo primero, lo que más se busca (spike del club, `modalFicha`): los datos de un vistazo. Lo demás se reparte en dos
                  pestañas —Club y Actividad— en vez de apilar nueve bloques, y «Editar» queda arriba, sin tener que bajar. */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Dato etiqueta="Cumpleaños" valor={cumpleLegible(c.cumpleDia, c.cumpleMes, c.cumpleAnio)} />
                <Dato etiqueta="Club" valor={c.clubDesde ? `Desde ${fecha(c.clubDesde)}` : "No es miembro"} />
                <Dato etiqueta="Frecuente" valor={frecuente.esFrecuente ? "Sí" : `Falta ${frecuente.faltanParaFrecuente}`} tono={frecuente.esFrecuente ? "verde" : undefined} />
                <Dato etiqueta="Su sede" valor={suSede.valor} detalle={suSede.detalle} />
              </div>

              <div className="flex items-end justify-between gap-3 border-b border-sand">
                {/* Club o Actividad son dos secciones de la ficha: la pestaña de vista del sistema (ADR-0358). La línea la pone la fila. */}
                <Pestanas
                  etiquetaAccesible="Qué ver de este cliente"
                  idIndicador="ficha-cliente-vista"
                  activa={vistaActual}
                  onCambio={(clave) => setVista(clave as Vista)}
                  className="-mb-px border-b-0"
                  items={[
                    ...(conClub ? [{ clave: "club", etiqueta: "Club" }] : []),
                    { clave: "actividad", etiqueta: "Actividad", conteo: totalActividad > 0 ? totalActividad : undefined },
                  ]}
                />
                {activa && (
                  <Boton
                    type="button"
                    peso="primario"
                    className="mb-2 shrink-0 !py-2"
                    onClick={() => {
                      setEdicion(datosDeEdicion(c));
                      setModo("editar");
                    }}
                  >
                    Editar
                  </Boton>
                )}
              </div>

              {vistaActual === "club" && conClub && (
                <div className="space-y-4">
                  <div className="card-cayla divide-y divide-sand">
                    <div className="grid gap-x-4 gap-y-1.5 p-4 sm:grid-cols-[7.5rem_1fr] sm:items-center">
                      <span className="label-cayla text-[10.5px] text-tinta/55">Club</span>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Chip tono="verde">Miembro</Chip>
                        <span className="text-xs text-tinta/60">
                          desde {fecha(c.clubDesde!)}
                          {c.codigoClub ? ` · ${c.codigoClub}` : ""}
                        </span>
                      </div>
                      <span className="text-xs text-tinta/55 sm:col-start-2">Su cupón de cumpleaños y su vale de aniversario, en tienda.</span>
                    </div>
                    <div className="grid gap-x-4 gap-y-1.5 p-4 sm:grid-cols-[7.5rem_1fr] sm:items-center">
                      <span className="label-cayla text-[10.5px] text-tinta/55">Publicidad</span>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        {c.publicidadDesde ? (
                          <>
                            <Chip tono="verde">Con publicidad</Chip>
                            <span className="text-xs text-tinta/60">desde {fecha(c.publicidadDesde)}</span>
                          </>
                        ) : (
                          <>
                            <Chip tono="neutro">Sin publicidad</Chip>
                            <span className="text-xs text-tinta/60">no la pidió: es miembro sin mensajes</span>
                          </>
                        )}
                        {/* «Registrar su BAJA»: solo si tiene publicidad (y su celular, que es lo que se da de baja). */}
                        {activa && c.publicidadDesde && c.telefonoWhatsapp && (
                          <Boton type="button" className="!py-1.5 sm:ml-auto" onClick={() => setModo("baja")}>
                            Registrar su BAJA
                          </Boton>
                        )}
                      </div>
                      <span className="text-xs text-tinta/55 sm:col-start-2">
                        Solo el cliente la acepta, desde el cartel. Si te escribe BAJA, regístralo aquí: vale para las 3 tiendas.
                      </span>
                    </div>
                  </div>

                  <PreferenciasClienta
                    clientaId={c.id}
                    version={c.version}
                    guardadas={c.preferencias ?? {}}
                    soloLectura={!activa}
                    onGuardada={(version, preferencias) => setFicha((f) => (f ? { ...f, clienta: { ...f.clienta, version, preferencias } } : f))}
                  />

                  <HistoriaPermisos clientaId={c.id} clave={c.version} />
                </div>
              )}

              {vistaActual === "actividad" && (
                <div className="space-y-5">
                  {!c.anonimizada && !conClub && (
                    <div className="rounded-xl bg-hueso px-4 py-3 text-sm text-tinta/80">
                      <b className="font-semibold text-tinta">Tiene ficha pero no es del club.</b>{" "}
                      {faltaParaElClub ?? "Se une por su cuenta, escaneando el cartel del club con su celular y este mismo documento."}
                    </div>
                  )}

                  {tallas.length > 0 && (
                    <p className="text-sm text-tinta/75">
                      <span className="label-cayla mr-2 text-[10.5px] text-tinta/55">Talla que suele comprar</span>
                      {tallas.map((t) => `${t.categoria}: ${t.talla}`).join(" · ")}
                    </p>
                  )}

                  {totalActividad === 0 ? (
                    <Vacio tamano="chico" icono={<ShoppingBag />}>
                      Todavía no tiene compras, cambios, devoluciones ni apartados.
                    </Vacio>

                  ) : (
                    <>
                      <SeccionActividad titulo="Compras" total={ficha.compras.length}>
                        {ficha.compras.map((compra) => (
                          <FilaActividad
                            key={compra.ventaId}
                            fecha={fecha(compra.fecha)}
                            texto={compra.ubicacion}
                            detalle={compra.items.map((i) => `${i.cantidad}× ${i.categoria ?? "prenda"}${i.talla ? ` (${i.talla})` : ""}`).join(", ")}
                            monto={soles(compra.total)}
                          />
                        ))}
                      </SeccionActividad>

                      <SeccionActividad titulo="Cambios" total={ficha.cambios.length}>
                        {ficha.cambios.map((cambio) => (
                          <FilaActividad key={cambio.id} fecha={fecha(cambio.fecha)} texto={cambio.ubicacion} detalle={cambio.motivo ?? "—"} />
                        ))}
                      </SeccionActividad>

                      <SeccionActividad titulo="Devoluciones" total={ficha.devoluciones.length}>
                        {ficha.devoluciones.map((d) => (
                          <FilaActividad key={d.id} fecha={fecha(d.fecha)} texto={d.estado} detalle={d.motivo ?? "—"} />
                        ))}
                      </SeccionActividad>

                      <SeccionActividad titulo="Apartados" total={ficha.separaciones.length}>
                        {ficha.separaciones.map((s) => (
                          <FilaActividad key={s.id} fecha={fecha(s.fecha)} texto={s.codigo} detalle={s.estado} monto={soles(s.total)} />
                        ))}
                      </SeccionActividad>
                    </>
                  )}
                </div>
              )}

              {/* Lo que se hace pocas veces va abajo y discreto; lo de todos los días («Editar») está arriba. */}
              {activa ? (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-sand pt-3">
                  <button
                    type="button"
                    className="btn-cayla btn-sutil"
                    onClick={() => {
                      setTerminoUnir("");
                      setResultadosUnir(null);
                      setAFusionar(null);
                      setModo("unir");
                    }}
                  >
                    Unir con otra ficha
                  </button>
                  <button
                    type="button"
                    className="btn-cayla btn-sutil"
                    onClick={() => {
                      setMotivoArchivo("");
                      setAnonimizar(false);
                      setModo("archivar");
                    }}
                  >
                    Archivar
                  </button>
                </div>
              ) : (
                !c.anonimizada &&
                !c.fusionadaEnId && (
                  <div className="flex flex-wrap justify-end gap-3 border-t border-sand pt-4">
                    <ComboResponsable control={responsable} deshabilitado={guardando} compacto />
                    <Boton type="button" peso="primario" cargando={guardando} onClick={onReactivar} disabled={!responsable.listo}>
                      Reactivar
                    </Boton>
                  </div>
                )
              )}
            </>
          )}

          {modo === "editar" && edicion && (
            <form onSubmit={onEditar} className="space-y-4">
              <CampoGuiado id="documento" guia={guia} className="grid gap-3 sm:grid-cols-2">
                <CampoTipoDocumento
                  tipo={edicion.documentoTipo}
                  onTipo={(t) => setEdicion((d) => d && { ...d, documentoTipo: t, documentoNumero: ajustarNumeroAlTipo(t, d.documentoNumero) })}
                />
                <CampoNumeroDocumento
                  tipo={edicion.documentoTipo}
                  numero={edicion.documentoNumero}
                  onNumero={(v) => setEdicion((d) => d && { ...d, documentoNumero: v })}
                />
              </CampoGuiado>
              <CampoGuiado id="nombre" guia={guia}>
                <CampoTexto etiqueta={guia.etiqueta("nombre", "Nombre")} value={edicion.nombre} onChange={(e) => setEdicion((d) => d && { ...d, nombre: e.target.value })} />
              </CampoGuiado>
              <CampoGuiado id="celular" guia={guia}>
                <CampoCelular
                  etiqueta={guia.etiqueta("celular", "Celular (WhatsApp)")}
                  obligatorio={c.clubDesde !== null}
                  valor={edicion.telefonoWhatsapp}
                  onValor={(v) => setEdicion((d) => d && { ...d, telefonoWhatsapp: v })}
                />
                {/* Recibe novedades en el celular de ahora: al cambiarlo las pierde (la base se las quita sola), y se dice antes. */}
                {avisoCelular && <p className="nota-cayla mt-2 text-[13px]">{avisoCelular}</p>}
              </CampoGuiado>
              <CampoGuiado id="cumple" guia={guia} titulo="Cumpleaños" ayuda="Día y mes; el año, solo si lo quiere decir">
                <CamposCumpleanos
                  cumple={cumpleDeEdicion(edicion)}
                  onCumple={(nuevo) => setEdicion((d) => d && { ...d, cumpleDia: nuevo.dia, cumpleMes: nuevo.mes, cumpleAnio: nuevo.anio })}
                  anioActual={anioActual}
                  despues="se puede agregar después."
                />
              </CampoGuiado>
              <p className="text-xs text-tinta/65">El club y las novedades por WhatsApp no se cambian aquí: se ven y se registran en la ficha.</p>
              <CampoGuiado id="responsable" guia={guia}>
                <ComboResponsable control={responsable} deshabilitado={guardando} />
              </CampoGuiado>
              <PieGuia guia={guia} listo="Todo listo para guardar." />
              <div className="pie-hoja-fijo flex justify-end gap-3 pt-2">
                {volverAVer}
                <Boton
                  type="submit"
                  peso="primario"
                  cargando={guardando}
                  disabled={!responsable.listo}
                  title={responsable.motivo ?? guia.frase ?? undefined}
                  className={guia.claseConfirmar}
                >
                  Guardar
                </Boton>
              </div>
            </form>
          )}

          {modo === "archivar" && (
            <div className="space-y-4">
              <CampoGuiado id="motivo" guia={guia}>
                <CampoTexto etiqueta={guia.etiqueta("motivo", "Motivo")} value={motivoArchivo} onChange={(e) => setMotivoArchivo(e.target.value)} placeholder="Ya no compra, cerró su número…" />
              </CampoGuiado>
              <CampoGuiado id="anonimizar" guia={guia}>
                <Interruptor
                  activo={anonimizar}
                  onActivo={setAnonimizar}
                  etiqueta={guia.etiqueta("anonimizar", "Anonimizar sus datos personales (Ley 29733)")}
                  pie="Borra documento, celular, cumpleaños, tallas y su lugar en el club (sale del club y de las novedades). Sus compras y apartados NO se tocan — solo desaparece quién es. No se puede deshacer."
                />
              </CampoGuiado>
              <CampoGuiado id="responsable" guia={guia}>
                <ComboResponsable control={responsable} deshabilitado={guardando} />
              </CampoGuiado>
              <PieGuia guia={guia} listo={anonimizar ? "Todo listo para anonimizar." : "Todo listo para archivar."} />
              <div className="flex justify-end gap-3 pt-2">
                {volverAVer}
                <Boton
                  type="button"
                  peso="primario"
                  cargando={guardando}
                  onClick={() => onArchivar(anonimizar)}
                  disabled={!responsable.listo}
                  title={guia.frase ?? undefined}
                  className={guia.claseConfirmar}
                >
                  {anonimizar ? "Anonimizar" : "Archivar"}
                </Boton>
              </div>
            </div>
          )}

          {modo === "unir" && (
            <div className="space-y-4">
              <p className="text-sm text-tinta/70">
                Busca la otra ficha de este mismo cliente (la que se creó con su celular, por ejemplo). Sus ventas, cambios y apartados
                pasan a <strong>esta</strong> ficha; la otra queda anonimizada y archivada.
              </p>
              <CampoGuiado id="otra" guia={guia} titulo="La otra ficha" className="space-y-3">
                <form onSubmit={onBuscarParaUnir} className="flex items-end gap-3">
                  <div className="max-w-sm flex-1">
                    <CampoTexto etiqueta="Buscar" value={terminoUnir} onChange={(e) => setTerminoUnir(e.target.value)} placeholder="Documento, WhatsApp o nombre…" /* sugerir-fijo: qué se puede buscar en la libreta; no depende de nada elegido antes */ />
                  </div>
                  <Boton type="submit">Buscar</Boton>
                </form>
                {resultadosUnir !== null && (
                  <div className="space-y-2">
                    {resultadosUnir.length === 0 ? (
                      <p className="text-sm text-tinta/65">Sin coincidencias.</p>
                    ) : (
                      resultadosUnir.map((otra) => (
                        <button
                          key={otra.id}
                          type="button"
                          onClick={() => setAFusionar(otra)}
                          className={`card-cayla flex w-full items-center justify-between gap-4 p-3 text-left ${aFusionar?.id === otra.id ? "ring-2 ring-rojo" : ""}`}
                        >
                          <span className="text-sm text-tinta">{otra.nombre ?? "Sin nombre"}</span>
                          <span className="text-xs text-tinta/65">
                            {[documentoLegible(otra.documentoTipo, otra.documentoNumero, false), otra.telefonoWhatsapp].filter(Boolean).join(" · ")}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </CampoGuiado>
              <CampoGuiado id="responsable" guia={guia}>
                <ComboResponsable control={responsable} deshabilitado={guardando} />
              </CampoGuiado>
              <PieGuia guia={guia} listo="Todo listo para unir." />
              <div className="flex justify-end gap-3 pt-2">
                {volverAVer}
                <Boton
                  type="button"
                  peso="primario"
                  cargando={guardando}
                  onClick={onUnir}
                  disabled={!aFusionar || !responsable.listo}
                  title={guia.frase ?? undefined}
                  className={guia.claseConfirmar}
                >
                  Unir a esta ficha
                </Boton>
              </div>
            </div>
          )}

          {modo === "baja" && (
            <div className="space-y-5">
              <p className="text-sm text-tinta/75">
                Escribió BAJA (o pidió que no le manden más novedades). Desde hoy no se le envían novedades, rebajas ni los avisos de sus
                cupones por WhatsApp, en las 3 tiendas. <strong>Sigue siendo miembro</strong>: su cupón de cumpleaños y su vale de aniversario
                siguen, en tienda.
              </p>
              <p className="text-xs text-tinta/65">Vale para toda ficha con el celular {c.telefonoWhatsapp}.</p>
              <CampoGuiado id="responsable" guia={guia}>
                <ComboResponsable control={responsable} deshabilitado={guardando} />
              </CampoGuiado>
              <PieGuia guia={guia} listo="Todo listo para registrar la BAJA." />
              <div className="flex justify-end gap-3 pt-2">
                {volverAVer}
                <Boton
                  type="button"
                  peso="primario"
                  cargando={guardando}
                  onClick={onBaja}
                  disabled={!responsable.listo}
                  title={responsable.motivo ?? undefined}
                  className={guia.claseConfirmar}
                >
                  Registrar la BAJA
                </Boton>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Dato({ etiqueta, valor, tono, detalle }: { etiqueta: string; valor: string; tono?: "verde"; detalle?: string | null }) {
  return (
    <div>
      <p className="label-cayla text-[10px] text-tinta/50">{etiqueta}</p>
      <p className={`mt-0.5 text-sm font-medium ${tono === "verde" ? "text-verde" : "text-tinta"}`}>
        {valor}
        {detalle && <span className="text-xs font-normal text-tinta/55"> · {detalle}</span>}
      </p>
    </div>
  );
}

const FILAS_VISIBLES = 5;

/** Una lista de lo que hizo (compras, cambios…): sin filas no se dibuja (antes cada vacía ocupaba su título y su «Sin …»), y
 *  con muchas muestra las 5 más recientes y el resto a un toque. */
function SeccionActividad({ titulo, total, children }: { titulo: string; total: number; children: React.ReactNode[] }) {
  const [todas, setTodas] = useState(false);
  if (total === 0) return null;
  return (
    <div>
      <p className="label-cayla text-[11px] text-tinta/65">
        {titulo} <span className="tabular-nums text-tinta/45">· {total}</span>
      </p>
      <div className="mt-2 space-y-1.5">{todas ? children : children.slice(0, FILAS_VISIBLES)}</div>
      {total > FILAS_VISIBLES && (
        <button type="button" className="btn-cayla btn-sutil mt-1" onClick={() => setTodas((t) => !t)}>
          {todas ? "Ver menos" : `Ver las ${total}`}
        </button>
      )}
    </div>
  );
}

function FilaActividad({ fecha, texto, detalle, monto }: { fecha: string; texto: string; detalle: string; monto?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-tinta/5 py-1.5 text-sm last:border-0">
      <div className="min-w-0">
        <span className="text-tinta/50">{fecha}</span> <span className="text-tinta">{texto}</span>
        <p className="truncate text-xs text-tinta/60">{detalle}</p>
      </div>
      {monto && <span className="shrink-0 font-medium text-tinta">{monto}</span>}
    </div>
  );
}
