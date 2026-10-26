"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, Banknote, Check, ChevronRight, Shirt } from "lucide-react";
import type { Proveedor } from "@/lib/proveedores";
import { soles } from "@/lib/compras-reglas";
import { solesRedondo } from "@/lib/gastos-reglas";
import { RITMOS, DIAS_DE_VENTAS, FILAS_A_LA_VISTA, cambioDePuesto, esAproximado, semanaDeVentas, textoRitmo, type FilaRanking, type MedidaRanking } from "@/lib/proveedores-ranking-reglas";
import type { RendimientoProveedor } from "@/lib/proveedor-prendas-reglas";
import { Tabla, Encabezado, fila, celda, type Columna } from "@/components/ui/Tabla";
import { Anillo } from "@/components/ui/Anillo";
import { BarraApilada } from "@/components/ui/BarraApilada";
import { Chip } from "@/components/ui/Chip";
import { Sparkline } from "@/components/ui/Sparkline";
import { Resaltado } from "@/components/ui/Resaltado";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";

// El ranking de la pestaña Mercadería (dirección «C · Filas con su venta», elegida por Felipe el 2026-10-26; maqueta en
// docs/maquetas/proveedores-v5-2026-10/). Cada fila: el puesto, el proveedor (y lo que se le debe, si algo), cuánto de lo comprado ya se vendió
// (el anillo), cuánto le compraste contra el que más (la barra: lo oscuro, vendido; lo claro, lo que sigue en tus tiendas) y en cuántas semanas
// se vende lo que queda con lo que toca hacer (la insignia). Las cuentas viven en `lib/proveedores-ranking-reglas.ts`; aquí solo se dibujan.
//
// La fila entera abre la vista rápida que ya existía (decisión de Felipe, 2026-10-26): el botón del nombre se estira sobre la fila con `after:`
// y el enlace a Por pagar queda por encima (`relative`), igual que en el directorio.

// Columnas según el ANCHO DE LA TABLA (`@container`), como el directorio: angosta, puesto · proveedor · insignia y la barra debajo; desde 42 rem,
// todo en una línea (con la columna derecha al lado, la lista mide ~44 rem en una pantalla de 1440).
const PLANTILLA =
  "grid-cols-[1.75rem_minmax(0,1fr)_auto] @2xl:grid-cols-[2rem_minmax(9.5rem,1.6fr)_5.75rem_2.75rem_minmax(6.5rem,1fr)_9.5rem_1rem]";
const columnas = (medida: MedidaRanking): Columna[] => [
  { titulo: "#", alinear: "der" },
  { titulo: "Proveedor" },
  { titulo: "Ventas", subtitulo: "por día, 4 semanas" },
  { titulo: "Vendido" },
  { titulo: medida === "soles" ? "Le compraste · dinero" : "Le compraste · prendas", subtitulo: "lo oscuro ya se vendió" },
  { titulo: "Lo que queda se vende en" },
  { titulo: "" },
];

// Un proveedor sin ventas en las 4 semanas no viene en la lectura: su serie es todo cero (la fila dice «0 esta semana»).
const SIN_VENTAS: number[] = Array.from({ length: DIAS_DE_VENTAS }, () => 0);

// Las dos medidas, cada una con su ícono (Felipe 2026-10-26): el polo para las prendas, el billete para el dinero. El mismo ícono va junto a cada
// cifra del ranking para que nunca se confunda una medida con la otra.
const ICONO_MEDIDA = { prendas: Shirt, soles: Banknote } as const;

/** «Prendas compradas» / «Dinero gastado» como dos tarjetas de opción: el ícono, el nombre, el total de todos y qué quiere decir. Ordenan el ranking. */
export function MedidaDelRanking({ medida, onMedida, prendas, gasto, cargaPct, proveedores }: { medida: MedidaRanking; onMedida: (m: MedidaRanking) => void; prendas: number; gasto: number; cargaPct: number; proveedores: number }) {
  const opciones = [
    { m: "prendas" as const, titulo: "Prendas compradas", valor: prendas.toLocaleString("es-PE"), nota: `a ${proveedores} ${proveedores === 1 ? "proveedor" : "proveedores"}` },
    { m: "soles" as const, titulo: "Dinero gastado", valor: `${cargaPct >= 50 ? "≈ " : ""}${solesRedondo(gasto)}`, nota: cargaPct >= 50 ? `aproximado: el ${Math.round(cargaPct)} % vino por la carga inicial` : "con el costo de cada compra" },
  ];
  return (
    <div role="radiogroup" aria-label="Ordenar el ranking por" data-guia="proveedores.medida" className="grid grid-cols-2 gap-2.5 sm:inline-grid sm:grid-cols-[repeat(2,minmax(0,17rem))]">
      {opciones.map((o) => {
        const Icono = ICONO_MEDIDA[o.m];
        const on = medida === o.m;
        return (
          <button
            key={o.m}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onMedida(o.m)}
            className={`group/medida grid grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-3 rounded-xl border-[1.5px] px-3.5 py-3 text-left transition-[border-color,box-shadow] duration-300 ease-cayla sm:grid-cols-[2.75rem_minmax(0,1fr)_1.25rem] ${
              on ? "border-tinta bg-papel shadow-[0_10px_24px_-18px_color-mix(in_srgb,var(--color-sombra)_60%,transparent)]" : "border-sand bg-papel hover:border-taupe"
            }`}
          >
            <span className={`grid h-9 w-9 place-items-center rounded-[10px] transition-colors duration-300 ease-cayla sm:h-11 sm:w-11 sm:rounded-xl ${on ? "bg-tinta text-crema" : "bg-hueso text-tinta"}`}>
              <Icono aria-hidden className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold text-tinta">{o.titulo}</span>
              <span className="font-display block whitespace-nowrap text-[22px] leading-tight text-tinta tabular-nums sm:text-[26px]">{o.valor}</span>
              <span className="block text-xs leading-snug text-tinta/65">{o.nota}</span>
            </span>
            <span aria-hidden className={`hidden h-5 w-5 place-items-center self-start rounded-full border-[1.5px] transition-colors duration-300 ease-cayla sm:grid ${on ? "border-tinta bg-tinta text-crema" : "border-sand"}`}>
              {on && <Check /* unificar-fijo: la marca sobre un punto lleno lleva trazo 3, como la casilla (ronda 15) */ className="check-trazo h-3 w-3" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function ProveedoresRanking({
  filas,
  proveedores,
  maxValor,
  medida,
  antes,
  ventas,
  busqueda,
  verTodos,
  onVerTodos,
  onAbrir,
  refFila,
  taller,
}: {
  filas: readonly FilaRanking[];
  /** El proveedor de cada fila (lo que se le debe, sus marcas y rubros): llega del directorio, no del ranking. */
  proveedores: ReadonlyMap<string, Proveedor>;
  /** Lo que se le compró al primero en la medida elegida: la barra de cada fila se mide contra él. */
  maxValor: number;
  medida: MedidaRanking;
  /** Los puestos de antes de cambiar de medida: cada fila dice cuántos subió o bajó. `null` mientras no se cambie. */
  antes: ReadonlyMap<string, number> | null;
  /** Lo vendido por día (28 días) de cada proveedor; `null` si la base no lo tiene. */
  ventas: Record<string, number[]> | null;
  busqueda: string;
  verTodos: boolean;
  onVerTodos: (v: boolean) => void;
  onAbrir: (id: string) => void;
  refFila: (id: string) => (el: HTMLElement | null) => void;
  taller: (RendimientoProveedor & { pesoPct: number }) | null;
}) {
  const vista = filas.slice(0, FILAS_A_LA_VISTA);
  const resto = filas.slice(FILAS_A_LA_VISTA);
  const filaDe = (f: FilaRanking, i: number) => (
    <FilaDelRanking key={f.proveedorId} f={f} p={proveedores.get(f.proveedorId)} indice={i} maxValor={maxValor} medida={medida} cambio={cambioDePuesto(antes, f)} serie={ventas ? (ventas[f.proveedorId] ?? SIN_VENTAS) : null} busqueda={busqueda} onAbrir={onAbrir} refFila={refFila(f.proveedorId)} />
  );
  return (
    <div className="space-y-3" data-guia="proveedores.lista">
      <Tabla className="@container anim-entra overflow-y-hidden" style={{ ["--i" as string]: 7 }}>
        <Encabezado plantilla={PLANTILLA} columnas={columnas(medida)} visible="hidden @2xl:grid" />
        {vista.map(filaDe)}
        {resto.length > 0 && (
          <FilasDeMas abierto={verTodos} id="proveedores-ranking-resto">
            {resto.map((f, i) => filaDe(f, FILAS_A_LA_VISTA + i))}
          </FilasDeMas>
        )}
        {resto.length > 0 && <BotonVerMas abierto={verTodos} onCambiar={onVerTodos} texto={`Ver los ${resto.length} que faltan`} controla="proveedores-ranking-resto" />}
      </Tabla>
      {taller && (
        <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg bg-hueso px-5 py-3 text-sm text-tinta">
          <span>
            <b className="font-semibold">Producción propia</b> · {taller.nombre}: {taller.unidadesCompradas.toLocaleString("es-PE")} prendas, {Math.round(taller.pesoPct)} % del gasto
          </span>
          <span className="text-xs text-taupe">No entra al ranking: es lo que hace el Taller, no un proveedor.</span>
        </p>
      )}
    </div>
  );
}

function FilaDelRanking({
  f,
  p,
  indice,
  maxValor,
  medida,
  cambio,
  serie,
  busqueda,
  onAbrir,
  refFila,
}: {
  f: FilaRanking;
  p: Proveedor | undefined;
  indice: number;
  maxValor: number;
  medida: MedidaRanking;
  cambio: number;
  serie: number[] | null;
  busqueda: string;
  onAbrir: (id: string) => void;
  refFila: (el: HTMLElement | null) => void;
}) {
  const vendidoPct = f.vendidoPct ?? 0;
  const saldo = p?.saldo ?? 0;
  const vencido = p?.saldo_vencido ?? 0;
  const ritmo = RITMOS[f.clase];
  const Icono = ICONO_MEDIDA[medida];
  // En dinero, lo vendido va a su costo y lo que queda es la plata que sigue en tus tiendas; con la carga inicial como mayoría, aproximado.
  const enSoles = medida === "soles";
  const valor = enSoles ? `${esAproximado(f) ? "≈ " : ""}${solesRedondo(f.gasto)}` : f.unidadesCompradas.toLocaleString("es-PE");
  return (
    <div
      ref={refFila}
      data-proveedor-id={f.proveedorId}
      style={{ ["--i" as string]: 8 + Math.min(indice, 10) }}
      className={fila(
        PLANTILLA,
        "anim-entra group relative items-center gap-y-2 transition-colors duration-200 before:absolute before:inset-y-2.5 before:left-0 before:w-0.5 before:origin-center before:scale-y-0 before:rounded-full before:bg-rojo before:transition-transform before:duration-300 before:ease-cayla hover:bg-tinta/[0.03] hover:before:scale-y-100 sm:items-center",
      )}
    >
      <span className={celda("der", "text-sm text-taupe")}>{f.puesto}</span>
      <span className="min-w-0">
        <button
          type="button"
          onClick={() => onAbrir(f.proveedorId)}
          data-guia="proveedores.nombre"
          aria-label={`${f.nombre}: abrir vista rápida`}
          className="block min-w-0 max-w-full text-left outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-rojo/60"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-tinta">
              <Resaltado texto={f.nombre} busqueda={busqueda} />
            </span>
            {/* Cuántos puestos se movió al cambiar de medida: responde a esa acción y se queda hasta el próximo cambio. */}
            {cambio !== 0 && (
              <Chip versalitas={false} className="anim-revelar shrink-0" title={`${cambio > 0 ? "Subió" : "Bajó"} ${Math.abs(cambio)} ${Math.abs(cambio) === 1 ? "puesto" : "puestos"} al ordenar por ${enSoles ? "dinero" : "prendas"}`}>
                {cambio > 0 ? <ArrowUp aria-hidden className="h-3 w-3" /> : <ArrowDown aria-hidden className="h-3 w-3" />}
                {Math.abs(cambio)}
              </Chip>
            )}
          </span>
        </button>
        <span className="block truncate text-xs text-tinta/65">
          {saldo > 0 ? (
            <>
              <Link href={`/compras/por-pagar?prov=${f.proveedorId}`} data-guia="proveedores.saldo" className="btn-enlace relative">
                Le debes {soles(saldo)}
              </Link>
              {/* Lo vencido en rojo y en texto: es lo único de la fila que pide actuar hoy (el enlace de al lado lleva a pagarlo). */}
              {vencido > 0 && <span className="font-semibold text-rojo-profundo"> · {vencido >= saldo ? "todo vencido" : `${soles(vencido)} vencido`}</span>}
            </>
          ) : (
            [p?.rubros.join(", "), p?.contacto].filter(Boolean).join(" · ") || "Al día"
          )}
        </span>
      </span>
      <VentasDeLaSemana serie={serie} indice={indice} />
      <span className="hidden @2xl:block">
        <Anillo pct={vendidoPct} tamano="chico" indice={indice} etiqueta={`${f.nombre}: vendiste el ${Math.round(vendidoPct)} % de lo que le compraste`}>
          <span className="text-[10.5px] font-semibold tabular-nums">{Math.round(vendidoPct)}%</span>
        </Anillo>
      </span>
      <span className="col-span-2 col-start-2 row-start-2 flex min-w-0 items-center gap-2.5 @2xl:col-span-1 @2xl:col-start-auto @2xl:row-start-auto">
        <BarraApilada
          alto={8}
          total={maxValor}
          retraso={8 + Math.min(indice, 10)}
          className="min-w-0 flex-1"
          etiqueta={
            enSoles
              ? `${f.nombre}: ${valor} gastados; ${solesRedondo(f.costoVendido)} ya vendidos a su costo y ${solesRedondo(f.plataEnStock)} en tus tiendas`
              : `${f.nombre}: ${f.unidadesCompradas} prendas compradas, ${f.unidadesVendidas} vendidas y ${f.unidadesEnEstantes} en tus tiendas`
          }
          segmentos={
            enSoles
              ? [
                  { clave: "vendidas", nombre: "Vendido, a su costo", valor: f.costoVendido, clase: "bg-tinta" },
                  { clave: "estantes", nombre: "En tus tiendas", valor: f.plataEnStock, clase: "bg-tinta/25" },
                ]
              : [
                  { clave: "vendidas", nombre: "Vendidas", valor: f.unidadesVendidas, clase: "bg-tinta" },
                  { clave: "estantes", nombre: "En tus tiendas", valor: f.unidadesEnEstantes, clase: "bg-tinta/25" },
                ]
          }
        />
        <span className="flex shrink-0 items-center justify-end gap-1.5 text-sm font-semibold tabular-nums text-tinta">
          <Icono aria-hidden className="h-3.5 w-3.5 text-tinta/55" />
          {valor}
        </span>
      </span>
      <span className="col-start-3 row-start-1 justify-self-end overflow-visible @2xl:col-start-auto @2xl:row-start-auto @2xl:justify-self-start">
        <Chip tono={ritmo.tono} title={`${ritmo.ayuda}. ${f.veredicto.porque}`}>
          {textoRitmo(f)}
        </Chip>
      </span>
      <ChevronRight aria-hidden className="hidden h-4 w-4 shrink-0 -translate-x-1.5 text-tinta/45 opacity-0 transition-[opacity,transform] duration-300 ease-cayla group-hover:translate-x-0 group-hover:opacity-100 @2xl:block" />
    </div>
  );
}

// La línea de lo vendido por día (4 semanas) y lo de esta semana contra la anterior. Sin la lectura de la base, la celda queda vacía; con la
// lectura y sin ventas, lo dice. La línea es la pieza de una fila (`<Sparkline>`, ADR-0358).
function VentasDeLaSemana({ serie, indice }: { serie: number[] | null; indice: number }) {
  if (!serie) return <span className="hidden @2xl:block" />;
  const s = semanaDeVentas(serie);
  return (
    <span className="hidden min-w-0 flex-col gap-0.5 @2xl:flex" title={`${s.estaSemana} vendidas en los últimos 7 días; ${s.anterior} los 7 de antes`}>
      <Sparkline serie={serie} indice={indice} />
      <span className="flex items-center gap-1 text-xs text-tinta/70">
        <b className="font-semibold tabular-nums text-tinta">{s.estaSemana}</b> esta semana
        {s.tendencia === "sube" && <ArrowUp aria-label="sube" className="h-3 w-3" />}
        {s.tendencia === "baja" && <ArrowDown aria-label="baja" className="h-3 w-3" />}
      </span>
    </span>
  );
}
