"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowDown, ChevronRight, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Proveedor, ResumenProveedores } from "@/lib/proveedores";
import { ProveedorModal, BORRADOR_VACIO, type Borrador } from "@/components/ProveedorModal";
import { ProveedorVistaRapida } from "@/components/ProveedorVistaRapida";
import { ProveedoresIndicadores } from "@/components/ProveedoresIndicadores";
import { soles } from "@/lib/compras-reglas";
import { clave } from "@/lib/buscar-prenda-v2";
import { chipEntregas, haceCuanto, marcasParaMostrar, ordenarProveedores, repartoDeuda, rubrosConConteo, siguienteOrden, sinDatosDePago, textoBuscableProveedor, tieneRubro, type CampoOrden, type MarcasDeProveedor, type Orden } from "@/lib/proveedores-reglas";
import { useFlip } from "@/lib/useFlip";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { Resaltado } from "@/components/ui/Resaltado";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { Sparkline } from "@/components/ui/Sparkline";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";

// La tabla de líder gana columnas según el ANCHO DE LA TABLA, no el de la ventana (container queries de
// Tailwind: `@3xl`, `@5xl`, `@7xl` miden el contenedor `@container` de <Tabla>). Con el menú lateral abierto
// y el margen de la página, la tabla es ~350 px más angosta que la ventana: una tabla que decide por la
// ventana cree que le sobra sitio y aplasta el nombre hasta dejarlo en «C…». El NOMBRE es la única columna
// flexible y nunca se sacrifica; lo que se baja primero es lo que se puede leer en otro lado
// (RUC y «Última compra» están en la vista rápida y en la ficha; «A favor» y «Entregas» en la ficha).
//   · < 48 rem   : proveedor · saldo (y toda la fila abre la vista rápida)
//   · ≥ 48 rem   : proveedor · facturado 12 m · saldo · acción
//   · ≥ 64 rem   : + a favor · entregas
//   · ≥ 80 rem   : + RUC · última compra  (la maqueta 08 completa)
// Dos plantillas de fila (líder / colaborador), no una con columnas ocultas: lo financiero es solo de
// líder — corrección de D-27, 2026-09-17 (ver 20260917240000_proveedores_lista_indicadores_y_candado_sede.sql).
// Un colaborador ve el directorio puro (Proveedor · RUC); ni la base le manda esos números
// (fn_proveedores() los devuelve NULL), así que ocultar la columna acá es la segunda capa, no la única.
const COLUMNAS_LIDER =
  "grid-cols-[minmax(0,1fr)_auto] @3xl:grid-cols-[minmax(0,1fr)_9.75rem_7.5rem_9rem] @5xl:grid-cols-[minmax(0,1fr)_9.75rem_7.5rem_6.5rem_8rem_9.25rem] @7xl:grid-cols-[minmax(0,1fr)_6.75rem_9.75rem_7.5rem_6.5rem_8rem_6.5rem_9.25rem]";
const PLANTILLA_BASE = "sm:grid-cols-[1fr_8rem]";

// Directorio de proveedores: a quién se le compra. Es la puerta de entrada del módulo — sin un
// proveedor registrado no se puede registrar su comprobante (`compras.proveedor_id` es FK dura), y
// hasta hoy el único camino era el SQL Editor. Alta y edición pasan por RPC (registrar_proveedor /
// actualizar_proveedor); desactivar nunca borra — los comprobantes históricos siguen diciendo de
// quién fueron.
//
// ADR-0111 (maqueta 08): la lista ahora ayuda a decidir. Arriba, cuatro cifras (a quién se le debe,
// cuánta deuda concentra uno solo, quiénes llevan meses sin comprar). En la tabla, «Facturado · 12 m»
// (lo reciente pesa más que «desde siempre»), «Saldo» en rojo si ya venció algo, «Entregas» (lo que
// hay que reclamar), columnas ordenables (por defecto por saldo) y «+ Comprobante» en la fila.
// Un filtro por rubro con conteo — el rubro ya se guardaba y se veía por fila, faltaba poder filtrar. Desde
// ADR-0211 un proveedor tiene varios: aparece bajo cada uno, y el conteo de cada botón es de proveedores (por eso
// la suma de los botones puede pasar de «Todos»).
//
// ADR-0128 (spike visual 2026-09-19): la lista RESPONDE. Tocar una fila abre una vista rápida (cajón)
// sin perder el orden ni el filtro; ordenar y filtrar deslizan las filas a su lugar (FLIP); el filtro
// de rubro tiene un pulgar que viaja; la búsqueda marca dónde coincidió; la barra de concentración
// enciende la fila del proveedor al que apuntas; y lo recién creado, reactivado o desactivado se marca
// con un destello. Desactivar se puede deshacer (7 s). Al llegar, las piezas entran escalonadas (cifras,
// buscador, tabla, filas: `anim-entra` con `--i`) y las cifras y trazos se arman una vez — regla de
// movimiento revisada el 2026-09-19 (globals.css, ADR-0128). Lo demás responde a una acción.
//
// ADR-0134: un chip ámbar «Sin datos de pago» marca al proveedor activo al que todavía no se le puede pagar por
// transferencia ni Yape/Plin (sin cuenta, sin CCI y sin celular de billetera; quien cobra en efectivo NO se marca:
// no le falta nada), y un filtro con su conteo — solo si hay alguno — para ir a completarlos de una vez. Se resuelve en
// el cliente como el rubro: el directorio entero ya está en la página. Los desactivados no se marcan: ya no se les paga.
//
// ADR-0140: el nombre es la razón social («Textil Ejemplo SAC») pero el equipo conoce al proveedor por su marca («Kero»).
// La búsqueda también mira las marcas y cada fila las muestra como etiquetas (las que coinciden con lo escrito van
// primero y resaltadas). Las marcas llegan aparte de `fn_proveedores()` (tablas `marcas` y `marca_proveedores`) y son
// opcionales: si su lectura falla llega `null` y la lista se pinta como antes.
//
// Dos llaves (ADR-0161 P3, 20260923140000 — antes era un solo `esLider`):
//  · `verMontos` (`verDineroCompras`): lo financiero — las cifras de arriba, las columnas de dinero, la vista rápida.
//  · `puedeEditar` (el módulo Proveedores, `editarCuentasProveedor` = `fn_puede_gestionar_proveedores`): registrar, abrir la
//    ficha (datos, cuentas, devoluciones, editar y desactivar) y el aviso «Sin datos de pago».
// Quien tiene Proveedores sin los montos ve el directorio y entra a la ficha, sin una sola cifra de dinero.
export function ProveedoresPanel({
  proveedores,
  verMontos,
  puedeEditar,
  resumen,
  series,
  marcas,
}: {
  proveedores: Proveedor[];
  verMontos: boolean;
  puedeEditar: boolean;
  /** Las cifras de arriba; `null` para quien no ve los montos de Compras. */
  resumen: ResumenProveedores | null;
  /** Facturado por mes por proveedor (12 montos); `null` si no hay serie disponible → sin tendencias. */
  series: Record<string, number[]> | null;
  /** Marcas de cada proveedor (ADR-0140); `null` si no se pudieron leer → sin marcas ni búsqueda por marca. */
  marcas: MarcasDeProveedor | null;
}) {
  const router = useRouter();
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [rubro, setRubro] = useState<string | null>(null); // clave normalizada; null = todos
  const [soloSinPago, setSoloSinPago] = useState(false);
  const [orden, setOrden] = useState<Orden>({ campo: "saldo", dir: "desc" });
  const [abiertoId, setAbiertoId] = useState<string | null>(null); // el proveedor de la vista rápida
  const [foco, setFoco] = useState<string | null>(null); // el tramo de la barra de concentración al que se apunta
  const [recientes, setRecientes] = useState<ReadonlySet<string>>(new Set());
  const pendienteScroll = useRef<string | null>(null);
  const buscador = useRef<HTMLInputElement>(null);

  // Búsqueda en memoria: el directorio entero ya está en la página (son decenas de proveedores, no
  // miles), así que filtrar acá es instantáneo y no cuesta una consulta por tecla. Busca por nombre, marca,
  // RUC y contacto, sin tildes ni mayúsculas (misma `clave` que el buscador de Vender).
  const k = clave(busqueda);
  const rubros = useMemo(() => rubrosConConteo(proveedores.filter((p) => p.activo)), [proveedores]);
  // Solo quien edita proveedores: el filtro (y su conteo) no le sirve a quien no puede completar los datos.
  const faltaPago = (p: Proveedor) => puedeEditar && p.activo && sinDatosDePago(p);
  const nSinPago = proveedores.filter(faltaPago).length;
  // Si al completar los datos ya no queda ninguno, el filtro deja de aplicar (y su botón desaparece): no se queda una lista vacía.
  const filtrarSinPago = soloSinPago && nSinPago > 0;
  const marcasDe = (id: string): readonly string[] => marcas?.[id] ?? [];
  // Solo se promete «marca» si hay marcas que buscar: sin lectura (`null`) o sin ningún vínculo, sería una promesa vacía.
  const hayMarcas = !!marcas && Object.keys(marcas).length > 0;
  const coincide = (p: Proveedor) =>
    (!k || clave(textoBuscableProveedor(p, marcasDe(p.id))).includes(k)) && (!rubro || tieneRubro(p, rubro)) && (!filtrarSinPago || faltaPago(p));
  const activos = ordenarProveedores(
    proveedores.filter((p) => p.activo && coincide(p)),
    orden,
  );
  const desactivados = proveedores.filter((p) => !p.activo && coincide(p));
  const totalActivos = proveedores.filter((p) => p.activo).length;
  const hayProveedores = totalActivos > 0;
  const filtrando = !!k || !!rubro || filtrarSinPago;
  const reparto = useMemo(() => repartoDeuda(proveedores.filter((p) => p.activo).map((p) => ({ id: p.id, nombre: p.nombre, saldo: p.saldo }))), [proveedores]);
  const maxSaldo = Math.max(1, ...proveedores.filter((p) => p.activo).map((p) => p.saldo ?? 0));
  const refFila = useFlip(activos.map((p) => p.id).join("|"));

  // Lo que se recorre con ↑ ↓ en la vista rápida: las filas que se ven, activos primero.
  const navegables = [...activos, ...desactivados];
  const abierto = abiertoId ? (proveedores.find((p) => p.id === abiertoId) ?? null) : null;
  const indiceAbierto = abierto ? navegables.findIndex((p) => p.id === abierto.id) : -1;

  const marcarReciente = useCallback((id: string) => {
    setRecientes((r) => new Set(r).add(id));
    // 4 s > los 2,6 s del destello: el reloj arranca al guardar, pero la fila nueva recién se pinta
    // cuando termina `router.refresh()`; con 2,7 s el destello se cortaba a la mitad.
    setTimeout(() => setRecientes((r) => new Set([...r].filter((x) => x !== id))), 4000);
  }, []);

  // Un proveedor recién registrado puede caer fuera de pantalla (por saldo queda al final): se lleva a la vista.
  useEffect(() => {
    const id = pendienteScroll.current;
    if (!id) return;
    const el = document.querySelector(`[data-proveedor-id="${id}"]`);
    if (!el) return;
    pendienteScroll.current = null;
    el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [proveedores]);

  // «/» lleva el cursor al buscador, salvo que ya se esté escribiendo o haya un panel abierto.
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      buscador.current?.focus();
    }
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, []);

  async function onCambiarEstado(p: Proveedor, esDeshacer = false) {
    setCambiandoId(p.id);
    const supabase = createClient();
    const { error } = await supabase.rpc(p.activo ? "desactivar_proveedor" : "reactivar_proveedor", { p_proveedor_id: p.id });
    setCambiandoId(null);
    if (error) {
      avisar.error(traducirError(error, p.activo ? "desactivar el proveedor" : "reactivar el proveedor"));
      return;
    }
    avisar.exito(p.activo ? `${p.nombre} desactivado` : `${p.nombre} reactivado`, {
      detalle: p.activo ? "Deja de aparecer al registrar comprobantes; su historial se conserva." : "Vuelve a aparecer al registrar comprobantes.",
      // Deshacer = la operación contraria sobre el mismo proveedor. Nada se borra nunca (desactivar es un
      // estado), así que deshacer es exacto; y no se ofrece deshacer de un deshacer, para no encadenar avisos.
      accion: esDeshacer ? undefined : { texto: "Deshacer", onClick: () => void onCambiarEstado({ ...p, activo: !p.activo }, true) },
      duracion: esDeshacer ? undefined : 7000,
    });
    marcarReciente(p.id);
    router.refresh();
  }

  function vecino(delta: 1 | -1) {
    if (navegables.length === 0 || indiceAbierto < 0) return;
    const sig = navegables[(indiceAbierto + delta + navegables.length) % navegables.length];
    setAbiertoId(sig.id);
    document.querySelector(`[data-proveedor-id="${sig.id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  const Fila = verMontos ? FilaLider : FilaBase;
  const rubrosSugeridos = rubros.map((r) => r.etiqueta);

  return (
    <div className="space-y-6">
      <div className="anim-entra flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Compras</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Proveedores</h1>
          <p className="mt-1 text-sm text-tinta/65">A quién se le compra. Un proveedor tiene que estar acá antes de poder registrar su comprobante.</p>
        </div>
        {puedeEditar && (
          <Boton peso="primario" onClick={() => setBorrador(BORRADOR_VACIO)}>
            <span className="flex items-center gap-2">
              <span aria-hidden>+</span> Registrar proveedor
            </span>
          </Boton>
        )}
      </div>

      {verMontos && resumen && <ProveedoresIndicadores resumen={resumen} reparto={reparto} foco={foco} onFoco={setFoco} onAbrir={setAbiertoId} />}

      {/* Buscador + filtro por rubro con conteo. Una sola línea: el buscador a la izquierda, los rubros
          a la derecha; en celular los rubros bajan y se desplazan en horizontal. */}
      {hayProveedores && (
        <div className="anim-entra flex flex-wrap items-center gap-x-4 gap-y-3" style={{ ["--i" as string]: 6 }}>
          <div className="group/busca relative flex min-w-[14rem] flex-1 items-center gap-3 border-b border-tinta/25 px-0.5 py-1.5 after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:origin-left after:scale-x-0 after:bg-rojo after:transition-transform after:duration-300 after:ease-cayla focus-within:after:scale-x-100">
            <Search aria-hidden className="h-4 w-4 shrink-0 text-tinta/45" />
            <label htmlFor="proveedores-buscar" className="sr-only">
              Buscar proveedor
            </label>
            <input
              ref={buscador}
              id="proveedores-buscar"
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && busqueda) setBusqueda("");
              }}
              placeholder={hayMarcas ? "Nombre, marca, RUC o contacto" : "Nombre, RUC o contacto"}
              autoComplete="off"
              className="h-7 min-w-0 flex-1 bg-transparent text-sm text-tinta outline-none placeholder:text-tinta/45 [&::-webkit-search-cancel-button]:hidden"
            />
            {filtrando && (
              <span className="shrink-0 text-xs tabular-nums text-tinta/65">
                {activos.length + desactivados.length} de {proveedores.length}
              </span>
            )}
            {busqueda ? (
              <button
                type="button"
                onClick={() => {
                  setBusqueda("");
                  buscador.current?.focus();
                }}
                aria-label="Limpiar búsqueda"
                className="rounded-full p-0.5 text-tinta/55 transition-colors hover:text-rojo"
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            ) : (
              <kbd aria-hidden className="hidden rounded-[5px] border border-tinta/15 px-1.5 text-[10.5px] font-semibold text-tinta/55 transition-opacity group-focus-within/busca:opacity-0 sm:block">
                /
              </kbd>
            )}
          </div>
          {rubros.length > 0 && (
            <SegmentoDeslizante
              etiqueta="Filtrar por rubro"
              valor={rubro ?? ""}
              onCambio={(c) => setRubro(c || null)}
              opciones={[{ clave: "", etiqueta: "Todos", conteo: totalActivos }, ...rubros.map((r) => ({ clave: r.clave, etiqueta: r.etiqueta, conteo: r.conteo }))]}
            />
          )}
          {nSinPago > 0 && (
            <button
              type="button"
              aria-pressed={filtrarSinPago}
              onClick={() => setSoloSinPago((v) => !v)}
              className={`anim-revelar rounded-full border px-3 py-1 text-xs tabular-nums transition-colors duration-200 ${
                filtrarSinPago ? "border-tinta bg-tinta text-crema" : "border-ambar/40 bg-ambar/10 text-ambar-profundo hover:border-ambar-profundo"
              }`}
            >
              Sin datos de pago · {nSinPago}
            </button>
          )}
        </div>
      )}

      {!hayProveedores ? (
        <p className="font-display card-cayla py-8 text-center text-base italic text-tinta/65">Todavía no hay proveedores registrados.</p>
      ) : activos.length === 0 && desactivados.length === 0 ? (
        <p className="anim-revelar card-cayla p-5 text-sm text-tinta/75">
          Ningún proveedor coincide{busqueda.trim() ? ` con «${busqueda.trim()}»` : " con esos filtros"}.{" "}
          {marcas === null && busqueda.trim() && "Las marcas no se pudieron cargar: esta búsqueda no las incluye. "}
          {puedeEditar && busqueda.trim() && (
            <button type="button" onClick={() => setBorrador({ ...BORRADOR_VACIO, nombre: busqueda.trim() })} className="text-rojo hover:underline">
              Registrarlo →
            </button>
          )}
        </p>
      ) : activos.length === 0 ? null : (
        // `overflow-y-hidden`: mientras las filas se deslizan (FLIP) algunas pasan un instante fuera de la
        // tarjeta; sin esto, `overflow-x-auto` les da a las dos direcciones scroll y parpadea una barra vertical.
        <Tabla className="@container anim-entra overflow-y-hidden" style={{ ["--i" as string]: 7 }}>
          {verMontos ? <EncabezadoOrdenable orden={orden} onOrden={(c) => setOrden((o) => siguienteOrden(o, c))} /> : <Encabezado plantilla={PLANTILLA_BASE} columnas={[{ titulo: "Proveedor" }, { titulo: "RUC" }]} />}
          {activos.map((p, indice) => (
            <Fila
              key={p.id}
              p={p}
              indice={indice}
              busqueda={busqueda}
              marcas={marcasDe(p.id)}
              serie={series?.[p.id] ?? null}
              maxSaldo={maxSaldo}
              cambiando={cambiandoId === p.id}
              reciente={recientes.has(p.id)}
              enfoque={foco === null ? "neutro" : foco === p.id ? "foco" : "tenue"}
              refFila={refFila(p.id)}
              onAbrir={() => setAbiertoId(p.id)}
              onReactivar={() => onCambiarEstado(p)}
              abreFicha={puedeEditar}
            />
          ))}
        </Tabla>
      )}

      {desactivados.length > 0 && (
        <section className="anim-entra space-y-2" style={{ ["--i" as string]: 9 }}>
          <p className="label-cayla text-[11px] text-tinta/65">Desactivados — ya no aparecen al registrar un comprobante</p>
          <Tabla>
            {desactivados.map((p, indice) => (
              <Fila
                key={p.id}
                p={p}
                indice={indice}
                busqueda={busqueda}
                marcas={marcasDe(p.id)}
                serie={series?.[p.id] ?? null}
                maxSaldo={maxSaldo}
                cambiando={cambiandoId === p.id}
                reciente={recientes.has(p.id)}
                enfoque="neutro"
                refFila={undefined}
                onAbrir={() => setAbiertoId(p.id)}
                onReactivar={() => onCambiarEstado(p)}
                abreFicha={puedeEditar}
              />
            ))}
          </Tabla>
        </section>
      )}

      {verMontos && abierto && (
        <ProveedorVistaRapida
          proveedor={abierto}
          marcas={marcasDe(abierto.id)}
          serie={series?.[abierto.id] ?? null}
          posicion={{ indice: Math.max(0, indiceAbierto), total: navegables.length }}
          cambiando={cambiandoId === abierto.id}
          onCerrar={() => setAbiertoId(null)}
          onNavegar={vecino}
          onCambiarEstado={() => onCambiarEstado(abierto)}
        />
      )}

      {borrador && (
        <ProveedorModal
          inicial={borrador}
          rubros={rubrosSugeridos}
          existentes={proveedores}
          onClose={() => setBorrador(null)}
          onGuardado={(id) => {
            setBorrador(null);
            if (id) {
              // El recién guardado tiene que verse: se limpia lo que pudiera esconderlo, se marca y, cuando
              // llegue en la próxima lectura, se lleva a la vista.
              setBusqueda("");
              setRubro(null);
              setSoloSinPago(false);
              pendienteScroll.current = id;
              marcarReciente(id);
            }
            router.refresh();
          }}
          onDesactivar={
            borrador.id
              ? async () => {
                  const p = proveedores.find((x) => x.id === borrador.id);
                  if (!p) return;
                  await onCambiarEstado(p);
                  setBorrador(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filas y encabezado: FUERA del componente a propósito. Declaradas adentro (como estaban), cada
// tecla del buscador creaba componentes nuevos y React desmontaba y volvía a montar TODAS las filas.
// ---------------------------------------------------------------------------

type PropsFila = {
  p: Proveedor;
  /** Posición en su lista: desfasa la entrada escalonada de la fila (se topa en 10). */
  indice: number;
  busqueda: string;
  /** Marcas con que se conoce al proveedor (ADR-0140), en orden alfabético. */
  marcas: readonly string[];
  serie: number[] | null;
  maxSaldo: number;
  cambiando: boolean;
  reciente: boolean;
  /** «foco»: la fila del tramo de la barra al que se apunta; «tenue»: las demás mientras tanto. */
  enfoque: "neutro" | "foco" | "tenue";
  refFila: ((el: HTMLElement | null) => void) | undefined;
  onAbrir: () => void;
  onReactivar: () => void;
  /** Sin los montos pero con el módulo Proveedores (P3): la fila lleva a la ficha, donde se edita. */
  abreFicha?: boolean;
};

const MONOGRAMA = "font-display grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-sand text-base text-tinta transition-colors duration-300 group-hover:bg-tinta group-hover:text-crema";

function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// Nombre/contacto/rubro/plazo: para cualquiera. El resto de la fila (RUC en adelante) cambia de
// contenido Y de significado entre líder y colaborador, no solo de estilo.
// Cuántas etiquetas de marca caben en la fila antes de resumir el resto en «+N».
const MARCAS_POR_FILA = 3;

function NombreCelda({
  p,
  busqueda,
  marcas,
  marcarSinPago = false,
}: {
  p: Proveedor;
  busqueda: string;
  marcas: readonly string[];
  /** Solo quien edita proveedores: es quien puede completar los datos (ADR-0134, P3). */
  marcarSinPago?: boolean;
}) {
  const sinPago = marcarSinPago && p.activo && sinDatosDePago(p);
  const { visibles, ocultas } = marcasParaMostrar(marcas, busqueda, MARCAS_POR_FILA);
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span aria-hidden className={MONOGRAMA}>
        {iniciales(p.nombre)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm text-tinta">
          <Resaltado texto={p.nombre} busqueda={busqueda} />
        </span>
        <span className="block truncate text-xs text-tinta/65">
          {p.contacto ? <Resaltado texto={p.contacto} busqueda={busqueda} /> : "Sin contacto"}
          {p.rubros.length > 0 && ` · ${p.rubros.join(", ")}`}
          {p.plazo_credito_dias != null && ` · Crédito ${p.plazo_credito_dias} d`}
        </span>
        {/* Debajo, no al lado: junto al nombre le quitaba ancho y lo cortaba («Confecciones d…»). Las marcas van en la
            misma línea que el aviso de pago para no alargar la fila (ADR-0140). */}
        {(sinPago || visibles.length > 0) && (
          <span className="mt-1 flex flex-wrap items-center gap-1">
            {sinPago && (
              <Chip tono="ambar" versalitas={false}>
                Sin datos de pago
              </Chip>
            )}
            {visibles.map((m) => (
              // Un solo hijo dentro del chip: es flex con `gap`, y cada tramo del resaltado (<span>, <mark>, <span>) sería un
              // ítem aparte con un hueco DENTRO de la palabra. El `truncate` corta una marca más ancha que la columna.
              <Chip key={m} versalitas={false} className="min-w-0 max-w-full">
                <span className="truncate">
                  <Resaltado texto={m} busqueda={busqueda} />
                </span>
              </Chip>
            ))}
            {ocultas > 0 && (
              <span className="text-[11px] text-tinta/55" title={marcas.filter((m) => !visibles.includes(m)).join(", ")}>
                +{ocultas}
              </span>
            )}
          </span>
        )}
      </span>
    </span>
  );
}

// Directorio para quien no ve los montos de Compras: sin ninguna columna financiera — `fn_proveedores()` ya le manda esos
// campos en NULL, esto es la segunda capa, no la única (20260917240000). Con el módulo Proveedores (P3) el nombre lleva a
// la ficha, donde se edita; sin él, no hay a dónde ir.
function FilaBase({ p, busqueda, marcas, abreFicha = false }: PropsFila) {
  return (
    <div data-proveedor-id={p.id} className={fila(PLANTILLA_BASE, `group ${p.activo ? "" : "opacity-60"}`)}>
      <span className={celda("izq", "min-w-0")}>
        {abreFicha ? (
          <Link href={`/compras/proveedores/${p.id}`} aria-label={`${p.nombre}: abrir ficha`} className="block min-w-0 rounded-md outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo/60">
            <NombreCelda p={p} busqueda={busqueda} marcas={marcas} marcarSinPago />
          </Link>
        ) : (
          <NombreCelda p={p} busqueda={busqueda} marcas={marcas} />
        )}
      </span>
      <span className={celda("izq", "font-mono text-xs tabular-nums text-tinta/75")}>{p.ruc ? <Resaltado texto={p.ruc} busqueda={busqueda} /> : "Sin RUC"}</span>
    </div>
  );
}

// La fila entera abre la vista rápida: el botón del nombre se estira con `after:` sobre toda la fila (un
// solo elemento interactivo, con nombre accesible, en vez de un `div` clicable); el saldo, cuando lo hay,
// lleva a Por pagar ya filtrado y los demás enlaces quedan por encima (`relative`) para no disparar la
// vista rápida. Al pasar el mouse: un filo rojo crece a la izquierda, el monograma se llena y, si hay
// serie, la mini-tendencia se redibuja.
function FilaLider({ p, indice, busqueda, marcas, serie, maxSaldo, cambiando, reciente, enfoque, refFila, onAbrir, onReactivar }: PropsFila) {
  const entregas = chipEntregas(p);
  const saldo = p.saldo ?? 0;
  const vencido = (p.saldo_vencido ?? 0) > 0;
  const dias = p.dias_desde_ultima_compra;
  const dormido = p.activo && dias != null && dias > 90;
  return (
    <div
      ref={refFila}
      data-proveedor-id={p.id}
      style={{ ["--i" as string]: 8 + Math.min(indice, 10) }}
      className={`anim-entra group relative grid ${COLUMNAS_LIDER} items-center gap-x-4 px-5 py-3 transition-[background-color,opacity] duration-200 before:absolute before:inset-y-2.5 before:left-0 before:w-0.5 before:origin-center before:rounded-full before:bg-rojo before:transition-transform before:duration-300 before:ease-cayla hover:bg-tinta/[0.03] hover:before:scale-y-100 ${
        enfoque === "foco" ? "bg-tinta/[0.04] before:scale-y-100" : "before:scale-y-0"
      } ${enfoque === "tenue" ? "opacity-40" : p.activo ? "" : "opacity-60"}`}
    >
      {/* El destello vive en su propia capa: `animation` es una sola propiedad, y si se pusiera en la fila
          pisaría a la entrada `anim-entra` (y al quitarlo, la entrada se repetiría). */}
      {reciente && <span aria-hidden className="anim-destello-fila pointer-events-none absolute inset-0" />}
      <button type="button" onClick={onAbrir} aria-label={`${p.nombre}: abrir vista rápida`} className="min-w-0 text-left outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-rojo/60">
        <NombreCelda p={p} busqueda={busqueda} marcas={marcas} marcarSinPago />
      </button>
      <span className="hidden truncate font-mono text-xs tabular-nums text-tinta/75 @7xl:block">{p.ruc ? <Resaltado texto={p.ruc} busqueda={busqueda} /> : "Sin RUC"}</span>
      <span className="hidden items-center justify-end gap-2.5 whitespace-nowrap text-sm tabular-nums @3xl:flex">
        {serie && <Sparkline serie={serie} indice={indice} />}
        <span className={p.facturado_12m ? "text-tinta" : "text-tinta/45"}>{soles(p.facturado_12m ?? 0)}</span>
      </span>
      <span className="text-right text-sm tabular-nums">
        {saldo > 0 ? (
          <>
            <Link
              href={`/compras/por-pagar?prov=${p.id}`}
              className={`relative whitespace-nowrap underline-offset-4 hover:underline ${vencido ? "text-rojo" : "text-tinta hover:text-rojo"}`}
            >
              {soles(saldo)}
            </Link>
            {/* La deuda a escala: el largo es la parte del mayor saldo de la lista y el rojo, lo ya vencido. */}
            <span aria-hidden title={vencido ? `Vencido: ${soles(p.saldo_vencido ?? 0)}` : "Nada vencido"} className="mt-1 block h-[3px] overflow-hidden rounded-full bg-sand">
              <span className="anim-crece-x flex h-full" style={{ width: `${Math.max(4, (saldo / maxSaldo) * 100)}%`, ["--i" as string]: 8 + Math.min(indice, 10) }}>
                <span className="h-full bg-rojo" style={{ width: `${(Math.min(p.saldo_vencido ?? 0, saldo) / saldo) * 100}%` }} />
                <span className="h-full flex-1 bg-tinta/45" />
              </span>
            </span>
          </>
        ) : (
          <span className="text-tinta/45">{soles(saldo)}</span>
        )}
      </span>
      {/* Saldo a favor: lo que el proveedor le debe a CAYLA (una nota de crédito que superó su deuda); se descuenta al pagar. */}
      <span className="hidden text-right text-sm tabular-nums @5xl:block">
        {(p.saldo_favor ?? 0) > 0 ? (
          <Link href={`/compras/proveedores/${p.id}#saldo-a-favor`} className="relative whitespace-nowrap font-semibold text-verde-profundo underline-offset-4 hover:underline">
            {soles(p.saldo_favor ?? 0)}
          </Link>
        ) : (
          <span className="text-tinta/45">—</span>
        )}
      </span>
      <span className="hidden justify-end overflow-visible text-xs @5xl:flex">{entregas ? <Chip tono={entregas.tono}>{entregas.texto}</Chip> : <span className="text-tinta/45">—</span>}</span>
      <span className={`hidden whitespace-nowrap text-right text-sm @7xl:block ${dormido ? "text-ambar-profundo" : "text-tinta/65"}`} title={p.ultima_compra ?? undefined}>
        {haceCuanto(dias)}
      </span>
      <span className="hidden items-center justify-end gap-2 overflow-visible @3xl:flex">
        {p.activo ? (
          <Link
            href={`/compras/nueva?prov=${p.id}`}
            className="label-cayla relative inline-block whitespace-nowrap rounded-md border border-tinta/20 px-2.5 py-1.5 text-[11px] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo"
          >
            + Comprobante
          </Link>
        ) : (
          <Boton type="button" peso="discreto" cargando={cambiando} onClick={onReactivar} className="relative px-2.5 py-1.5 text-[11px]">
            {cambiando ? "…" : "Reactivar"}
          </Boton>
        )}
        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 -translate-x-1.5 text-tinta/45 opacity-0 transition-[opacity,transform] duration-300 ease-cayla group-hover:translate-x-0 group-hover:opacity-100" />
      </span>
    </div>
  );
}

// Los encabezados de Facturado, Saldo y Última compra ordenan la tabla; el nombre también (clic en
// «Proveedor»). La flecha dice hacia dónde y GIRA al invertir el orden. `aria-sort` para el lector de pantalla.
// Las columnas se muestran con los mismos cortes que las celdas de `FilaLider` (COLUMNAS_LIDER).
function EncabezadoOrdenable({ orden, onOrden }: { orden: Orden; onOrden: (c: CampoOrden) => void }) {
  const col = (titulo: string, campo: CampoOrden | null, opts: { der?: boolean; desde?: "sm" | "lg" | "xl" } = {}) => {
    const visible = opts.desde === "xl" ? "hidden @7xl:flex" : opts.desde === "lg" ? "hidden @5xl:flex" : opts.desde === "sm" ? "hidden @3xl:flex" : "flex";
    const alinear = opts.der ? "justify-end text-right" : "text-left";
    if (!campo) {
      return (
        <span key={titulo || "accion"} className={`label-cayla ${visible} ${alinear} whitespace-nowrap text-[11px] text-tinta/55`} role="columnheader">
          {titulo}
        </span>
      );
    }
    const activo = orden.campo === campo;
    return (
      <button
        key={titulo}
        type="button"
        role="columnheader"
        aria-sort={activo ? (orden.dir === "desc" ? "descending" : "ascending") : "none"}
        onClick={() => onOrden(campo)}
        className={`label-cayla ${visible} items-center gap-1 whitespace-nowrap text-[11px] transition-colors hover:text-rojo ${alinear} ${activo ? "text-tinta" : "text-tinta/55"}`}
      >
        {titulo}
        <ArrowDown aria-hidden className={`h-3 w-3 shrink-0 transition-[opacity,transform] duration-300 ease-cayla ${activo ? "opacity-100" : "opacity-0"} ${activo && orden.dir === "asc" ? "rotate-180" : ""}`} />
      </button>
    );
  };
  return (
    <div className={`hidden gap-x-4 px-5 py-2 @3xl:grid ${COLUMNAS_LIDER}`} role="row">
      {col("Proveedor", "nombre")}
      {col("RUC", null, { desde: "xl" })}
      {col("Facturado · 12 m", "facturado", { der: true, desde: "sm" })}
      {col("Saldo", "saldo", { der: true })}
      {col("A favor", "favor", { der: true, desde: "lg" })}
      {col("Entregas", null, { der: true, desde: "lg" })}
      {col("Última compra", "ultima", { der: true, desde: "xl" })}
      {col("", null, { desde: "sm" })}
    </div>
  );
}
