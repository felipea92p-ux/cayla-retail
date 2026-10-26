"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Proveedor } from "@/lib/proveedores";
import { soles } from "@/lib/compras-reglas";
import { RITMOS, FILAS_A_LA_VISTA, textoRitmo, type FilaRanking } from "@/lib/proveedores-ranking-reglas";
import type { RendimientoProveedor } from "@/lib/proveedor-prendas-reglas";
import { Tabla, Encabezado, fila, celda, type Columna } from "@/components/ui/Tabla";
import { Anillo } from "@/components/ui/Anillo";
import { BarraApilada } from "@/components/ui/BarraApilada";
import { Chip } from "@/components/ui/Chip";
import { Resaltado } from "@/components/ui/Resaltado";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";

// El ranking de la pestaña Mercadería (dirección «C · Filas con su venta», elegida por Felipe el 2026-10-26; maqueta en
// docs/maquetas/proveedores-v5-2026-10/). Cada fila: el puesto, el proveedor (y lo que se le debe, si algo), cuánto de lo comprado ya se vendió
// (el anillo), cuánto le compraste contra el que más (la barra: lo oscuro, vendido; lo claro, lo que sigue en tus tiendas) y en cuántas semanas
// se vende lo que queda con lo que toca hacer (la insignia). Las cuentas viven en `lib/proveedores-ranking-reglas.ts`; aquí solo se dibujan.
//
// La fila entera abre la vista rápida que ya existía (decisión de Felipe, 2026-10-26): el botón del nombre se estira sobre la fila con `after:`
// y el enlace a Por pagar queda por encima (`relative`), igual que en el directorio.

// Columnas según el ANCHO DE LA TABLA (`@container`), como el directorio: angosta, puesto · proveedor · insignia y la barra debajo; desde 48 rem,
// todo en una línea.
const PLANTILLA =
  "grid-cols-[1.75rem_minmax(0,1fr)_auto] @3xl:grid-cols-[2rem_minmax(11rem,1.2fr)_2.75rem_minmax(10rem,1.3fr)_10.5rem_1rem]";
const COLUMNAS: Columna[] = [
  { titulo: "#", alinear: "der" },
  { titulo: "Proveedor" },
  { titulo: "Vendido" },
  { titulo: "Le compraste · prendas", subtitulo: "lo oscuro ya se vendió" },
  { titulo: "Lo que queda se vende en" },
  { titulo: "" },
];

export function ProveedoresRanking({
  filas,
  proveedores,
  maxCompradas,
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
  /** Las prendas compradas del primero: la barra de cada fila se mide contra él. */
  maxCompradas: number;
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
    <FilaDelRanking key={f.proveedorId} f={f} p={proveedores.get(f.proveedorId)} indice={i} maxCompradas={maxCompradas} busqueda={busqueda} onAbrir={onAbrir} refFila={refFila(f.proveedorId)} />
  );
  return (
    <div className="space-y-3" data-guia="proveedores.lista">
      <Tabla className="@container anim-entra overflow-y-hidden" style={{ ["--i" as string]: 7 }}>
        <Encabezado plantilla={PLANTILLA} columnas={COLUMNAS} visible="hidden @3xl:grid" />
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
  maxCompradas,
  busqueda,
  onAbrir,
  refFila,
}: {
  f: FilaRanking;
  p: Proveedor | undefined;
  indice: number;
  maxCompradas: number;
  busqueda: string;
  onAbrir: (id: string) => void;
  refFila: (el: HTMLElement | null) => void;
}) {
  const vendidoPct = f.vendidoPct ?? 0;
  const saldo = p?.saldo ?? 0;
  const vencido = p?.saldo_vencido ?? 0;
  const ritmo = RITMOS[f.clase];
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
          <span className="block truncate text-[15px] font-semibold text-tinta">
            <Resaltado texto={f.nombre} busqueda={busqueda} />
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
      <span className="hidden @3xl:block">
        <Anillo pct={vendidoPct} tamano="chico" indice={indice} etiqueta={`${f.nombre}: vendiste el ${Math.round(vendidoPct)} % de lo que le compraste`}>
          <span className="text-[10.5px] font-semibold tabular-nums">{Math.round(vendidoPct)}%</span>
        </Anillo>
      </span>
      <span className="col-span-2 col-start-2 row-start-2 flex min-w-0 items-center gap-2.5 @3xl:col-span-1 @3xl:col-start-auto @3xl:row-start-auto">
        <BarraApilada
          alto={8}
          total={maxCompradas}
          retraso={8 + Math.min(indice, 10)}
          className="min-w-0 flex-1"
          etiqueta={`${f.nombre}: ${f.unidadesCompradas} prendas compradas, ${f.unidadesVendidas} vendidas y ${f.unidadesEnEstantes} en tus tiendas`}
          segmentos={[
            { clave: "vendidas", nombre: "Vendidas", valor: f.unidadesVendidas, clase: "bg-tinta" },
            { clave: "estantes", nombre: "En tus tiendas", valor: f.unidadesEnEstantes, clase: "bg-tinta/25" },
          ]}
        />
        <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-tinta">{f.unidadesCompradas.toLocaleString("es-PE")}</span>
      </span>
      <span className="col-start-3 row-start-1 justify-self-end overflow-visible @3xl:col-start-auto @3xl:row-start-auto @3xl:justify-self-start">
        <Chip tono={ritmo.tono} title={`${ritmo.ayuda}. ${f.veredicto.porque}`}>
          {textoRitmo(f)}
        </Chip>
      </span>
      <ChevronRight aria-hidden className="hidden h-4 w-4 shrink-0 -translate-x-1.5 text-tinta/45 opacity-0 transition-[opacity,transform] duration-300 ease-cayla group-hover:translate-x-0 group-hover:opacity-100 @3xl:block" />
    </div>
  );
}
