"use client";

import { useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";

/**
 * Vocabulario cerrado de etiquetas de catálogo (folksonomy: "Oferta",
 * "Verano 2026") — distinto de la etiqueta física de código de barras que
 * ya existe en Inventario/Movimientos. Mismo mecanismo propone/aprueba/
 * rechaza que colores/tejidos/patrones.
 *
 * Sin restricción por sede a propósito (Felipe, 2026-09-18): "empresa
 * uniforme" — toda etiqueta aplica igual en todas las sedes. La columna
 * `sedes_permitidas` sigue en el esquema (dormida, sin UI) por si algún
 * día hace falta de verdad; no se dropeó porque revivirla no pide
 * migración nueva. Ver 20260918020000_para_liquidar_global_no_por_sede.sql
 * para el porqué: no es cosmética, bloquea venta/traslado de verdad.
 *
 * Aplicar/quitar una etiqueta de una VARIANTE puntual no vive acá — es
 * edición normal de producto (`variantes_write_lider`, ya conectado en
 * ProductoForm.tsx — ese selector solo ofrece las que están vigentes hoy).
 *
 * `estilo` agrupa visualmente en 3 familias + "General" — paleta cerrada
 * a propósito (Felipe: "colores suaves dentro de nuestra paleta", nunca
 * libre), sin usar rojo (acento sagrado, máx. 2 usos por pantalla — un
 * badge por cada una de 20 tarjetas lo rompería). Ver
 * 20260918060000_etiquetas_estilo_visual.sql.
 */

type Estilo = "neutral" | "urgencia" | "positivo" | "campana";

const ESTILOS: Record<Estilo, { grupo: string; dot: string; texto: string }> = {
  urgencia: { grupo: "Rotación", dot: "bg-ambar", texto: "text-ambar" },
  positivo: { grupo: "Artesanal", dot: "bg-verde", texto: "text-verde" },
  campana: { grupo: "Campaña y festividad", dot: "bg-taupe-profundo", texto: "text-taupe-profundo" },
  neutral: { grupo: "General", dot: "bg-tinta/25", texto: "text-tinta/55" },
};

const ORDEN_GRUPOS: Estilo[] = ["urgencia", "positivo", "campana", "neutral"];

const formatoFecha = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short" });

function rangoVigencia(desde: string | null, hasta: string | null) {
  if (!desde && !hasta) return null;
  const hoy = new Date().toISOString().slice(0, 10);
  const vigente = (!desde || desde <= hoy) && (!hasta || hasta >= hoy);
  const rango = [desde, hasta].filter(Boolean).map((f) => formatoFecha.format(new Date(f + "T00:00:00"))).join(" – ");
  return { vigente, texto: vigente ? `Vigente: ${rango}` : `Fuera de temporada: ${rango}` };
}

type Etiqueta = {
  id: string;
  nombre: string;
  activo: boolean;
  notas: string | null;
  estado: "pendiente" | "aprobado" | "rechazado";
  estilo: Estilo;
  vigenteDesde: string | null;
  vigenteHasta: string | null;
};

function ordenar(lista: Etiqueta[]) {
  return [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export function EtiquetasLista({ etiquetasIniciales, puedeEditar }: { etiquetasIniciales: Etiqueta[]; puedeEditar: boolean }) {
  const [etiquetas, setEtiquetas] = useState(() => ordenar(etiquetasIniciales));
  const [agregando, setAgregando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aprobandoId, setAprobandoId] = useState<string | null>(null);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);
  const [rechazandoAbierto, setRechazandoAbierto] = useState<string | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [rechazandoId, setRechazandoId] = useState<string | null>(null);

  const activas = etiquetas.filter((e) => e.activo);
  const desactivadas = etiquetas.filter((e) => !e.activo);

  async function guardar() {
    setGuardando(true);
    try {
      const res = await fetch("/api/productos/etiquetas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo agregar la etiqueta.");
        return;
      }
      setEtiquetas((actual) =>
        ordenar([
          ...actual,
          {
            id: datos.etiqueta.id,
            nombre: datos.etiqueta.nombre,
            activo: true,
            notas: datos.etiqueta.notas,
            estado: datos.etiqueta.estado,
            estilo: "neutral",
            vigenteDesde: null,
            vigenteHasta: null,
          },
        ])
      );
      avisar.exito(
        datos.etiqueta.estado === "pendiente" ? `${datos.etiqueta.nombre} agregada — ya la puedes usar` : `Etiqueta ${datos.etiqueta.nombre} agregada`,
        datos.etiqueta.estado === "pendiente" ? { detalle: "Queda pendiente de que un Líder la apruebe, pero eso no te frena." } : undefined
      );
      setAgregando(false);
      setNombre("");
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setGuardando(false);
    }
  }

  async function aprobar(e: Etiqueta) {
    setAprobandoId(e.id);
    try {
      const res = await fetch("/api/productos/etiquetas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: e.id, estado: "aprobado" }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo aprobar la etiqueta.");
        return;
      }
      setEtiquetas((actual) => ordenar(actual.map((x) => (x.id === e.id ? { ...x, estado: "aprobado" as const, activo: true } : x))));
      avisar.exito(`${e.nombre} aprobada`);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setAprobandoId(null);
    }
  }

  async function rechazar(e: Etiqueta) {
    setRechazandoId(e.id);
    try {
      const res = await fetch("/api/productos/etiquetas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: e.id, estado: "rechazado", ...(motivoRechazo.trim() ? { notas: motivoRechazo.trim() } : {}) }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo rechazar la etiqueta.");
        return;
      }
      setEtiquetas((actual) => ordenar(actual.map((x) => (x.id === e.id ? { ...x, activo: false, estado: "rechazado" as const } : x))));
      avisar.exito(`${e.nombre} rechazada`, { detalle: "Cae a Desactivadas. Se puede reactivar después si hace falta." });
      setRechazandoAbierto(null);
      setMotivoRechazo("");
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setRechazandoId(null);
    }
  }

  async function reactivar(e: Etiqueta) {
    setCambiandoId(e.id);
    try {
      const res = await fetch("/api/productos/etiquetas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(e.estado === "rechazado" ? { id: e.id, estado: "aprobado" } : { id: e.id, activo: true }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo reactivar la etiqueta.");
        return;
      }
      setEtiquetas((actual) => ordenar(actual.map((x) => (x.id === e.id ? { ...x, activo: true, estado: "aprobado" as const } : x))));
      avisar.exito(`${e.nombre} reactivada`, { detalle: "Vuelve a aparecer al etiquetar una variante." });
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCambiandoId(null);
    }
  }

  async function desactivar(e: Etiqueta) {
    setCambiandoId(e.id);
    try {
      const res = await fetch("/api/productos/etiquetas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: e.id, activo: false }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo desactivar la etiqueta.");
        return;
      }
      setEtiquetas((actual) => ordenar(actual.map((x) => (x.id === e.id ? { ...x, activo: false } : x))));
      avisar.exito(`${e.nombre} desactivada`, { detalle: "Deja de aparecer al etiquetar una variante nueva; el historial se conserva." });
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCambiandoId(null);
    }
  }

  return (
    <div className="space-y-6">
      {agregando ? (
        <div className="card-cayla space-y-3 p-4">
          <div className="flex items-end gap-2">
            <CampoTexto
              etiqueta="Nombre de la etiqueta"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Oferta, Verano 2026"
              className="flex-1"
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <Boton peso="primario" className="flex-1" onClick={guardar} cargando={guardando} disabled={!nombre.trim()}>
              Guardar etiqueta
            </Boton>
            <Boton peso="fantasma" className="flex-1" onClick={() => setAgregando(false)} disabled={guardando}>
              Cancelar
            </Boton>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setAgregando(true)}
            className="label-cayla rounded-md bg-tinta px-4 py-3 text-[11px] text-crema transition-colors hover:bg-rojo"
          >
            + Agregar etiqueta
          </button>
        </div>
      )}

      <div className="space-y-5">
        {ORDEN_GRUPOS.map((clave) => {
          const delGrupo = activas.filter((e) => e.estilo === clave);
          if (delGrupo.length === 0) return null;
          const { grupo, dot } = ESTILOS[clave];
          return (
            <section key={clave} className="space-y-2">
              <p className="label-cayla flex items-center gap-1.5 text-[11px] text-tinta/65">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
                {grupo}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {delGrupo.map((e) => {
                  const vigencia = rangoVigencia(e.vigenteDesde, e.vigenteHasta);
                  return (
                    <div key={e.id} className="card-cayla flex flex-col gap-2 p-4" title={e.notas ?? undefined}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-tinta">{e.nombre}</p>
                        {e.estado === "pendiente" && (
                          <span className="label-cayla shrink-0 rounded-full bg-rojo/10 px-2 py-0.5 text-[10px] text-rojo">Pendiente</span>
                        )}
                      </div>
                      {vigencia && (
                        <p className={`text-[11px] ${vigencia.vigente ? ESTILOS[clave].texto : "text-tinta/40"}`}>{vigencia.texto}</p>
                      )}
                      {puedeEditar && (
                        <div className="flex gap-2">
                          {e.estado === "pendiente" && (
                            <Boton
                              peso="primario"
                              className="flex-1 px-2.5 py-1.5 text-[11px]"
                              cargando={aprobandoId === e.id}
                              onClick={() => aprobar(e)}
                            >
                              Aprobar
                            </Boton>
                          )}
                          {e.estado === "pendiente" ? (
                            <Boton
                              peso="discreto"
                              className="flex-1 px-2.5 py-1.5 text-[11px] text-rojo"
                              onClick={() => {
                                setRechazandoAbierto(rechazandoAbierto === e.id ? null : e.id);
                                setMotivoRechazo("");
                              }}
                            >
                              Rechazar
                            </Boton>
                          ) : (
                            <Boton
                              peso="discreto"
                              className="flex-1 px-2.5 py-1.5 text-[11px]"
                              cargando={cambiandoId === e.id}
                              onClick={() => desactivar(e)}
                            >
                              Desactivar
                            </Boton>
                          )}
                        </div>
                      )}
                      {rechazandoAbierto === e.id && (
                        <div className="space-y-1.5 border-t border-tinta/10 pt-2">
                          <input
                            autoFocus
                            value={motivoRechazo}
                            onChange={(ev) => setMotivoRechazo(ev.target.value)}
                            placeholder="Motivo (opcional)"
                            className="w-full border-b border-tinta/25 bg-transparent px-0.5 py-1 text-[11px] text-tinta outline-none placeholder:text-tinta/40 focus:border-b-2 focus:border-rojo"
                          />
                          <Boton peso="primario" className="w-full px-2.5 py-1.5 text-[11px]" cargando={rechazandoId === e.id} onClick={() => rechazar(e)}>
                            Confirmar rechazo
                          </Boton>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {desactivadas.length > 0 && (
        <section className="space-y-2">
          <p className="label-cayla text-[11px] text-tinta/65">Desactivadas — ya no se pueden aplicar a una variante nueva</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {desactivadas.map((e) => (
              <div key={e.id} className="card-cayla flex flex-col gap-2 p-4 opacity-60">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-tinta">{e.nombre}</p>
                  {e.estado === "rechazado" && (
                    <span className="label-cayla shrink-0 rounded-full bg-rojo/10 px-2 py-0.5 text-[10px] text-rojo">Rechazada</span>
                  )}
                </div>
                {puedeEditar && (
                  <Boton peso="discreto" className="px-2.5 py-1.5 text-[11px]" cargando={cambiandoId === e.id} onClick={() => reactivar(e)}>
                    Reactivar
                  </Boton>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
