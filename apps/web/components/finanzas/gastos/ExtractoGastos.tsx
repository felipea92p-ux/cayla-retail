"use client";

// La lista de Gastos como el extracto del banco («L1 · Por día», Felipe 2026-10-30): por día, del más nuevo al más viejo, con el total
// del día en su separador (que se queda arriba al bajar). Cada fila dice qué fue y, debajo, en qué, cómo se pagó y su comprobante; solo
// lo que no es normal lleva su marca; lo chico que se repite el mismo día va en una fila «×N» que se abre en su lugar. Se ven los últimos
// días y el resto con «Ver los N días de antes». Las reglas viven en `lib/gastos-extracto-reglas.ts`; aquí solo se dibujan.
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Globito } from "@/components/ui/Globito";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { MuestraTramo } from "@/components/ui/BarraApilada";
import { SeparadorDia } from "@/components/ui/TituloSeccion";
import { COLOR } from "@/components/finanzas/gastos/HilosGastos";
import { soles } from "@/lib/compras-reglas";
import { SEDE_EMPRESA, type SedeTelar } from "@/lib/finanzas-telar-reglas";
import { igvBajoElMonto, type GastoFila } from "@/lib/gastos-reglas";
import type { FiltrosLista } from "@/lib/gastos-telar-reglas";
import {
  detalleDeRepetidos,
  detalleDelGasto,
  diasALaVista,
  extractoPorDia,
  loQueEsconden,
  resumenDelDia,
  textoDiasDeAntes,
  type DiaDelExtracto,
  type FilaExtracto,
  type MarcaGasto,
} from "@/lib/gastos-extracto-reglas";

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
  filtros,
  verTodas,
  sedes,
  onAbrir,
}: {
  /** Ya filtrados: los filtros y la búsqueda los pone la tarjeta de arriba. */
  gastos: GastoFila[];
  hoy: string;
  /** Con cualquier filtro puesto se ven todos los días (lo buscado no se esconde tras «Ver los días de antes»). */
  filtros: FiltrosLista;
  /** Con varias sedes a la vista, cada fila dice de cuál es (su color y su nombre); con una sola, sobra. */
  verTodas: boolean;
  sedes: SedeTelar[];
  onAbrir: (g: GastoFila) => void;
}) {
  const dias = useMemo(() => extractoPorDia(gastos, hoy), [gastos, hoy]);
  const ref = useTopeBajoLaMesa();
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(() => new Set());
  const [verAntes, setVerAntes] = useState(false);
  const alternar = (clave: string) =>
    setAbiertos((a) => {
      const b = new Set(a);
      if (!b.delete(clave)) b.add(clave);
      return b;
    });
  const sede = (g: GastoFila) => sedes.find((s) => s.clave === (g.ubicacionId ?? SEDE_EMPRESA));

  const fila = (g: GastoFila, marca: MarcaGasto | null, dentro = false) => {
    const s = sede(g);
    const igv = igvBajoElMonto(g);
    return (
      <button
        key={g.id}
        type="button"
        className="fila-cayla extracto-fila"
        data-dentro={dentro || undefined}
        data-anulado={g.estado === "anulado" || undefined}
        data-guia={dentro ? undefined : "fin-gastos.fila"}
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

  /** Lo chico que se repitió el mismo día: una fila que dice cuántas veces y cuánto sumó, y se abre en su lugar con cada uno. */
  const repetidos = (f: Extract<FilaExtracto<GastoFila>, { tipo: "repetidos" }>) => {
    const g = f.gastos[0]!;
    const s = sede(g);
    const abierto = abiertos.has(f.clave);
    const id = `extracto-${f.clave.replace(/[^a-z0-9]+/gi, "-")}`;
    return (
      <div key={f.clave} className="extracto-repetidos" data-abierto={abierto || undefined}>
        <button type="button" className="fila-cayla extracto-fila" aria-expanded={abierto} aria-controls={id} onClick={() => alternar(f.clave)} data-guia="fin-gastos.repetidos">
          <span className="extracto-que">
            <b>
              {g.descripcion} <Globito n={f.gastos.length} etiqueta="veces" />
            </b>
            <small>
              {verTodas && s && <MuestraTramo color={COLOR[s.color]} className="extracto-punto-angosto" />}
              {detalleDeRepetidos(f.gastos)}
            </small>
          </span>
          {verTodas && (
            <span className="extracto-sede">
              {s && <MuestraTramo color={COLOR[s.color]} />}
              {s?.nombre ?? "Otra sede"}
            </span>
          )}
          <span className="extracto-marca" />
          <span className="extracto-monto">
            <b>{soles(f.total)}</b>
          </span>
          <ChevronRight aria-hidden className="extracto-flecha" />
        </button>
        <FilasDeMas abierto={abierto} id={id}>
          {f.gastos.map((x) => fila(x, null, true))}
        </FilasDeMas>
      </div>
    );
  };

  const dia = (d: DiaDelExtracto<GastoFila>, i: number) => {
    const r = resumenDelDia(d);
    return (
      <section key={d.fecha} className="extracto-dia" data-guia={i === 0 ? "fin-gastos.dia" : undefined}>
        <SeparadorDia
          hoy={d.hoy}
          total={
            <>
              {r.monto && <b>{r.monto}</b>}
              {r.monto ? ` · ${r.cuenta}` : r.cuenta}
            </>
          }
        >
          <span className="extracto-titulo-largo">{d.titulo}</span>
          <span className="extracto-titulo-corto">{d.tituloCorto}</span>
        </SeparadorDia>
        <div className="extracto-filas">{d.filas.map((f) => (f.tipo === "gasto" ? fila(f.gasto, f.marca) : repetidos(f)))}</div>
      </section>
    );
  };

  const aLaVista = diasALaVista(dias.length, filtros);
  const deAntes = dias.length - aLaVista;
  const escondido = useMemo(() => loQueEsconden(dias.slice(aLaVista)), [dias, aLaVista]);
  return (
    <div ref={ref} className="extracto-gastos" data-con-sede={verTodas || undefined}>
      {dias.slice(0, aLaVista).map(dia)}
      {deAntes > 0 && (
        <>
          <FilasDeMas abierto={verAntes} id="extracto-dias-de-antes">
            {dias.slice(aLaVista).map((d, i) => dia(d, aLaVista + i))}
          </FilasDeMas>
          {/* Lo que pide algo no se esconde: el botón dice qué hay detrás (una factura vencida es vieja por definición y casi siempre cae
              aquí; /formidable, 2026-10-30). */}
          <BotonVerMas
            abierto={verAntes}
            onCambiar={setVerAntes}
            texto={
              <>
                {textoDiasDeAntes(deAntes)}
                {escondido.map((c) => (
                  <Chip key={c.texto} tono={c.tono} vivo={c.tono === "rojo"}>
                    {c.texto}
                  </Chip>
                ))}
              </>
            }
            controla="extracto-dias-de-antes"
            data-guia="fin-gastos.dias-de-antes"
          />
        </>
      )}
    </div>
  );
}
