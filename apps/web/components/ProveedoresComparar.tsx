"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Banknote, Shirt, X } from "lucide-react";
import type { Proveedor } from "@/lib/proveedores";
import { soles } from "@/lib/compras-reglas";
import { solesRedondo } from "@/lib/gastos-reglas";
import { MAX_COMPARAR, RITMOS, esAproximado, semanaDeVentas, semanasCortas, valorDe, type FilaRanking, type MedidaRanking } from "@/lib/proveedores-ranking-reglas";
import { BarraApilada } from "@/components/ui/BarraApilada";
import { Chip } from "@/components/ui/Chip";
import { Sparkline } from "@/components/ui/Sparkline";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { CLASE_LADO } from "@/components/ProveedoresLoQueNoSeVe";

// Comparar hasta 3 proveedores (dirección «C», Felipe 2026-10-26): al marcar uno en el ranking, la columna derecha deja «Lo que no se ve a
// simple vista» y los pone lado a lado, cada dato en su fila para leerlo de un golpe y responder «¿a cuál de estos le vuelvo a comprar?».
// Quitar el último vuelve a la columna de siempre. Las cifras son las mismas de la fila del ranking: aquí solo se ponen juntas.

const ICONO_MEDIDA = { prendas: Shirt, soles: Banknote } as const;

export function ProveedoresComparar({
  filas,
  proveedores,
  medida,
  ventas,
  onQuitar,
  onQuitarTodos,
  onAbrir,
}: {
  /** Los marcados, en el orden en que se marcaron. */
  filas: readonly FilaRanking[];
  proveedores: ReadonlyMap<string, Proveedor>;
  medida: MedidaRanking;
  ventas: Record<string, number[]> | null;
  onQuitar: (id: string) => void;
  onQuitarTodos: () => void;
  onAbrir: (id: string) => void;
}) {
  const n = filas.length;
  const Icono = ICONO_MEDIDA[medida];
  const enSoles = medida === "soles";
  const maxValor = Math.max(1, ...filas.map((f) => valorDe(f, medida)));
  // El título de cada dato va arriba, a todo el ancho, y los proveedores debajo: así cada columna tiene todo el ancho de la caja (con 3, unos
  // 100 px) y un monto en soles cabe sin partirse.
  const columnas = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
  const cifra = `font-display font-normal leading-none tabular-nums ${n === 3 ? "text-[18px]" : "text-[21px]"}`;
  const fila = (titulo: ReactNode, celda: (f: FilaRanking) => ReactNode, i: number) => (
    <div className="anim-entra space-y-1.5 border-t border-sand py-2.5" style={{ ["--i" as string]: 2 + i }}>
      <span className="flex items-center gap-1 text-xs font-semibold text-taupe">{titulo}</span>
      <div className="grid items-start gap-3" style={columnas}>
        {filas.map((f) => (
          <span key={f.proveedorId} className="flex min-w-0 flex-col items-start gap-1 break-words text-[13.5px] text-tinta">
            {celda(f)}
          </span>
        ))}
      </div>
    </div>
  );

  // Más angosto que 1280 px la isla de abajo («2 marcados · Ver la comparación») flota sobre la pantalla: el margen deja ver la última fila.
  return (
    <aside id="proveedores-comparacion" aria-label="Comparar proveedores" className={`${CLASE_LADO} anim-entra scroll-mt-20 max-xl:mb-28`}>
      <TituloSeccion
        cuenta={n}
        accion={
          <button type="button" className="btn-cayla btn-sutil btn-chico" onClick={onQuitarTodos}>
            Quitar todos
          </button>
        }
      >
        Comparar
      </TituloSeccion>
      {n < 2 && <p className="text-sm text-tinta/70">Marca {n === 0 ? `hasta ${MAX_COMPARAR}` : "uno o dos más"} en el ranking para verlos lado a lado.</p>}

      {/* Cada dato en su fila, con un proveedor por columna (en el orden en que se marcaron). */}
      <div>
        <div className="grid items-start gap-3 pb-2.5" style={columnas}>
          {filas.map((f) => (
            <span key={f.proveedorId} className="flex min-w-0 items-start justify-between gap-1">
              <button type="button" className="font-display min-w-0 break-words text-left text-[15px] leading-tight text-tinta hover:text-rojo-profundo" onClick={() => onAbrir(f.proveedorId)} title="Abrir su vista rápida">
                {f.nombre}
              </button>
              <button
                type="button"
                aria-label={`Quitar ${f.nombre} de la comparación`}
                title="Quitar de la comparación"
                onClick={() => onQuitar(f.proveedorId)}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-hueso text-tinta transition-colors duration-200 hover:bg-sand"
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>

        {fila(
          <>
            <Icono aria-hidden className="h-3.5 w-3.5" /> Le compraste · {enSoles ? "dinero" : "prendas"}
          </>,
          (f) => (
            <>
              <b className={cifra}>{enSoles ? `${esAproximado(f) ? "≈ " : ""}${solesRedondo(f.gasto)}` : f.unidadesCompradas.toLocaleString("es-PE")}</b>
              <BarraApilada
                alto={4}
                total={maxValor}
                className="w-full"
                decorativa
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
            </>
          ),
          0,
        )}
        {fila("Vendiste", (f) => <b className={cifra}>{Math.round(f.vendidoPct ?? 0)} %</b>, 1)}
        {fila(
          "Lo que queda se vende en",
          (f) => {
            // Las semanas en grande y la palabra en su insignia, una debajo de la otra: juntas («100+ sem · Frena») no caben en una columna.
            const sem = semanasCortas(f.ritmo);
            return (
              <>
                {sem && <b className={cifra}>{sem}</b>}
                <Chip tono={RITMOS[f.clase].tono} title={`${RITMOS[f.clase].ayuda}. ${f.veredicto.porque}`}>
                  {RITMOS[f.clase].palabra}
                </Chip>
              </>
            );
          },
          2,
        )}
        {ventas &&
          fila(
            "Ventas, 4 semanas",
            (f) => {
              const serie = ventas[f.proveedorId];
              const s = serie ? semanaDeVentas(serie) : null;
              return (
                <>
                  {/* La línea de la fila, entera en tinta: aquí se lee, no se pasa el mouse. */}
                  {serie && <Sparkline serie={serie} className="[&_path]:text-tinta" />}
                  <span className="flex items-center gap-1 text-xs text-tinta/70">
                    <b className="font-semibold tabular-nums text-tinta">{s?.estaSemana ?? 0}</b> esta semana
                    {s?.tendencia === "sube" && <ArrowUp aria-label="sube" className="h-3 w-3" />}
                    {s?.tendencia === "baja" && <ArrowDown aria-label="baja" className="h-3 w-3" />}
                  </span>
                </>
              );
            },
            3,
          )}
        {fila(
          "Margen",
          (f) =>
            f.margenPct == null ? (
              <span className="text-xs text-tinta/70" title="La mayoría de lo que le compraste vino por la carga inicial: su costo todavía no es real">
                por confirmar
              </span>
            ) : (
              <b className={cifra}>{Math.round(f.margenPct)} %</b>
            ),
          4,
        )}
        {fila(
          "Le debes",
          (f) => {
            const p = proveedores.get(f.proveedorId);
            const saldo = p?.saldo ?? 0;
            const vencido = p?.saldo_vencido ?? 0;
            if (vencido > 0) return <b className="font-semibold tabular-nums text-rojo-profundo">{soles(vencido)} vencido</b>;
            return saldo > 0 ? <b className="font-semibold tabular-nums">{soles(saldo)}</b> : <span className="text-tinta/70">Nada</span>;
          },
          5,
        )}
      </div>
    </aside>
  );
}
