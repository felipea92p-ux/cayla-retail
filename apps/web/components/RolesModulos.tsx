"use client";

import { useState, type ComponentType } from "react";
import { ChartColumn, ChevronDown, EyeOff, Globe, House, Lock, Package, Scissors, ShoppingBag, ShoppingCart, Tag, Users, Wallet } from "lucide-react";
import { Casilla } from "@/components/ui/Casilla";
import { Vacio } from "@/components/ui/Vacio";
import { MODULOS, esDelegable, type ClaveModulo, type Modulo } from "@/lib/modulos";
import { alternarGrupo, alternarModulo, controlDe, fueraDeLoMio, MODULO_FIJO_DEL_LIDER, modulosPorGrupo, veModulo, type QuienEdita, type RolVista } from "@/lib/roles-reglas";

// Los módulos de un rol (maqueta «B · Vista previa», Felipe 2026-10-29): a la izquierda las áreas del menú, que se abren al
// tocarlas y dicen cuántos módulos tiene el rol en cada una; a la derecha, el menú tal como lo vería esa cuenta, con lo que
// el borrador suma o quita marcado. La lógica (qué se puede dar, candados, «Todos») es la de antes: solo cambia cómo se ve.

const AREA: Record<Modulo["grupo"], { icono: ComponentType<{ className?: string; "aria-hidden"?: boolean }>; bajada: string }> = {
  General: { icono: House, bajada: "Lo primero que ve al entrar" },
  Ventas: { icono: ShoppingBag, bajada: "Cobrar, cambiar y cerrar caja" },
  "Tienda web": { icono: Globe, bajada: "Los pedidos de la tienda online" },
  Clientes: { icono: Users, bajada: "Fichas y club de miembros" },
  Inventario: { icono: Package, bajada: "Qué hay y dónde está" },
  Catálogo: { icono: Tag, bajada: "Prendas, precios y campañas" },
  Compras: { icono: ShoppingCart, bajada: "Lo que se compra y se paga" },
  Producción: { icono: Scissors, bajada: "El trabajo del taller" },
  Gestión: { icono: ChartColumn, bajada: "Análisis y administración" },
  Finanzas: { icono: Wallet, bajada: "Gastos, cuentas e impuestos" },
};

export function RolesModulos({
  rol,
  borrador,
  suma,
  quita,
  editable,
  quien,
  misModulos,
  onCambiar,
}: {
  rol: RolVista;
  borrador: ClaveModulo[];
  suma: readonly ClaveModulo[];
  quita: readonly ClaveModulo[];
  editable: boolean;
  quien: QuienEdita;
  /** Los módulos de quien mira (`null` = líder: da todo). */
  misModulos: readonly ClaveModulo[] | null;
  onCambiar: (modulos: ClaveModulo[]) => void;
}) {
  const grupos = modulosPorGrupo();
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(() => new Set([grupos[1]?.grupo ?? grupos[0]?.grupo ?? ""]));
  const alternarArea = (g: string) =>
    setAbiertos((s) => {
      const n = new Set(s);
      if (!n.delete(g)) n.add(g);
      return n;
    });

  return (
    <div className="grid gap-4 px-5 pb-5 pt-4 @[860px]/mod:grid-cols-[minmax(0,1fr)_16.5rem] @[860px]/mod:items-start">
      <div className="space-y-2">
        <p className="pb-1 text-sm text-tinta/65">
          Ve <strong className="font-semibold text-tinta">{borrador.length}</strong> de {rol.fijo ? `${MODULOS.length} módulos` : `${MODULOS.filter(esDelegable).length} que se pueden dar`}.
          Abre un área para encender o apagar sus módulos.
        </p>
        {grupos.map(({ grupo, modulos }) => {
          const { icono: Icono, bajada } = AREA[grupo];
          const abierto = abiertos.has(grupo);
          const encendidos = modulos.filter((m) => borrador.includes(m.clave)).length;
          const estado = encendidos === modulos.length ? "todo" : encendidos > 0 ? "algo" : "nada";
          // ADR-0178: «Todos» solo mueve lo que quien mira puede dar; el Líder (ADR-0253) todo menos Roles y accesos.
          const delegables = rol.fijo ? modulos : modulos.filter(esDelegable);
          const mios = delegables.filter((m) => (rol.fijo ? m.clave !== MODULO_FIJO_DEL_LIDER : fueraDeLoMio([m.clave], misModulos).length === 0));
          const todoEncendido = mios.length > 0 && mios.every((m) => borrador.includes(m.clave));
          return (
            <section key={grupo} className={`overflow-hidden rounded-2xl border bg-papel transition-colors duration-200 ease-cayla ${abierto ? "border-borde-control" : "border-sand"}`}>
              <button
                type="button"
                aria-expanded={abierto}
                onClick={() => alternarArea(grupo)}
                className="flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors duration-150 ease-cayla hover:bg-hueso/50"
              >
                <span
                  aria-hidden
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors duration-200 ease-cayla ${
                    estado === "todo" ? "bg-verde text-papel" : estado === "algo" ? "bg-tinta text-papel" : "bg-hueso text-tinta"
                  }`}
                >
                  <Icono aria-hidden className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[20px] leading-tight text-tinta">{grupo}</span>
                  <span className="block truncate text-sm text-tinta/65">{bajada}</span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums ${
                    estado === "todo" ? "bg-verde text-papel" : estado === "algo" ? "bg-tinta text-papel" : "bg-hueso text-tinta/70"
                  }`}
                >
                  {encendidos} de {modulos.length}
                </span>
                <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 text-taupe transition-transform duration-200 ease-cayla motion-reduce:transition-none ${abierto ? "rotate-180" : ""}`} />
              </button>
              <div className={`grid transition-[grid-template-rows] duration-300 ease-cayla motion-reduce:transition-none ${abierto ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                <div className="min-h-0 overflow-hidden" inert={!abierto}>
                  <ul>
                    {modulos.map((m) => {
                      const on = veModulo({ modulos: borrador }, m.clave);
                      const control = controlDe(rol, m, quien, on);
                      const tocable = editable && control.tipo === "interruptor" && control.editable;
                      const marca = suma.includes(m.clave) ? "suma" : quita.includes(m.clave) ? "quita" : null;
                      return (
                        <li key={m.clave} className="border-t border-sand">
                          <label
                            title={`${m.incluye}${control.tipo === "candado" ? ` · ${control.texto}` : ""}`}
                            className={`flex items-center gap-3.5 py-2.5 pl-[4.5rem] pr-4 ${tocable ? "cursor-pointer hover:bg-hueso" : ""} ${marca === "suma" ? "bg-verde/10" : marca === "quita" ? "bg-rojo/5" : ""}`}
                          >
                            <Casilla
                              marcada={on}
                              disabled={!tocable}
                              etiqueta={`${m.nombre}: ${on ? "lo ve" : "no lo ve"}${control.tipo === "candado" ? ` (${control.texto})` : ""}`}
                              onCambio={() => onCambiar(alternarModulo(borrador, m.clave, rol.fijo))}
                              className="-ml-9 shrink-0"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-x-2 text-[14px] font-semibold text-tinta">
                                {m.nombre}
                                {control.tipo === "candado" && (
                                  <span className="inline-flex items-center gap-1 text-sm font-normal text-taupe-profundo">
                                    <Lock aria-hidden className="h-3 w-3" /> {control.texto}
                                  </span>
                                )}
                                {marca && (
                                  <span className={`text-sm font-semibold ${marca === "suma" ? "text-verde" : "text-rojo-profundo"}`}>
                                    {marca === "suma" ? "se suma al guardar" : "se quita al guardar"}
                                  </span>
                                )}
                              </span>
                              <span className="line-clamp-2 text-sm leading-snug text-tinta/65">{m.incluye}</span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  {editable && mios.length > 0 && (
                    <div className="flex justify-end border-t border-sand bg-crema px-4 py-2">
                      <button
                        type="button"
                        className="btn-cayla btn-enlace text-[12.5px]"
                        onClick={() =>
                          onCambiar(alternarGrupo(borrador, grupo, !todoEncendido, rol.fijo).filter((c) => borrador.includes(c) || fueraDeLoMio([c], misModulos).length === 0))
                        }
                      >
                        {todoEncendido ? `Quitar todo ${grupo}` : `Marcar todo ${grupo}`}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <MenuDelRol rolNombre={rol.nombre} borrador={borrador} suma={suma} quita={quita} />
    </div>
  );
}

/** El menú como lo vería esa cuenta: lo que ve, lo que se suma (resaltado) y lo que se quita (tachado) al guardar. */
function MenuDelRol({ rolNombre, borrador, suma, quita }: { rolNombre: string; borrador: ClaveModulo[]; suma: readonly ClaveModulo[]; quita: readonly ClaveModulo[] }) {
  const grupos = modulosPorGrupo()
    .map(({ grupo, modulos }) => ({ grupo, modulos: modulos.filter((m) => borrador.includes(m.clave) || quita.includes(m.clave)) }))
    .filter((g) => g.modulos.length > 0);
  return (
    <aside aria-label={`Así verá el menú ${rolNombre}`} data-guia="roles.vista-previa" className="@[860px]/mod:sticky @[860px]/mod:top-20">
      <div className="mb-2 flex items-baseline justify-between gap-2 px-1 text-sm text-tinta/65">
        <span>Así verá el menú</span>
        <strong className="truncate font-semibold text-tinta">{rolNombre}</strong>
      </div>
      <div className="overflow-hidden rounded-2xl border border-sand bg-papel shadow-[0_0_0_6px_var(--color-hueso)]">
        <div className="flex items-center justify-between border-b border-sand px-4 py-3">
          <span className="font-display text-[17px] font-semibold tracking-[0.2em] text-tinta">CAYLA</span>
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-tinta/60">Su menú</span>
        </div>
        <div className="max-h-[32rem] overflow-y-auto px-2 pb-3 pt-1">
          {grupos.length === 0 ? (
            <div className="px-2 py-6">
              <Vacio tamano="chico" icono={<EyeOff />}>Sin módulos: esta cuenta no vería nada.</Vacio>
            </div>
          ) : (
            grupos.map(({ grupo, modulos }) => (
              <div key={grupo}>
                <div className="px-2.5 pb-1 pt-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-taupe-profundo">{grupo}</div>
                {modulos.map((m) => {
                  const sale = quita.includes(m.clave);
                  const entra = suma.includes(m.clave);
                  return (
                    <div
                      key={m.clave}
                      className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[15px] ${entra ? "anim-revelar bg-verde/15 font-semibold text-tinta" : sale ? "text-tinta/60 line-through" : "text-tinta"}`}
                    >
                      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${entra ? "bg-verde" : sale ? "bg-rojo" : "bg-borde-control"}`} />
                      <span className="min-w-0 flex-1 truncate">{m.nombre}</span>
                      {(entra || sale) && <span className="sr-only">{entra ? "se suma al guardar" : "se quita al guardar"}</span>}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
