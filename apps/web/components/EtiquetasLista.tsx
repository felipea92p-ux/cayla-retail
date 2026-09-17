"use client";

import { useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";

/**
 * Vocabulario cerrado de etiquetas de catálogo (folksonomy: "Oferta",
 * "Verano 2026") — distinto de la etiqueta física de código de barras que
 * ya existe en Inventario/Movimientos. Mismo mecanismo propone/aprueba/
 * rechaza que colores/tejidos/patrones, más un campo propio:
 * `sedesPermitidas` — si tiene valores, restringe de verdad en qué sede se
 * puede VENDER o TRASLADAR una variante con esta etiqueta (el candado real
 * vive en `registrar_venta`/`transferir`, esto solo decide el dato). Vacío
 * = sin restricción, visible en cualquier sede.
 *
 * Aplicar/quitar una etiqueta de una VARIANTE puntual no vive acá — es
 * edición normal de producto (`variantes_write_lider`), pendiente de
 * conectarse en ProductoForm.tsx (BACKLOG.md).
 */

type Sede = { id: string; nombre: string };

type Etiqueta = {
  id: string;
  nombre: string;
  activo: boolean;
  sedesPermitidas: string[] | null;
  notas: string | null;
  estado: "pendiente" | "aprobado" | "rechazado";
};

function ordenar(lista: Etiqueta[]) {
  return [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

function SelectorSedes({ sedes, seleccionadas, onCambio }: { sedes: Sede[]; seleccionadas: string[]; onCambio: (ids: string[]) => void }) {
  function alternar(id: string) {
    onCambio(seleccionadas.includes(id) ? seleccionadas.filter((x) => x !== id) : [...seleccionadas, id]);
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {sedes.map((s) => {
        const elegida = seleccionadas.includes(s.id);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => alternar(s.id)}
            className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
              elegida ? "border-rojo/60 bg-rojo/5 text-rojo" : "border-tinta/15 text-tinta/65 hover:border-tinta/35"
            }`}
          >
            {s.nombre}
          </button>
        );
      })}
    </div>
  );
}

export function EtiquetasLista({
  etiquetasIniciales,
  sedes,
  puedeEditar,
}: {
  etiquetasIniciales: Etiqueta[];
  sedes: Sede[];
  puedeEditar: boolean;
}) {
  const [etiquetas, setEtiquetas] = useState(() => ordenar(etiquetasIniciales));
  const [agregando, setAgregando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [sedesNuevas, setSedesNuevas] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [aprobandoId, setAprobandoId] = useState<string | null>(null);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);
  const [rechazandoAbierto, setRechazandoAbierto] = useState<string | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [rechazandoId, setRechazandoId] = useState<string | null>(null);
  const [editandoSedesId, setEditandoSedesId] = useState<string | null>(null);
  const [sedesEditando, setSedesEditando] = useState<string[]>([]);
  const [guardandoSedes, setGuardandoSedes] = useState(false);

  const nombreSede = (id: string) => sedes.find((s) => s.id === id)?.nombre ?? id;

  const activas = etiquetas.filter((e) => e.activo);
  const desactivadas = etiquetas.filter((e) => !e.activo);

  async function guardar() {
    setGuardando(true);
    try {
      const res = await fetch("/api/productos/etiquetas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, sedesPermitidas: sedesNuevas.length > 0 ? sedesNuevas : null }),
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
            sedesPermitidas: datos.etiqueta.sedes_permitidas,
            notas: datos.etiqueta.notas,
            estado: datos.etiqueta.estado,
          },
        ])
      );
      avisar.exito(
        datos.etiqueta.estado === "pendiente" ? `${datos.etiqueta.nombre} agregada — ya la puedes usar` : `Etiqueta ${datos.etiqueta.nombre} agregada`,
        datos.etiqueta.estado === "pendiente" ? { detalle: "Queda pendiente de que un Líder la apruebe, pero eso no te frena." } : undefined
      );
      setAgregando(false);
      setNombre("");
      setSedesNuevas([]);
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

  async function guardarSedes(e: Etiqueta) {
    setGuardandoSedes(true);
    try {
      const res = await fetch("/api/productos/etiquetas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: e.id, sedesPermitidas: sedesEditando.length > 0 ? sedesEditando : null }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo guardar la restricción de sede.");
        return;
      }
      setEtiquetas((actual) => ordenar(actual.map((x) => (x.id === e.id ? { ...x, sedesPermitidas: datos.etiqueta.sedes_permitidas } : x))));
      avisar.exito(`Sedes de ${e.nombre} actualizadas`);
      setEditandoSedesId(null);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setGuardandoSedes(false);
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
          <div>
            <p className="label-cayla text-[11px] text-tinta/65">Restringir a sedes (opcional)</p>
            <p className="mt-1 text-xs text-tinta/55">Sin elegir ninguna = visible y vendible en cualquier sede.</p>
            <div className="mt-1.5">
              <SelectorSedes sedes={sedes} seleccionadas={sedesNuevas} onCambio={setSedesNuevas} />
            </div>
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {activas.map((e) => (
          <div key={e.id} className="card-cayla flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-tinta">{e.nombre}</p>
              {e.estado === "pendiente" && (
                <span className="label-cayla shrink-0 rounded-full bg-rojo/10 px-2 py-0.5 text-[10px] text-rojo">Pendiente</span>
              )}
            </div>
            <p className="text-[11px] text-tinta/65">
              {e.sedesPermitidas && e.sedesPermitidas.length > 0
                ? `Solo ${e.sedesPermitidas.map(nombreSede).join(", ")}`
                : "Todas las sedes"}
            </p>
            {puedeEditar && (
              <div className="flex gap-2">
                {e.estado === "pendiente" && (
                  <Boton peso="primario" className="flex-1 px-2.5 py-1.5 text-[11px]" cargando={aprobandoId === e.id} onClick={() => aprobar(e)}>
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
                  <>
                    <Boton
                      peso="discreto"
                      className="flex-1 px-2.5 py-1.5 text-[11px]"
                      onClick={() => {
                        setEditandoSedesId(editandoSedesId === e.id ? null : e.id);
                        setSedesEditando(e.sedesPermitidas ?? []);
                      }}
                    >
                      Sedes
                    </Boton>
                    <Boton peso="discreto" className="flex-1 px-2.5 py-1.5 text-[11px]" cargando={cambiandoId === e.id} onClick={() => desactivar(e)}>
                      Desactivar
                    </Boton>
                  </>
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
            {editandoSedesId === e.id && (
              <div className="space-y-2 border-t border-tinta/10 pt-2">
                <SelectorSedes sedes={sedes} seleccionadas={sedesEditando} onCambio={setSedesEditando} />
                <Boton peso="primario" className="w-full px-2.5 py-1.5 text-[11px]" cargando={guardandoSedes} onClick={() => guardarSedes(e)}>
                  Guardar sedes
                </Boton>
              </div>
            )}
          </div>
        ))}
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
