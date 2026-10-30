"use client";

// La lista de Gastos como el extracto del banco («L1 · Por día», Felipe 2026-10-30): por día, del más nuevo al más viejo, con el total
// del día en su separador (que se queda arriba al bajar). Cada fila dice qué fue y, debajo, en qué, cómo se pagó y su comprobante; solo
// lo que no es normal lleva su marca. Las reglas viven en `lib/gastos-extracto-reglas.ts`; aquí solo se dibujan.
import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { Chip } from "@/components/ui/Chip";
import { MuestraTramo } from "@/components/ui/BarraApilada";
import { SeparadorDia } from "@/components/ui/TituloSeccion";
import { COLOR } from "@/components/finanzas/gastos/HilosGastos";
import { soles } from "@/lib/compras-reglas";
import { SEDE_EMPRESA, type SedeTelar } from "@/lib/finanzas-telar-reglas";
import { igvBajoElMonto, type GastoFila } from "@/lib/gastos-reglas";
import { detalleDelGasto, extractoPorDia, resumenDelDia, type MarcaGasto } from "@/lib/gastos-extracto-reglas";

/**
 * El separador del día se pega bajo la mesa de mando del telar, que también va pegada (bajo la cabecera del ERP) y cambia de alto al
 * partirse en dos renglones: se mide y se le pasa al separador (`--separador-tope`, de `.separador-dia`).
 */
function useTopeBajoLaMesa() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const mesa = document.querySelector<HTMLElement>(".mesa-telar");
    const lista = ref.current;
    if (!mesa || !lista) return;
    const medir = () => lista.style.setProperty("--separador-tope", `calc(3.75rem + env(safe-area-inset-top) + ${Math.round(mesa.getBoundingClientRect().height)}px)`);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(mesa);
    return () => obs.disconnect();
  }, []);
  return ref;
}

export function ExtractoGastos({
  gastos,
  hoy,
  verTodas,
  sedes,
  onAbrir,
}: {
  /** Ya filtrados: los filtros y la búsqueda los pone la tarjeta de arriba. */
  gastos: GastoFila[];
  hoy: string;
  /** Con varias sedes a la vista, cada fila dice de cuál es (su color y su nombre); con una sola, sobra. */
  verTodas: boolean;
  sedes: SedeTelar[];
  onAbrir: (g: GastoFila) => void;
}) {
  const dias = useMemo(() => extractoPorDia(gastos, hoy), [gastos, hoy]);
  const ref = useTopeBajoLaMesa();
  const sede = (g: GastoFila) => sedes.find((s) => s.clave === (g.ubicacionId ?? SEDE_EMPRESA));

  const fila = (g: GastoFila, marca: MarcaGasto | null) => {
    const s = sede(g);
    const igv = igvBajoElMonto(g);
    return (
      <button
        key={g.id}
        type="button"
        className="fila-cayla extracto-fila"
        data-anulado={g.estado === "anulado" || undefined}
        data-guia="fin-gastos.fila"
        onClick={() => onAbrir(g)}
      >
        <span className="extracto-que">
          <b>
            {g.descripcion}
            {g.proveedorNombre && <span className="extracto-proveedor"> · {g.proveedorNombre}</span>}
          </b>
          <small>
            {verTodas && s && <MuestraTramo color={COLOR[s.color]} className="extracto-punto-angosto" />}
            {detalleDelGasto(g)}
          </small>
        </span>
        {verTodas && (
          <span className="extracto-sede">
            {s && <MuestraTramo color={COLOR[s.color]} />}
            {s?.nombre ?? "Otra sede"}
          </span>
        )}
        <span className="extracto-marca">
          {marca && (
            <Chip tono={marca.tono} title={marca.porque} vivo={marca.tono === "rojo"}>
              {marca.texto}
              <span className="sr-only">. {marca.porque}</span>
            </Chip>
          )}
        </span>
        <span className="extracto-monto">
          <b>{soles(g.montoTotal)}</b>
          {igv && <small>{igv.igv}</small>}
          {igv?.perdido && <small className="text-ambar-profundo">{igv.perdido}</small>}
        </span>
      </button>
    );
  };

  return (
    <div ref={ref} className="extracto-gastos" data-con-sede={verTodas || undefined}>
      {dias.map((d, i) => {
        const r = resumenDelDia(d);
        return (
          <section key={d.fecha} className="extracto-dia" style={{ "--k-dia": i } as CSSProperties}>
            <SeparadorDia
              hoy={d.hoy}
              total={
                <>
                  {r.monto && <b>{r.monto}</b>}
                  {r.monto ? ` · ${r.cuenta}` : r.cuenta}
                </>
              }
            >
              {d.titulo}
            </SeparadorDia>
            <div className="extracto-filas">
              {d.filas.flatMap((f) => (f.tipo === "gasto" ? [fila(f.gasto, f.marca)] : f.gastos.map((g) => fila(g, null))))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
