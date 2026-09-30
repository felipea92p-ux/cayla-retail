"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { CampoTexto, Boton, Interruptor } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoNumeroDocumento, CampoTipoDocumento, ID_NUMERO_DOCUMENTO } from "@/components/CampoDocumentoClienta";
import { useResponsable } from "@/lib/useResponsable";
import { avisar } from "@/components/ui/Avisos";
import { esVersionCambiada, traducirError } from "@/lib/error-escritura";
import { estaActiva, type Clienta, type FichaClienta } from "@/lib/clientas-reglas";
import { deducirTallas, estadoFrecuente } from "@/lib/clienta-actividad-reglas";
import { ajustarNumeroAlTipo, documentoLegible, problemaDocumento } from "@/lib/documento-clienta-reglas";
import {
  archivarClienta,
  buscarClienta,
  cargarFichaClienta,
  editarClienta,
  reactivarClienta,
  unirClientas,
  type DatosEdicion,
} from "@/lib/clientas-acciones";

type Modo = "ver" | "editar" | "archivar" | "unir";

const FORMATO_FECHA = new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric" });
function fecha(iso: string): string {
  return FORMATO_FECHA.format(new Date(iso));
}
function soles(n: number): string {
  return `S/ ${n.toFixed(2)}`;
}

function datosDeEdicion(c: Clienta): DatosEdicion {
  return {
    documentoTipo: c.documentoTipo,
    documentoNumero: c.documentoNumero ?? "",
    nombre: c.nombre ?? "",
    telefonoWhatsapp: c.telefonoWhatsapp ?? "",
    aceptaWhatsapp: c.tienePermisoWhatsapp,
    cumpleDia: c.cumpleDia?.toString() ?? "",
    cumpleMes: c.cumpleMes?.toString() ?? "",
    tallas: c.tallas,
    revocaWhatsapp: false,
  };
}

/**
 * La ficha completa de una clienta (paso 2 del acta, `docs/datos/DECISIONES-2026-09-26-clientas.md`
 * sección H): ver su actividad, editar con candado optimista (ADR-0193 reusado), archivar/
 * anonimizar (Ley 29733, nunca `delete`) y unir con otra ficha (D-99). UN solo `<Modal
 * variante="hoja">` que cambia de contenido por `modo` — ADR-0136 no anida modales, cada acción
 * responde adentro del mismo panel.
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
  const responsable = useResponsable();

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar / cambiar id
  }, [id]);

  async function cargar() {
    setCargando(true);
    const { ficha, error } = await cargarFichaClienta(id);
    setCargando(false);
    if (error || !ficha) {
      avisar.error(traducirError(error, "abrir la ficha de la clienta"));
      onClose();
      return;
    }
    setFicha(ficha);
    setModo("ver");
  }

  if (cargando || !ficha) {
    return (
      <Modal titulo="Clienta" subtitulo="Cargando…" onClose={onClose} variante="hoja">
        <p className="text-sm text-tinta/65">Un momento…</p>
      </Modal>
    );
  }

  const c = ficha.clienta;
  const activa = estaActiva(c);
  const tallas = deducirTallas(ficha.compras);
  const frecuente = estadoFrecuente(ficha.compras, new Date());
  // Dentro de la ficha el documento se ve completo, con su tipo («DNI 71234482», «CE 001234567»): quien la abre ya la
  // buscó a propósito. Lo que se enmascara es el mostrador del Punto de venta.
  const documento = documentoLegible(c.documentoTipo, c.documentoNumero, false);

  async function onEditar(e: React.FormEvent) {
    e.preventDefault();
    if (!edicion) return;
    // El documento es opcional, pero si se escribe tiene que estar completo: la base rechaza uno a medias (ADR-0288 D-2).
    const problema = problemaDocumento(edicion.documentoTipo, edicion.documentoNumero);
    if (problema) {
      avisar.error(problema, { enfocar: ID_NUMERO_DOCUMENTO });
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const { error } = await editarClienta(id, edicion, c.version, responsable.firma());
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      if (esVersionCambiada(error)) {
        avisar.error(traducirError(error, "editar la ficha"), { accion: { texto: "Recargar", onClick: () => void cargar() } });
        return;
      }
      avisar.error(traducirError(error, "editar la ficha"));
      return;
    }
    avisar.exito("Ficha actualizada");
    await cargar();
  }

  async function onArchivar(anonimizando: boolean) {
    if (motivoArchivo.trim() === "") {
      avisar.error("Escribe un motivo antes de archivar a esta clienta.");
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const { error } = await archivarClienta(id, motivoArchivo, anonimizando, c.version, responsable.firma());
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, anonimizando ? "anonimizar la ficha" : "archivar la ficha"));
      return;
    }
    avisar.exito(anonimizando ? "Ficha anonimizada" : "Clienta archivada");
    onCambiada();
    await cargar();
  }

  async function onReactivar() {
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const { error } = await reactivarClienta(id, c.version, responsable.firma());
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "reactivar la ficha"));
      return;
    }
    avisar.exito("Clienta reactivada");
    onCambiada();
    await cargar();
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
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const { error } = await unirClientas(id, aFusionar.id, c.version, aFusionar.version, responsable.firma());
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "unir las dos fichas"));
      return;
    }
    avisar.exito("Fichas unidas", { detalle: "Sus ventas, cambios y apartados ahora están en esta ficha." });
    onCambiada();
    await cargar();
  }

  return (
    <Modal
      titulo={c.nombre ?? documento ?? "Sin nombre"}
      subtitulo={
        !activa
          ? c.anonimizada
            ? "Ficha anonimizada — sin datos personales (Ley 29733)"
            : c.fusionadaEnId
              ? "Esta ficha se unió a otra"
              : `Archivada: ${c.motivoArchivo}`
          : [documento, c.telefonoWhatsapp].filter(Boolean).join(" · ") || "Sin documento ni WhatsApp"
      }
      onClose={onClose}
      variante="hoja"
      ancho="max-w-2xl"
    >
      {() => (
        <div className="space-y-6">
          {modo === "ver" && (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Dato etiqueta="Cumpleaños" valor={c.cumpleDia && c.cumpleMes ? `${c.cumpleDia}/${c.cumpleMes}` : "—"} />
                <Dato etiqueta="WhatsApp" valor={c.tienePermisoWhatsapp ? "Con permiso" : "Sin permiso"} tono={c.tienePermisoWhatsapp ? "verde" : undefined} />
                <Dato etiqueta="Frecuente" valor={frecuente.esFrecuente ? "Sí" : `Falta ${frecuente.faltanParaFrecuente}`} tono={frecuente.esFrecuente ? "verde" : undefined} />
                <Dato etiqueta="Desde" valor={fecha(c.createdAt)} />
              </div>

              {tallas.length > 0 && (
                <div className="card-cayla p-4">
                  <p className="label-cayla text-[11px] text-tinta/65">Talla deducida de lo que compra</p>
                  <p className="mt-1 text-sm text-tinta">{tallas.map((t) => `${t.categoria}: ${t.talla}`).join(" · ")}</p>
                </div>
              )}

              <SeccionActividad titulo="Compras" vacio="Todavía no tiene compras registradas.">
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

              <SeccionActividad titulo="Cambios" vacio="Sin cambios de prenda.">
                {ficha.cambios.map((cambio) => (
                  <FilaActividad key={cambio.id} fecha={fecha(cambio.fecha)} texto={cambio.ubicacion} detalle={cambio.motivo ?? "—"} />
                ))}
              </SeccionActividad>

              <SeccionActividad titulo="Devoluciones" vacio="Sin devoluciones.">
                {ficha.devoluciones.map((d) => (
                  <FilaActividad key={d.id} fecha={fecha(d.fecha)} texto={d.estado} detalle={d.motivo ?? "—"} />
                ))}
              </SeccionActividad>

              <SeccionActividad titulo="Apartados" vacio="Sin apartados.">
                {ficha.separaciones.map((s) => (
                  <FilaActividad key={s.id} fecha={fecha(s.fecha)} texto={s.codigo} detalle={s.estado} monto={soles(s.total)} />
                ))}
              </SeccionActividad>

              <div className="flex flex-wrap justify-end gap-3 border-t border-tinta/10 pt-4">
                {activa ? (
                  <>
                    <Boton
                      type="button"
                      onClick={() => {
                        setMotivoArchivo("");
                        setAnonimizar(false);
                        setModo("archivar");
                      }}
                    >
                      Archivar
                    </Boton>
                    <Boton
                      type="button"
                      onClick={() => {
                        setTerminoUnir("");
                        setResultadosUnir(null);
                        setAFusionar(null);
                        setModo("unir");
                      }}
                    >
                      Unir con otra ficha
                    </Boton>
                    <Boton
                      type="button"
                      peso="primario"
                      onClick={() => {
                        setEdicion(datosDeEdicion(c));
                        setModo("editar");
                      }}
                    >
                      Editar
                    </Boton>
                  </>
                ) : (
                  !c.anonimizada &&
                  !c.fusionadaEnId && (
                    <>
                      <ComboResponsable control={responsable} deshabilitado={guardando} compacto />
                      <Boton type="button" peso="primario" cargando={guardando} onClick={onReactivar} disabled={!responsable.listo}>
                        Reactivar
                      </Boton>
                    </>
                  )
                )}
              </div>
            </>
          )}

          {modo === "editar" && edicion && (
            <form onSubmit={onEditar} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <CampoTipoDocumento
                  tipo={edicion.documentoTipo}
                  onTipo={(t) => setEdicion((d) => d && { ...d, documentoTipo: t, documentoNumero: ajustarNumeroAlTipo(t, d.documentoNumero) })}
                />
                <CampoNumeroDocumento
                  tipo={edicion.documentoTipo}
                  numero={edicion.documentoNumero}
                  onNumero={(v) => setEdicion((d) => d && { ...d, documentoNumero: v })}
                />
              </div>
              <CampoTexto etiqueta="Nombre" value={edicion.nombre} onChange={(e) => setEdicion((d) => d && { ...d, nombre: e.target.value })} />
              <CampoTexto
                etiqueta="WhatsApp"
                value={edicion.telefonoWhatsapp}
                onChange={(e) => setEdicion((d) => d && { ...d, telefonoWhatsapp: e.target.value })}
                mono
                inputMode="tel"
              />
              {edicion.aceptaWhatsapp && !edicion.revocaWhatsapp ? (
                <Interruptor
                  activo={edicion.revocaWhatsapp}
                  onActivo={(v) => setEdicion((d) => d && { ...d, revocaWhatsapp: v })}
                  etiqueta="Quitar el permiso de WhatsApp"
                  pie="La clienta pidió que ya no le escribamos."
                />
              ) : (
                <Interruptor
                  activo={edicion.aceptaWhatsapp && !edicion.revocaWhatsapp}
                  onActivo={(v) => setEdicion((d) => d && { ...d, aceptaWhatsapp: v, revocaWhatsapp: false })}
                  etiqueta="Acepta que la contactemos por WhatsApp"
                  pie="Permiso APARTE de dejar el número — nunca se asume (Ley 29733)."
                />
              )}
              <div className="grid grid-cols-2 gap-3">
                <CampoTexto
                  etiqueta="Día de cumpleaños"
                  value={edicion.cumpleDia}
                  onChange={(e) => setEdicion((d) => d && { ...d, cumpleDia: e.target.value })}
                  mono
                  inputMode="numeric"
                  placeholder="1-31"
                />
                <CampoTexto
                  etiqueta="Mes de cumpleaños"
                  value={edicion.cumpleMes}
                  onChange={(e) => setEdicion((d) => d && { ...d, cumpleMes: e.target.value })}
                  mono
                  inputMode="numeric"
                  placeholder="1-12"
                />
              </div>
              <ComboResponsable control={responsable} deshabilitado={guardando} />
              <div className="flex justify-end gap-3 pt-2">
                <Boton type="button" onClick={() => setModo("ver")}>
                  Cancelar
                </Boton>
                <Boton type="submit" peso="primario" cargando={guardando} disabled={!responsable.listo} title={responsable.motivo ?? undefined}>
                  Guardar
                </Boton>
              </div>
            </form>
          )}

          {modo === "archivar" && (
            <div className="space-y-4">
              <CampoTexto etiqueta="Motivo" value={motivoArchivo} onChange={(e) => setMotivoArchivo(e.target.value)} placeholder="Ya no compra, cerró su número…" />
              <Interruptor
                activo={anonimizar}
                onActivo={setAnonimizar}
                etiqueta="Anonimizar sus datos personales (Ley 29733)"
                pie="Borra documento, WhatsApp, cumpleaños y tallas de esta ficha. Sus compras y apartados NO se tocan — solo desaparece quién es. No se puede deshacer."
              />
              <ComboResponsable control={responsable} deshabilitado={guardando} />
              <div className="flex justify-end gap-3 pt-2">
                <Boton type="button" onClick={() => setModo("ver")}>
                  Cancelar
                </Boton>
                <Boton type="button" peso="primario" cargando={guardando} onClick={() => onArchivar(anonimizar)} disabled={!responsable.listo}>
                  {anonimizar ? "Anonimizar" : "Archivar"}
                </Boton>
              </div>
            </div>
          )}

          {modo === "unir" && (
            <div className="space-y-4">
              <p className="text-sm text-tinta/70">
                Busca la otra ficha de esta misma clienta (la que se creó con su celular, por ejemplo). Sus ventas, cambios y apartados
                pasan a <strong>esta</strong> ficha; la otra queda anonimizada y archivada.
              </p>
              <form onSubmit={onBuscarParaUnir} className="flex items-end gap-3">
                <div className="max-w-sm flex-1">
                  <CampoTexto etiqueta="Buscar" value={terminoUnir} onChange={(e) => setTerminoUnir(e.target.value)} placeholder="Documento, WhatsApp o nombre…" />
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
                        <span className="text-xs text-tinta/65">{[documentoLegible(otra.documentoTipo, otra.documentoNumero, false), otra.telefonoWhatsapp].filter(Boolean).join(" · ")}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
              {aFusionar && <ComboResponsable control={responsable} deshabilitado={guardando} />}
              <div className="flex justify-end gap-3 pt-2">
                <Boton type="button" onClick={() => setModo("ver")}>
                  Cancelar
                </Boton>
                <Boton type="button" peso="primario" cargando={guardando} onClick={onUnir} disabled={!aFusionar || !responsable.listo}>
                  Unir a esta ficha
                </Boton>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Dato({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono?: "verde" }) {
  return (
    <div>
      <p className="label-cayla text-[10px] text-tinta/50">{etiqueta}</p>
      <p className={`mt-0.5 text-sm font-medium ${tono === "verde" ? "text-verde" : "text-tinta"}`}>{valor}</p>
    </div>
  );
}

function SeccionActividad({ titulo, vacio, children }: { titulo: string; vacio: string; children: React.ReactNode }) {
  const hayContenido = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div>
      <p className="label-cayla text-[11px] text-tinta/65">{titulo}</p>
      <div className="mt-2 space-y-1.5">{hayContenido ? children : <p className="text-sm text-tinta/50">{vacio}</p>}</div>
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
