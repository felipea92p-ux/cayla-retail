"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check, SearchX, Users } from "lucide-react";
import type { DynamicDisponible } from "@/lib/colaboradores";
import { filtrarDisponibles } from "@/lib/colaboradores-reglas";
import { camposDeDarAcceso, fraseDarAcceso, rolesParaDarAcceso } from "@/lib/dar-acceso-reglas";
import { sePuedeConfirmar } from "@/lib/guia-campos";
import { MODULOS, type ClaveModulo } from "@/lib/modulos";
import type { RolVista } from "@/lib/roles-reglas";
import type { Ubicacion } from "@/lib/ubicaciones";
import type { ControlResponsable } from "@/lib/useResponsable";
import { Modal } from "@/components/ui/Modal";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { Buscador } from "@/components/ui/Buscador";
import { Chip } from "@/components/ui/Chip";
import { Vacio } from "@/components/ui/Vacio";
import { Boton } from "@/components/ui/campos";

// «Dar acceso» (ADR-0341, propuesta del 2026-10-05, pantalla 3): quién, dónde trabaja y qué hace, en una sola hoja con la guía
// de foco. Antes era «Agregar colaboradores»: elegía personas y ubicación, y todas entraban como Integrante y pendientes. Ahora el
// rol se elige aquí, y lo que da un líder entra directo (lo decide la base: `agregar_colaborador`). Nada viene elegido de
// antemano: quien confirma elige a la persona, la sede y el rol a propósito (auditoría de /colaboradores, tarea #1).

const nombreModulo = (c: ClaveModulo) => MODULOS.find((m) => m.clave === c)?.nombre ?? c;

export function DarAccesoModal({
  disponibles,
  ubicaciones,
  roles,
  soyLider,
  soyAdmin,
  misModulos,
  responsable,
  onConfirmar,
  onClose,
}: {
  disponibles: DynamicDisponible[];
  ubicaciones: Pick<Ubicacion, "id" | "nombre" | "activo">[];
  /** `null` = sin roles leídos: entra como Integrante y no se pregunta el rol. */
  roles: RolVista[] | null;
  soyLider: boolean;
  soyAdmin: boolean;
  misModulos: readonly ClaveModulo[] | null;
  responsable: ControlResponsable;
  onConfirmar: (personas: { id: string; nombre: string }[], ubicacionId: string, rolId: string | null) => Promise<boolean>;
  onClose: () => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [elegidas, setElegidas] = useState<ReadonlySet<string>>(new Set());
  const [sedeId, setSedeId] = useState<string | null>(null);
  const [rolId, setRolId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const visibles = useMemo(() => filtrarDisponibles(disponibles, busqueda), [disponibles, busqueda]);
  const opcionesRol = useMemo(() => (roles ? rolesParaDarAcceso(roles, soyAdmin, misModulos) : null), [roles, soyAdmin, misModulos]);
  const sedes = ubicaciones.filter((u) => u.activo);
  const personas = disponibles.filter((d) => elegidas.has(d.persona_id));
  const rol = opcionesRol?.find((r) => r.id === rolId) ?? null;
  const sede = sedes.find((u) => u.id === sedeId) ?? null;

  const campos = camposDeDarAcceso({
    personas: personas.length,
    sedeElegida: sede !== null,
    pideRol: opcionesRol !== null,
    rolElegido: rol !== null,
    responsableListo: responsable.listo,
    responsableMotivo: responsable.motivo,
  });
  const guia = useGuiaCampos(campos);
  const listo = sePuedeConfirmar(campos) && !enviando;
  const frase = fraseDarAcceso({
    nombres: personas.map((p) => p.nombre),
    sede: sede?.nombre ?? null,
    rol: rol?.nombre ?? (opcionesRol === null ? "Integrante" : null),
    entraDirecto: soyLider,
  });

  function alternar(id: string) {
    setElegidas((antes) => {
      const ahora = new Set(antes);
      if (ahora.has(id)) ahora.delete(id);
      else ahora.add(id);
      return ahora;
    });
  }

  return (
    <Modal
      titulo="Dar acceso"
      subtitulo={soyLider ? "Entra directo" : "Espera el ok de un líder"}
      tamano="mediana"
      variante="hoja"
      onClose={onClose}
    >
      {(cerrar) => (
        <form
          className="mt-5 space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!listo || !sede) return;
            setEnviando(true);
            const ok = await onConfirmar(personas.map((p) => ({ id: p.persona_id, nombre: p.nombre })), sede.id, rol?.id ?? null);
            setEnviando(false);
            if (ok) cerrar();
          }}
        >
          <CampoGuiado id="quien" guia={guia} titulo="Quién" ayuda={personas.length > 0 ? `${personas.length} ${personas.length === 1 ? "elegida" : "elegidas"}` : undefined} retiene="fila">
            <Buscador valor={busqueda} onCambio={setBusqueda} placeholder="Buscar por nombre o correo" />
            <ul className="scroll-cayla mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1" aria-label="Personas disponibles" data-guia="colaboradores.dar-personas">
              {visibles.length === 0 ? (
                <li className="py-3">
                  {disponibles.length === 0 ? (
                    <Vacio tamano="chico" icono={<Users />}>
                      Todas las personas activas en Dynamic ya tienen acceso.
                    </Vacio>
                  ) : (
                    <Vacio tamano="chico" icono={<SearchX />} accion={{ texto: "Borrar la búsqueda", onClick: () => setBusqueda("") }}>
                      Nadie coincide con lo que escribiste.
                    </Vacio>
                  )}
                </li>

              ) : (
                visibles.map((d) => {
                  const marcada = elegidas.has(d.persona_id);
                  return (
                    <li key={d.persona_id}>
                      <button
                        type="button"
                        aria-pressed={marcada}
                        onClick={() => alternar(d.persona_id)}
                        className={`grid w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors duration-200 ease-cayla ${
                          marcada ? "border-tinta bg-hueso" : "border-sand hover:border-taupe"
                        }`}
                      >
                        <AvatarPersona personaId={d.persona_id} nombre={d.nombre} />
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-semibold text-tinta">{d.nombre}</span>
                          <span className="block truncate text-xs text-tinta/60">{[d.sede, d.correo].filter(Boolean).join(" · ")}</span>
                        </span>
                        <span className={`grid h-6 w-6 place-items-center rounded-full ${marcada ? "bg-tinta text-crema" : "border-2 border-sand text-transparent"}`}>
                          <Check /* unificar-fijo: la marca sobre un punto lleno lleva trazo 3, como la casilla (ronda 15) */ aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </CampoGuiado>

          <CampoGuiado id="sede" guia={guia} titulo="Sede">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sede" data-guia="colaboradores.dar-sede">
              {sedes.map((u) => (
                <button key={u.id} type="button" className="pildora-cayla" aria-pressed={u.id === sedeId} onClick={() => setSedeId(u.id)}>
                  {u.nombre}
                </button>
              ))}
            </div>
          </CampoGuiado>

          {opcionesRol && (
            <CampoGuiado id="rol" guia={guia} titulo="Rol">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Rol" data-guia="colaboradores.dar-rol">
                {opcionesRol.map((r) => (
                  <button key={r.id} type="button" className="pildora-cayla" aria-pressed={r.id === rolId} onClick={() => setRolId(r.id)}>
                    {r.nombre}
                  </button>
                ))}
              </div>
              {rol && (
                // Lo que ve con el rol elegido: unos pocos módulos y cuántos más, para no abrir una lista larga.
                <p className="mt-2 flex flex-wrap items-center gap-1.5" aria-label={`Módulos de ${rol.nombre}`}>
                  {rol.modulos
                    .filter((m) => m !== "inicio")
                    .slice(0, 6)
                    .map((m) => (
                      <Chip key={m} versalitas={false}>
                        {nombreModulo(m)}
                      </Chip>
                    ))}
                  {rol.modulos.filter((m) => m !== "inicio").length > 6 && <Chip tono="apagado" tachado={false} versalitas={false}>+{rol.modulos.filter((m) => m !== "inicio").length - 6}</Chip>}
                  {rol.modulos.filter((m) => m !== "inicio").length === 0 && <span className="text-xs text-tinta/60">Solo Inicio</span>}
                </p>
              )}
            </CampoGuiado>
          )}

          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} enLinea deshabilitado={enviando} />
          </CampoGuiado>

          {/* La frase completa va para quien usa lector de pantalla; a la vista, el resumen en chips cuando ya está todo. */}
          {frase && <p role="status" className="sr-only">{frase}</p>}
          {personas.length > 0 && sede && (
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-tinta" aria-hidden>
              <strong className="font-semibold">{personas.map((p) => p.nombre.split(" ")[0]).join(", ")}</strong>
              <ArrowRight className="h-4 w-4 text-taupe" />
              <Chip versalitas={false}>{sede.nombre}</Chip>
              {rol && <Chip versalitas={false}>{rol.nombre}</Chip>}
            </p>
          )}

          <div className="pie-hoja-fijo">
            <div className="space-y-2 border-t border-sand pt-3" data-guia="colaboradores.dar-confirmar">
              <PieGuia guia={guia} listo={soyLider ? "Todo listo para dar acceso." : "Todo listo para pedir el acceso."} />
              <div className="pie-acciones">
                <button type="button" className="btn-cayla btn-secundario" onClick={cerrar}>
                  Cancelar
                </button>
                <Boton peso="primario" cargando={enviando} type="submit" disabled={!listo} title={responsable.motivo ?? undefined}>
                  {soyLider ? (personas.length > 1 ? `Dar acceso a ${personas.length}` : "Dar acceso") : "Pedir acceso"}
                </Boton>
              </div>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
