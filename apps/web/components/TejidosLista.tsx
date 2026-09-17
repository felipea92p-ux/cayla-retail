"use client";

import { useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";

/**
 * Vocabulario cerrado de tejidos (ADR-0095/0096) — mismo mecanismo que
 * Colores: cualquiera con sesión propone, cualquiera de los Líderes aprueba
 * o rechaza. A diferencia de Colores, tejido no tiene código de 3 letras
 * (no se inyecta en el código de barras — es atributo del PRODUCTO, no de
 * la variante), ni hex/tipo/muestra: solo un nombre y el candado de clave
 * única normalizada que ya hace `fn_clave_texto` en la base.
 */

type Tejido = {
  id: string;
  nombre: string;
  activo: boolean;
  notas: string | null;
  estado: "pendiente" | "aprobado" | "rechazado";
};

function ordenar(lista: Tejido[]) {
  return [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export function TejidosLista({ tejidosIniciales, puedeEditar }: { tejidosIniciales: Tejido[]; puedeEditar: boolean }) {
  const [tejidos, setTejidos] = useState(() => ordenar(tejidosIniciales));
  const [agregando, setAgregando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aprobandoId, setAprobandoId] = useState<string | null>(null);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);
  const [rechazandoAbierto, setRechazandoAbierto] = useState<string | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [rechazandoId, setRechazandoId] = useState<string | null>(null);

  const activos = tejidos.filter((t) => t.activo);
  const desactivados = tejidos.filter((t) => !t.activo);

  async function guardar() {
    setGuardando(true);
    try {
      const res = await fetch("/api/productos/tejidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo agregar el tejido.");
        return;
      }
      setTejidos((actual) =>
        ordenar([...actual, { id: datos.tejido.id, nombre: datos.tejido.nombre, activo: true, notas: datos.tejido.notas, estado: datos.tejido.estado }])
      );
      avisar.exito(
        datos.tejido.estado === "pendiente" ? `${datos.tejido.nombre} agregado — ya lo puedes usar` : `Tejido ${datos.tejido.nombre} agregado`,
        datos.tejido.estado === "pendiente" ? { detalle: "Queda pendiente de que un Líder lo apruebe, pero eso no te frena." } : undefined
      );
      setAgregando(false);
      setNombre("");
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setGuardando(false);
    }
  }

  async function aprobar(t: Tejido) {
    setAprobandoId(t.id);
    try {
      const res = await fetch("/api/productos/tejidos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id, estado: "aprobado" }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo aprobar el tejido.");
        return;
      }
      setTejidos((actual) => ordenar(actual.map((x) => (x.id === t.id ? { ...x, estado: "aprobado" as const, activo: true } : x))));
      avisar.exito(`${t.nombre} aprobado`);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setAprobandoId(null);
    }
  }

  async function rechazar(t: Tejido) {
    setRechazandoId(t.id);
    try {
      const res = await fetch("/api/productos/tejidos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id, estado: "rechazado", ...(motivoRechazo.trim() ? { notas: motivoRechazo.trim() } : {}) }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo rechazar el tejido.");
        return;
      }
      setTejidos((actual) => ordenar(actual.map((x) => (x.id === t.id ? { ...x, activo: false, estado: "rechazado" as const } : x))));
      avisar.exito(`${t.nombre} rechazado`, { detalle: "Cae a Desactivados. Se puede reactivar después si hace falta." });
      setRechazandoAbierto(null);
      setMotivoRechazo("");
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setRechazandoId(null);
    }
  }

  async function reactivar(t: Tejido) {
    setCambiandoId(t.id);
    try {
      const res = await fetch("/api/productos/tejidos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(t.estado === "rechazado" ? { id: t.id, estado: "aprobado" } : { id: t.id, activo: true }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo reactivar el tejido.");
        return;
      }
      setTejidos((actual) => ordenar(actual.map((x) => (x.id === t.id ? { ...x, activo: true, estado: "aprobado" as const } : x))));
      avisar.exito(`${t.nombre} reactivado`, { detalle: "Vuelve a aparecer al elegir tejido en un producto." });
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCambiandoId(null);
    }
  }

  async function desactivar(t: Tejido) {
    setCambiandoId(t.id);
    try {
      const res = await fetch("/api/productos/tejidos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id, activo: false }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo desactivar el tejido.");
        return;
      }
      setTejidos((actual) => ordenar(actual.map((x) => (x.id === t.id ? { ...x, activo: false } : x))));
      avisar.exito(`${t.nombre} desactivado`, { detalle: "Deja de aparecer al elegir tejido en un producto nuevo; el historial se conserva." });
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCambiandoId(null);
    }
  }

  return (
    <div className="space-y-6">
      {agregando ? (
        <div className="card-cayla flex items-end gap-2 p-4">
          <CampoTexto
            etiqueta="Nombre del tejido"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Algodón"
            className="flex-1"
            autoFocus
          />
          <Boton peso="primario" className="px-4 py-2.5" onClick={guardar} cargando={guardando} disabled={!nombre.trim()}>
            Guardar
          </Boton>
          <Boton peso="fantasma" className="px-4 py-2.5" onClick={() => setAgregando(false)} disabled={guardando}>
            Cancelar
          </Boton>
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setAgregando(true)}
            className="label-cayla rounded-md bg-tinta px-4 py-3 text-[11px] text-crema transition-colors hover:bg-rojo"
          >
            + Agregar tejido
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {activos.map((t) => (
          <div key={t.id} className="card-cayla flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-tinta">{t.nombre}</p>
              {t.estado === "pendiente" && (
                <span className="label-cayla shrink-0 rounded-full bg-rojo/10 px-2 py-0.5 text-[10px] text-rojo">Pendiente</span>
              )}
            </div>
            {puedeEditar && (
              <div className="flex gap-2">
                {t.estado === "pendiente" && (
                  <Boton peso="primario" className="flex-1 px-2.5 py-1.5 text-[11px]" cargando={aprobandoId === t.id} onClick={() => aprobar(t)}>
                    Aprobar
                  </Boton>
                )}
                {t.estado === "pendiente" ? (
                  <Boton
                    peso="discreto"
                    className="flex-1 px-2.5 py-1.5 text-[11px] text-rojo"
                    onClick={() => {
                      setRechazandoAbierto(rechazandoAbierto === t.id ? null : t.id);
                      setMotivoRechazo("");
                    }}
                  >
                    Rechazar
                  </Boton>
                ) : (
                  <Boton peso="discreto" className="flex-1 px-2.5 py-1.5 text-[11px]" cargando={cambiandoId === t.id} onClick={() => desactivar(t)}>
                    Desactivar
                  </Boton>
                )}
              </div>
            )}
            {rechazandoAbierto === t.id && (
              <div className="space-y-1.5 border-t border-tinta/10 pt-2">
                <input
                  autoFocus
                  value={motivoRechazo}
                  onChange={(e) => setMotivoRechazo(e.target.value)}
                  placeholder="Motivo (opcional)"
                  className="w-full border-b border-tinta/25 bg-transparent px-0.5 py-1 text-[11px] text-tinta outline-none placeholder:text-tinta/40 focus:border-b-2 focus:border-rojo"
                />
                <div className="flex gap-2">
                  <Boton peso="primario" className="flex-1 px-2.5 py-1.5 text-[11px]" cargando={rechazandoId === t.id} onClick={() => rechazar(t)}>
                    Confirmar rechazo
                  </Boton>
                  <Boton peso="fantasma" className="px-2.5 py-1.5 text-[11px]" onClick={() => setRechazandoAbierto(null)}>
                    Cancelar
                  </Boton>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {desactivados.length > 0 && (
        <section className="space-y-2">
          <p className="label-cayla text-[11px] text-tinta/65">Desactivados — ya no se pueden elegir en un producto nuevo</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {desactivados.map((t) => (
              <div key={t.id} className="card-cayla flex flex-col gap-2 p-4 opacity-60">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-tinta">{t.nombre}</p>
                  {t.estado === "rechazado" && (
                    <span className="label-cayla shrink-0 rounded-full bg-rojo/10 px-2 py-0.5 text-[10px] text-rojo">Rechazado</span>
                  )}
                </div>
                {puedeEditar && (
                  <Boton peso="discreto" className="px-2.5 py-1.5 text-[11px]" cargando={cambiandoId === t.id} onClick={() => reactivar(t)}>
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
