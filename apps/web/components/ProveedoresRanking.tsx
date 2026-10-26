"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, Banknote, ChevronRight, Shirt } from "lucide-react";
import type { Proveedor } from "@/lib/proveedores";
import { soles } from "@/lib/compras-reglas";
import { solesRedondo } from "@/lib/gastos-reglas";
import { RITMOS, DIAS_DE_VENTAS, FILAS_A_LA_VISTA, MAX_COMPARAR, cambioDePuesto, semanasCortas, esAproximado, semanaDeVentas, textoRitmo, type FilaRanking, type MedidaRanking } from "@/lib/proveedores-ranking-reglas";
import type { RendimientoProveedor } from "@/lib/proveedor-prendas-reglas";
import { Tabla, Encabezado, fila, celda, type Columna } from "@/components/ui/Tabla";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { Anillo } from "@/components/ui/Anillo";
import { BarraApilada } from "@/components/ui/BarraApilada";
import { Casilla } from "@/components/ui/Casilla";
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

// Columnas según el ANCHO DE LA TABLA (`@container`), como el directorio: angosta, casilla · puesto · proveedor y, debajo, la barra y la insignia;
// desde 42 rem, todo en una línea (con la columna derecha al lado, la lista mide ~44 rem en una pantalla de 1440). La casilla marca al
// proveedor para compararlo a la derecha (hasta 3).
// Con la casilla son 8 columnas: en lo ancho van más juntas (12 px) y sus mínimos suman justo los 42 rem desde los que se ponen en fila, así
// ningún ancho las desborda (a 1024 la tabla mide ~43 rem; a 1440, con la columna derecha, ~45).
const PLANTILLA =
  "grid-cols-[1.25rem_1.5rem_minmax(0,1fr)_auto] @2xl:grid-cols-[1.25rem_1.5rem_minmax(8rem,1.6fr)_5.75rem_2.75rem_minmax(5.5rem,1fr)_8.5rem_1rem] @2xl:gap-x-3";
const columnas = (medida: MedidaRanking): Columna[] => [
  { titulo: "", ayuda: "Marca hasta 3 para compararlos a la derecha" },
  { titulo: "#", alinear: "der" },
  { titulo: "Proveedor" },
  { titulo: "Ventas", subtitulo: "por día, 4 semanas" },
  { titulo: "Vendido" },
  { titulo: medida === "soles" ? "Te llegó · a su costo" : "Te llegó · prendas", subtitulo: "lo oscuro ya se vendió" },
  { titulo: "Lo que queda se vende en" },
  { titulo: "" },
];

// Un proveedor sin ventas en las 4 semanas no viene en la lectura: su serie es todo cero (la fila dice «0 esta semana»).
const SIN_VENTAS: number[] = Array.from({ length: DIAS_DE_VENTAS }, () => 0);

// Las dos medidas, cada una con su ícono (Felipe 2026-10-26): el polo para las prendas, el billete para el dinero. El mismo ícono va junto a cada
// cifra del ranking para que nunca se confunda una medida con la otra.
const ICONO_MEDIDA = { prendas: Shirt, soles: Banknote } as const;

/**
 * Las dos medidas, en una sola línea (Felipe 2026-10-26: las dos tarjetas grandes tapaban la lista): «Ordenar por» y un segmento con el ícono,
 * el nombre y el total de cada una, y al lado lo que esa cifra quiere decir. Ordenan el ranking. Se llaman por lo que cuentan (Formidable
 * 2026-10-26): lo que te LLEGÓ, al costo de la prenda y sin IGV. «Dinero gastado» se leía como la plata que salió, y se confundía con lo
 * facturado (con IGV, haya llegado o no) y con lo que se debe.
 */
export function MedidaDelRanking({ medida, onMedida, prendas, gasto, cargaPct, proveedores }: { medida: MedidaRanking; onMedida: (m: MedidaRanking) => void; prendas: number; gasto: number; cargaPct: number; proveedores: number }) {
  const aproximado = cargaPct >= 50;
  const opciones = [
    { m: "prendas" as const, texto: "Prendas", valor: prendas.toLocaleString("es-PE"), nota: `te llegaron de ${proveedores} ${proveedores === 1 ? "proveedor" : "proveedores"}` },
    { m: "soles" as const, texto: "Costo", valor: `${aproximado ? "≈ " : ""}${solesRedondo(gasto)}`, nota: aproximado ? `lo que te llegó, sin IGV · aproximado: el ${Math.round(cargaPct)} % vino por la carga inicial` : "lo que te llegó, sin IGV, al costo de cada compra" },
  ];
  const elegida = opciones.find((o) => o.m === medida) ?? opciones[0]!;
  return (
    <div data-guia="proveedores.medida" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="label-cayla text-[11px] text-tinta/65">Ordenar por</span>
      <SegmentoDeslizante
        forma="modo"
        etiqueta="Ordenar el ranking por"
        valor={medida}
        onCambio={(c) => onMedida(c as MedidaRanking)}
        opciones={opciones.map((o) => {
          const Icono = ICONO_MEDIDA[o.m];
          return {
            clave: o.m,
            icono: <Icono aria-hidden className="h-4 w-4" />,
            etiqueta: (
              <span className="whitespace-nowrap">
                {o.texto} <b className="font-semibold tabular-nums">{o.valor}</b>
              </span>
            ),
            ayuda: `${o.valor} · ${o.nota}`,
          };
        })}
      />
      <span className="min-w-0 text-xs text-tinta/65">{elegida.nota}</span>
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
  comparar,
  onComparar,
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
  /** Los proveedores marcados para comparar, en el orden en que se marcaron. */
  comparar: readonly string[];
  onComparar: (id: string) => void;
  refFila: (id: string) => (el: HTMLElement | null) => void;
  taller: (RendimientoProveedor & { pesoPct: number }) | null;
}) {
  const vista = filas.slice(0, FILAS_A_LA_VISTA);
  const resto = filas.slice(FILAS_A_LA_VISTA);
  const filaDe = (f: FilaRanking, i: number) => (
    <FilaDelRanking key={f.proveedorId} f={f} p={proveedores.get(f.proveedorId)} indice={i} maxValor={maxValor} medida={medida} cambio={cambioDePuesto(antes, f)} serie={ventas ? (ventas[f.proveedorId] ?? SIN_VENTAS) : null} busqueda={busqueda} onAbrir={onAbrir} comparado={comparar.includes(f.proveedorId)} onComparar={onComparar} refFila={refFila(f.proveedorId)} />
  );
  return (
    <div className="space-y-3" data-guia="proveedores.lista">
      {/* Lo que el orden quiere decir y que las filas se marcan, a la vista (Formidable 2026-10-26): el «#1» se leía como «el mejor» y nada
          avisaba que marcar cambia la columna de la derecha. */}
      <p className="text-sm text-tinta/70">
        Del que más te llegó al que menos{medida === "soles" ? ", a su costo" : ""}. Toca uno para ver su detalle; marca hasta {MAX_COMPARAR} para compararlos.
      </p>
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
  comparado,
  onComparar,
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
  comparado: boolean;
  onComparar: (id: string) => void;
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
      data-comparado={comparado || undefined}
      style={{ ["--i" as string]: 8 + Math.min(indice, 10) }}
      className={fila(
        PLANTILLA,
        "anim-entra group relative items-center gap-y-2 transition-colors duration-200 data-[comparado]:bg-tinta/[0.05] before:absolute before:inset-y-2.5 before:left-0 before:w-0.5 before:origin-center before:scale-y-0 before:rounded-full before:bg-rojo before:transition-transform before:duration-300 before:ease-cayla hover:bg-tinta/[0.03] hover:before:scale-y-100 sm:items-center",
      )}
    >
      {/* Por encima del botón del nombre, que se estira sobre la fila: marcar no abre la vista rápida. La etiqueta lleva la casilla de 20 px
          a un blanco de 32 (Formidable 2026-10-26: errarle por 3 px abría la vista rápida). */}
      <label className="relative z-[1] -m-1.5 flex cursor-pointer p-1.5" data-guia="proveedores.comparar">
        <Casilla marcada={comparado} onCambio={() => onComparar(f.proveedorId)} etiqueta={`Comparar ${f.nombre}`} />
      </label>
      <span className={celda("der", "text-sm text-taupe")}>{f.puesto}</span>
      <span className="col-span-2 min-w-0 @2xl:col-span-1">
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
      <span className="col-start-3 row-start-2 flex min-w-0 items-center gap-2.5 @2xl:col-start-auto @2xl:row-start-auto">
        <BarraApilada
          alto={8}
          total={maxValor}
          retraso={8 + Math.min(indice, 10)}
          className="min-w-0 flex-1"
          etiqueta={
            enSoles
              ? `${f.nombre}: te llegó ${valor} a su costo; ${solesRedondo(f.costoVendido)} ya vendidos y ${solesRedondo(f.plataEnStock)} en tus tiendas`
              : `${f.nombre}: te llegaron ${f.unidadesCompradas} prendas, ${f.unidadesVendidas} vendidas y ${f.unidadesEnEstantes} en tus tiendas`
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
      <span className="col-start-4 row-start-2 justify-self-end overflow-visible @2xl:col-start-auto @2xl:row-start-auto @2xl:justify-self-start">
        {/* Las semanas arriba y la insignia con lo que toca hacer debajo («Frena compras» no cabía junto a «100+ sem»); en una tabla angosta
            (el teléfono), solo la insignia. Su porqué, a un toque: la fila abre la vista rápida, que lo explica con los números. */}
        <span className="flex flex-col items-end gap-0.5 @2xl:items-start">
          {semanasCortas(f.ritmo) && <span className="hidden text-xs tabular-nums text-tinta/70 @md:block">{semanasCortas(f.ritmo)}</span>}
          <Chip tono={ritmo.tono} title={`${textoRitmo(f)}. ${ritmo.ayuda}`}>
            {ritmo.palabra}
          </Chip>
        </span>
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
