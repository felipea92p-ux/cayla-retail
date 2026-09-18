"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Proveedor } from "@/lib/proveedores";
import { ProveedorModal, BORRADOR_VACIO, borradorDe, type Borrador } from "@/components/ProveedorModal";
import { soles } from "@/lib/compras-reglas";
import { clave } from "@/lib/buscar-prenda-v2";
import { diaMes, hoyLima } from "@/lib/fechas-lima";
import { chipEntregas, ordenarProveedores, rubrosConConteo, claveRubro, siguienteOrden, type CampoOrden, type Orden } from "@/lib/proveedores-reglas";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";

// Dos plantillas, no una con columnas ocultas: lo financiero (facturado, saldo, entregas, última
// compra) es solo de líder — corrección de D-27, 2026-09-17 (ver
// 20260917240000_proveedores_lista_indicadores_y_candado_sede.sql). Un colaborador ve el directorio
// puro (Proveedor · RUC); ni la base le manda esos números (fn_proveedores() los devuelve NULL), así
// que ocultar la columna acá es la segunda capa, no la única.
// Proveedor · RUC · Facturado 12 m · Saldo · Entregas · Última compra · acción
const PLANTILLA_LIDER = "sm:grid-cols-[1fr_6.75rem_7.25rem_7.25rem_8rem_7.375rem_8.75rem]";
const PLANTILLA_BASE = "sm:grid-cols-[1fr_8rem]";

// Directorio de proveedores: a quién se le compra. Es la puerta de entrada del módulo — sin un
// proveedor registrado no se puede registrar su comprobante (`compras.proveedor_id` es FK dura), y
// hasta hoy el único camino era el SQL Editor. Alta y edición pasan por RPC (registrar_proveedor /
// actualizar_proveedor); desactivar nunca borra — los comprobantes históricos siguen diciendo de
// quién fueron.
//
// ADR-0104 (maqueta 08): la lista ahora ayuda a decidir. Arriba, cuatro cifras (a quién se le debe,
// cuánta deuda concentra uno solo, quiénes llevan meses sin comprar). En la tabla, «Facturado · 12 m»
// (lo reciente pesa más que «desde siempre»), «Saldo» en rojo si ya venció algo, «Entregas» (lo que
// hay que reclamar), columnas ordenables (por defecto por saldo) y «+ Comprobante» en la fila.
// Un filtro por rubro con conteo — el rubro ya se guardaba y se veía por fila, faltaba poder filtrar.
//
// `esLider` gobierna tres cosas a la vez, no solo «puede editar»: ver lo financiero, entrar al
// detalle (clic en la fila), y editar/registrar/desactivar. Hoy las tres son la misma condición
// (rol líder) — un solo prop en vez de tres idénticos, hasta que alguna necesite separarse de verdad.
export function ProveedoresPanel({ proveedores, esLider, indicadores }: { proveedores: Proveedor[]; esLider: boolean; indicadores?: ReactNode }) {
  const router = useRouter();
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [rubro, setRubro] = useState<string | null>(null); // clave normalizada; null = todos
  const [orden, setOrden] = useState<Orden>({ campo: "saldo", dir: "desc" });

  // Búsqueda en memoria: el directorio entero ya está en la página (son decenas de proveedores, no
  // miles), así que filtrar acá es instantáneo y no cuesta una consulta por tecla. Busca por nombre,
  // RUC y contacto, sin tildes ni mayúsculas (misma `clave` que el buscador de Vender).
  const k = clave(busqueda);
  const rubros = useMemo(() => rubrosConConteo(proveedores.filter((p) => p.activo)), [proveedores]);
  const coincide = (p: Proveedor) => (!k || clave(`${p.nombre} ${p.ruc ?? ""} ${p.contacto ?? ""}`).includes(k)) && (!rubro || claveRubro(p.rubro) === rubro);
  const activos = ordenarProveedores(
    proveedores.filter((p) => p.activo && coincide(p)),
    orden,
  );
  const desactivados = proveedores.filter((p) => !p.activo && coincide(p));
  const totalActivos = proveedores.filter((p) => p.activo).length;
  const hayProveedores = totalActivos > 0;
  const filtrando = !!k || !!rubro;

  async function onCambiarEstado(p: Proveedor) {
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
    });
    router.refresh();
  }

  const plantilla = esLider ? PLANTILLA_LIDER : PLANTILLA_BASE;
  const Fila = esLider ? FilaLider : FilaBase;
  const rubrosSugeridos = rubros.map((r) => r.etiqueta);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Compras</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Proveedores</h1>
          <p className="mt-1 text-sm text-tinta/65">A quién se le compra. Un proveedor tiene que estar acá antes de poder registrar su comprobante.</p>
        </div>
        {esLider && (
          <Boton peso="primario" onClick={() => setBorrador(BORRADOR_VACIO)}>
            <span className="flex items-center gap-2">
              <span aria-hidden>+</span> Registrar proveedor
            </span>
          </Boton>
        )}
      </div>

      {indicadores}

      {/* Buscador + filtro por rubro con conteo. Una sola línea: el buscador a la izquierda, los rubros
          a la derecha; en celular los rubros bajan y se desplazan en horizontal. */}
      {hayProveedores && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex min-w-[14rem] flex-1 items-center gap-3 border-b border-tinta/25 px-0.5 py-1.5 focus-within:border-b-2 focus-within:border-rojo">
            <label htmlFor="proveedores-buscar" className="sr-only">
              Buscar proveedor
            </label>
            <input
              id="proveedores-buscar"
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre, RUC o contacto"
              autoComplete="off"
              className="h-7 min-w-0 flex-1 bg-transparent text-sm text-tinta outline-none placeholder:text-tinta/45"
            />
            {filtrando && (
              <span className="shrink-0 text-xs tabular-nums text-tinta/65">
                {activos.length + desactivados.length} de {proveedores.length}
              </span>
            )}
          </div>
          {rubros.length > 0 && (
            <div role="radiogroup" aria-label="Filtrar por rubro" className="inline-flex max-w-full overflow-x-auto rounded-lg border border-tinta/15">
              {[{ clave: "", etiqueta: "Todos", conteo: totalActivos }, ...rubros].map((r) => {
                const activo = (rubro ?? "") === r.clave;
                return (
                  <button
                    key={r.clave || "todos"}
                    type="button"
                    role="radio"
                    aria-checked={activo}
                    onClick={() => setRubro(r.clave || null)}
                    className={`label-cayla shrink-0 whitespace-nowrap px-3.5 py-2.5 text-[11px] transition-colors ${activo ? "bg-tinta text-crema" : "text-tinta/65 hover:text-rojo"}`}
                  >
                    {r.etiqueta} · {r.conteo}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!hayProveedores ? (
        <p className="font-display card-cayla py-8 text-center text-base italic text-tinta/65">Todavía no hay proveedores registrados.</p>
      ) : activos.length === 0 && desactivados.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">
          Ningún proveedor coincide{busqueda.trim() ? ` con «${busqueda.trim()}»` : " con ese rubro"}.{" "}
          {esLider && busqueda.trim() && (
            <button type="button" onClick={() => setBorrador({ ...BORRADOR_VACIO, nombre: busqueda.trim() })} className="text-rojo hover:underline">
              Registrarlo →
            </button>
          )}
        </p>
      ) : activos.length === 0 ? null : (
        <Tabla>
          {esLider ? <EncabezadoOrdenable plantilla={plantilla} orden={orden} onOrden={(c) => setOrden((o) => siguienteOrden(o, c))} /> : <Encabezado plantilla={plantilla} columnas={[{ titulo: "Proveedor" }, { titulo: "RUC" }]} />}
          {activos.map((p) => (
            <Fila key={p.id} p={p} plantilla={plantilla} cambiando={cambiandoId === p.id} onReactivar={() => onCambiarEstado(p)} />
          ))}
        </Tabla>
      )}

      {desactivados.length > 0 && (
        <section className="space-y-2">
          <p className="label-cayla text-[11px] text-tinta/65">Desactivados — ya no aparecen al registrar un comprobante</p>
          <Tabla>
            {desactivados.map((p) => (
              <Fila key={p.id} p={p} plantilla={plantilla} cambiando={cambiandoId === p.id} onReactivar={() => onCambiarEstado(p)} />
            ))}
          </Tabla>
        </section>
      )}

      {borrador && (
        <ProveedorModal
          inicial={borrador}
          rubros={rubrosSugeridos}
          onClose={() => setBorrador(null)}
          onGuardado={() => {
            setBorrador(null);
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

// Nombre/contacto/rubro/plazo: para cualquiera. El resto de la fila (RUC en adelante) cambia de
// contenido Y de significado entre líder y colaborador, no solo de estilo.
function NombreCelda({ p }: { p: Proveedor }) {
  return (
    <>
      <span className="block truncate text-sm text-tinta">{p.nombre}</span>
      <span className="block truncate text-xs text-tinta/65">
        {p.contacto ?? "Sin contacto"}
        {p.rubro && ` · ${p.rubro}`}
        {p.plazo_credito_dias != null && ` · Crédito ${p.plazo_credito_dias} d`}
      </span>
    </>
  );
}

// Directorio puro para quien no es líder: sin clic (no hay detalle que mostrarle) y sin ninguna
// columna financiera — `fn_proveedores()` ya le manda esos campos en NULL, esto es la segunda capa,
// no la única (20260917240000_proveedores_lista_indicadores_y_candado_sede.sql).
function FilaBase({ p, plantilla }: { p: Proveedor; plantilla: string }) {
  return (
    <div className={fila(plantilla, `${p.activo ? "" : "opacity-60"}`)}>
      <span className={celda("izq", "min-w-0")}>
        <NombreCelda p={p} />
      </span>
      <span className={celda("izq", "font-mono text-xs tabular-nums text-tinta/75")}>{p.ruc ?? "Sin RUC"}</span>
    </div>
  );
}

// La fila entera lleva a la ficha del proveedor (el enlace del nombre se estira con `after:`); el
// saldo, cuando lo hay, lleva a Por pagar ya filtrado; los botones quedan por encima (`relative`)
// para no disparar el enlace de fila.
function FilaLider({ p, plantilla, cambiando, onReactivar }: { p: Proveedor; plantilla: string; cambiando: boolean; onReactivar: () => void }) {
  const entregas = chipEntregas(p);
  const saldo = p.saldo ?? 0;
  const vencido = (p.saldo_vencido ?? 0) > 0;
  const ult = p.ultima_compra;
  return (
    <div className={fila(plantilla, `relative transition-colors hover:bg-tinta/[0.03] ${p.activo ? "" : "opacity-60"}`)}>
      <Link href={`/compras/proveedores/${p.id}`} className={celda("izq", "min-w-0 after:absolute after:inset-0 after:content-['']")}>
        <NombreCelda p={p} />
      </Link>
      <span className={celda("izq", "font-mono text-xs tabular-nums text-tinta/75")}>{p.ruc ?? "Sin RUC"}</span>
      <span className={celda("der", `text-sm ${p.facturado_12m ? "text-tinta" : "text-tinta/45"}`)}>{soles(p.facturado_12m ?? 0)}</span>
      <span className={celda("der", "text-sm")}>
        {saldo > 0 ? (
          <Link href={`/compras/por-pagar?prov=${p.id}`} className={`relative underline-offset-4 hover:underline ${vencido ? "text-rojo" : "text-tinta hover:text-rojo"}`}>
            {soles(saldo)}
          </Link>
        ) : (
          <span className="text-tinta/45">{soles(saldo)}</span>
        )}
      </span>
      <span className={celda("der", "overflow-visible text-xs")}>{entregas ? <Chip tono={entregas.tono}>{entregas.texto}</Chip> : <span className="text-tinta/45">—</span>}</span>
      <span className={celda("der", "text-sm text-tinta/65")}>
        {ult ? (ult.slice(0, 4) === hoyLima().slice(0, 4) ? diaMes(ult) : `${diaMes(ult)}/${ult.slice(2, 4)}`) : "Nunca"}
      </span>
      <span className={celda("der", "overflow-visible")}>
        {p.activo ? (
          <Link
            href={`/compras/nueva?prov=${p.id}`}
            className="label-cayla relative inline-block rounded-md border border-tinta/20 px-2.5 py-1.5 text-[11px] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo"
          >
            + Comprobante
          </Link>
        ) : (
          <Boton type="button" peso="discreto" cargando={cambiando} onClick={onReactivar} className="relative px-2.5 py-1.5 text-[11px]">
            {cambiando ? "…" : "Reactivar"}
          </Boton>
        )}
      </span>
    </div>
  );
}

// Los encabezados de Facturado, Saldo y Última compra ordenan la tabla; el nombre también (clic en
// «Proveedor»). La flecha dice hacia dónde. `aria-sort` para el lector de pantalla.
function EncabezadoOrdenable({ plantilla, orden, onOrden }: { plantilla: string; orden: Orden; onOrden: (c: CampoOrden) => void }) {
  const col = (titulo: string, campo: CampoOrden | null, der = false) => {
    if (!campo) return <span key={titulo} className={`label-cayla text-[11px] text-tinta/55 ${der ? "text-right" : ""}`} role="columnheader">{titulo}</span>;
    const activo = orden.campo === campo;
    const Flecha = orden.dir === "desc" ? ArrowDown : ArrowUp;
    return (
      <button
        key={titulo}
        type="button"
        role="columnheader"
        aria-sort={activo ? (orden.dir === "desc" ? "descending" : "ascending") : "none"}
        onClick={() => onOrden(campo)}
        className={`label-cayla inline-flex items-center gap-1 text-[11px] transition-colors hover:text-rojo ${der ? "justify-end text-right" : "text-left"} ${activo ? "text-tinta" : "text-tinta/55"}`}
      >
        {titulo}
        {activo && <Flecha aria-hidden className="h-3 w-3 shrink-0" />}
      </button>
    );
  };
  return (
    <div className={`hidden gap-x-4 px-5 py-2 sm:grid ${plantilla}`} role="row">
      {col("Proveedor", "nombre")}
      {col("RUC", null)}
      {col("Facturado · 12 m", "facturado", true)}
      {col("Saldo", "saldo", true)}
      {col("Entregas", null, true)}
      {col("Última compra", "ultima", true)}
      {col("", null)}
    </div>
  );
}
