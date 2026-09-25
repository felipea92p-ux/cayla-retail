"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import type { ProveedorOpcion } from "@/lib/marcas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

// El formulario de "Nueva marca con su proveedor" (ADR-0109): lo usan el
// selector de Nuevo producto/censo/edición Y la pantalla Catálogo → Marcas —
// una sola forma de crear una marca, no dos.
//
// Dos escrituras, y se dicen así porque la segunda puede fallar sola:
//   1. registrar el proveedor (solo si es nuevo), con lo mínimo: nombre y RUC
//      opcional. Contacto, banco y plazo se completan después en Compras;
//   2. `crear_marca`: la marca con su proveedor, o —si la marca ya existe—
//      solo se le suma el proveedor (la misma marca por otro distribuidor).
// Si la 2 falla tras registrar el proveedor, el proveedor YA existe: el formulario
// pasa solo a «un proveedor que ya tengo» con ese elegido, así reintentar NO lo
// registra otra vez (registrar_proveedor no es idempotente: crearía un duplicado).
//
// Responsable (ADR-0161): crear una marca es Catálogo (operación de tienda), así
// que el formulario lleva su propio combo — es un guardado aparte del producto
// que se está dando de alta. `registrar_proveedor` es de Compras, que firma con la
// sesión; aquí se firma igual porque es parte del MISMO gesto de Catálogo, y el
// encabezado solo lo lee la función que lo pide (a las demás no les cambia nada).
// Si la 2 falla, el combo NO se vacía: el reintento es el mismo gesto.
//
// «¿Quién la trae?» es un buscador (ComboBuscable, 6 a la vista) y NO la lista entera de proveedores como botones: con
// ~60 proveedores el muro de chips ocupaba media pantalla (captura de Felipe, 2026-09-24). Registrar uno nuevo es la
// última opción de esa misma lista, con lo tipeado ya puesto como nombre.

export type MarcaGuardada = {
  marcaId: string;
  marcaNombre: string;
  proveedorId: string;
  proveedorNombre: string;
  /** El proveedor se creó ahora (no estaba en la lista). */
  proveedorNuevo: boolean;
};

export function NuevaMarcaForm({
  proveedores,
  nombreInicial = "",
  marcaFija = false,
  /** Proveedor ya elegido que todavía no trae ninguna marca: la marca nueva se le cuelga a ese, sin volver a preguntar quién la trae. */
  proveedorFijo,
  /** Cómo se llama la marca que ya existe con ese nombre (si la hay), para no mostrar la que escribió la persona sino la real. */
  nombreExistente,
  onGuardado,
  onCancelar,
}: {
  proveedores: ProveedorOpcion[];
  nombreInicial?: string;
  /** Marca ya existente a la que solo se le suma un proveedor: el nombre no se toca. */
  marcaFija?: boolean;
  proveedorFijo?: ProveedorOpcion;
  nombreExistente?: (nombre: string) => string | undefined;
  onGuardado: (r: MarcaGuardada) => void;
  onCancelar: () => void;
}) {
  const [nombreMarca, setNombreMarca] = useState(nombreInicial);
  const [modo, setModo] = useState<"existente" | "nuevo">(proveedorFijo || proveedores.length > 0 ? "existente" : "nuevo");
  const [proveedorId, setProveedorId] = useState(proveedorFijo?.id ?? "");
  // El proveedor que ESTE formulario acaba de registrar: existe aunque la marca haya fallado, y tiene que estar en la lista para reintentar.
  const [creado, setCreado] = useState<ProveedorOpcion | null>(null);
  const lista = creado && !proveedores.some((p) => p.id === creado.id) ? [...proveedores, creado] : proveedores;
  const [provNombre, setProvNombre] = useState("");
  const [provRuc, setProvRuc] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const responsable = useResponsable();

  async function guardar() {
    if (guardando) return;
    if (!responsable.listo) return setError(responsable.motivo);
    const nombre = nombreMarca.trim();
    if (!nombre) return setError("Escribe el nombre de la marca.");
    if (modo === "existente" && !proveedorId) return setError("Elige el proveedor que la trae.");
    if (modo === "nuevo" && !provNombre.trim()) return setError("Escribe el nombre del proveedor.");

    setGuardando(true);
    setError(null);
    const supabase = createClient();

    let provId = proveedorId;
    const eraNuevo = modo === "nuevo";
    if (eraNuevo) {
      const { data, error: errProv } = await firmar(
        supabase.rpc("registrar_proveedor", {
          p_nombre: provNombre.trim(),
          p_ruc: provRuc.trim() || undefined,
        }),
        responsable.firma(),
      );
      if (errProv || !data) {
        setGuardando(false);
        responsable.despues(errProv);
        return setError(traducirError(errProv, "registrar el proveedor"));
      }
      provId = data;
      setCreado({ id: data, nombre: provNombre.trim() });
      setModo("existente");
      setProveedorId(data);
    }

    const { data: marcaId, error: errMarca } = await firmar(
      supabase.rpc("crear_marca", { p_nombre: nombre, p_proveedor_id: provId }),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(errMarca);
    if (errMarca || !marcaId) {
      return setError(
        eraNuevo
          ? `El proveedor «${provNombre.trim()}» se registró, pero la marca no se pudo guardar: ${traducirError(errMarca, "agregar la marca")} Vuelve a tocar «Guardar y usar»: el proveedor ya no se registra otra vez.`
          : traducirError(errMarca, "agregar la marca")
      );
    }

    onGuardado({
      marcaId,
      marcaNombre: nombreExistente?.(nombre) ?? nombre,
      proveedorId: provId,
      proveedorNombre: eraNuevo ? provNombre.trim() : (lista.find((p) => p.id === provId)?.nombre ?? ""),
      // «Nuevo» también si se registró en un intento anterior de este mismo formulario: el padre todavía no lo tiene en su lista.
      proveedorNuevo: eraNuevo || creado?.id === provId,
    });
  }

  const enter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void guardar();
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-sand bg-crema p-4">
      <p className="label-cayla text-[11px] text-tinta/70">
        {marcaFija ? `Otro proveedor para ${nombreInicial}` : proveedorFijo ? `Nueva marca de ${proveedorFijo.nombre}` : "Nueva marca"}
      </p>
      <div className={`grid gap-3 ${!marcaFija && !proveedorFijo ? "sm:grid-cols-2" : ""}`}>
        {!marcaFija && (
          <div>
            <label htmlFor="nueva-marca" className="text-xs text-tinta/60">
              Nombre de la marca
            </label>
            <input
              id="nueva-marca"
              autoFocus
              value={nombreMarca}
              onChange={(e) => setNombreMarca(e.target.value)}
              onKeyDown={enter}
              className="caja-cayla mt-1 h-10 w-full px-3 text-sm text-tinta outline-none"
            />
          </div>
        )}

        {!proveedorFijo && (
          <div>
            <label htmlFor="proveedor-marca" className="text-xs text-tinta/60">
              ¿Quién la trae?
            </label>
            <div className="mt-1">
              {modo === "existente" ? (
                <ComboBuscable
                  id="proveedor-marca"
                  caja
                  etiquetaAccesible="Proveedor que trae la marca"
                  marcador={lista.length > 0 ? `Busca entre ${lista.length} proveedores…` : "Escribe el nombre del proveedor…"}
                  valor={proveedorId}
                  onValor={setProveedorId}
                  opciones={lista.map((p) => ({ valor: p.id, texto: p.nombre }))}
                  limite={6}
                  crear={{
                    etiqueta: (q) => (q ? `+ Registrar «${q}» como proveedor nuevo` : "+ Registrar un proveedor nuevo"),
                    onCrear: (q) => {
                      setProvNombre(q);
                      setProveedorId("");
                      setModo("nuevo");
                    },
                  }}
                />
              ) : (
                <div className="flex h-10 items-center justify-between gap-2 rounded-md bg-hueso px-3 text-sm text-tinta">
                  Proveedor nuevo
                  {lista.length > 0 && (
                    <button type="button" onClick={() => setModo("existente")} className="btn-cayla btn-enlace text-xs">
                      Elegir uno que ya tengo
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {!proveedorFijo && modo === "nuevo" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="nuevo-proveedor" className="text-xs text-tinta/60">
              Razón social o nombre
            </label>
            <input
              id="nuevo-proveedor"
              autoFocus
              value={provNombre}
              onChange={(e) => setProvNombre(e.target.value)}
              onKeyDown={enter}
              className="caja-cayla mt-1 h-10 w-full px-3 text-sm text-tinta outline-none"
            />
          </div>
          <div>
            <label htmlFor="nuevo-ruc" className="text-xs text-tinta/60">
              RUC (opcional)
            </label>
            <input
              id="nuevo-ruc"
              inputMode="numeric"
              maxLength={11}
              value={provRuc}
              onChange={(e) => setProvRuc(e.target.value.replace(/\D/g, ""))}
              onKeyDown={enter}
              className="caja-cayla mt-1 h-10 w-full px-3 text-sm tabular-nums text-tinta outline-none"
            />
          </div>
          <p className="text-xs text-tinta/55 sm:col-span-2">Con esto alcanza para seguir; el contacto, el banco y el plazo se completan después en Compras.</p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-rojo-profundo">
          {error}
        </p>
      )}
      <ComboResponsable control={responsable} deshabilitado={guardando} />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={guardando || !responsable.listo}
          title={responsable.motivo ?? undefined}
          className="label-cayla rounded-md bg-tinta px-4 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo disabled:opacity-40"
        >
          {guardando ? "Guardando…" : "Guardar y usar"}
        </button>
        <button type="button" onClick={onCancelar} disabled={guardando} className="label-cayla text-[11px] text-tinta/60 hover:text-tinta">
          Cancelar
        </button>
      </div>
    </div>
  );
}
