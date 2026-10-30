"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Chip } from "@/components/ui/Chip";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { Sparkline } from "@/components/ui/Sparkline";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { desgloseDe, etiquetaCambio, resumenDelDesglose, type FilaHilo, type GastoDelDesglose } from "@/lib/gastos-hilos-reglas";
import { fechaCorta, solesRedondo, type GastoFila } from "@/lib/gastos-reglas";
import type { ClaveSede, ColorSede } from "@/lib/finanzas-telar-reglas";

// El color de cada hilo de sede, el mismo del orillo del telar. La empresa va rayada: no es una tienda, es lo que no es de ninguna.
const COLOR: Record<ColorSede, string> = {
  tru: "var(--color-sede-tru)",
  aqp: "var(--color-sede-aqp)",
  lim: "var(--color-sede-lim)",
  tal: "var(--color-sede-tal)",
  emp: "repeating-linear-gradient(45deg, var(--color-sede-emp) 0 3px, color-mix(in srgb, var(--color-sede-emp) 45%, transparent) 3px 6px)",
  otra: "var(--color-taupe)",
};

/** Cuántos gastos se ven al abrir una categoría; los demás, con «Ver N más». */
const A_LA_VISTA = 6;

const quieta = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * «En qué se va» en Gastos (Felipe 2026-10-30, maqueta `docs/maquetas/gastos-grafico-2026-10/`, reemplaza al retazo de ADR-0493): un
 * ranking que se lee de arriba abajo. Cada categoría es una fila con su hilo partido por sede (a la escala de la más grande), la rayita
 * de dónde estaba el mes anterior, cuánto subió o bajó y su línea de los últimos meses. Tocar la fila abre debajo su desglose: las sedes
 * en columna a la izquierda (la 3 que eligió Felipe) y, a la derecha, lo que se gastó exactamente, de mayor a menor. Tocar un color del
 * hilo la abre ya en esa sede. Al cambiar de sede las filas se reordenan deslizándose; una vez, sin rebote (ADR-0136, el gráfico del telar).
 */
export function HilosGastos({
  filas,
  gastos,
  nombreMesAnterior,
  onAbrirGasto,
  onVerEnLaTabla,
}: {
  filas: FilaHilo[];
  /** Los gastos del mes, para el desglose (los mismos de la lista de abajo). */
  gastos: readonly GastoFila[];
  /** «septiembre»: para la rayita y su leyenda. */
  nombreMesAnterior: string;
  /** Se tocó un gasto del desglose: abre su hoja, como en la lista. */
  onAbrirGasto: (id: string) => void;
  /** «Ver en la tabla»: la lista de abajo queda con esa categoría (y esa sede, si se eligió una). */
  onVerEnLaTabla: (categoria: string, sede: ClaveSede | null) => void;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  // La que se dibuja abierta, también mientras se cierra (sin ella, el desglose desaparecería antes de plegarse).
  const [dibujada, setDibujada] = useState<string | null>(null);
  const [sede, setSede] = useState<ClaveSede | null>(null);
  const [mas, setMas] = useState(false);

  // Tocar la fila abierta la cierra; un color del hilo la abre (o la cambia) a esa sede.
  const elegir = (categoria: string, s: ClaveSede | null) => {
    if (abierta === categoria && s === null) return setAbierta(null);
    if (abierta !== categoria) {
      setAbierta(categoria);
      setDibujada(categoria);
    }
    setSede(s);
    setMas(false);
  };

  const lista = useRef<HTMLOListElement>(null);
  const antes = useRef(new Map<string, number>());
  // Las filas que cambian de puesto se deslizan desde donde estaban (FLIP): se mide contra la lista, no contra la ventana, para que
  // bajar la página no cuente como un movimiento. Abrir un desglose no mueve a nadie de puesto: solo empuja, y eso no se anima aquí.
  useLayoutEffect(() => {
    const el = lista.current;
    if (!el) return;
    const ahora = new Map<string, number>();
    const filasDom = [...el.querySelectorAll<HTMLElement>(":scope > [data-categoria]")];
    const puestoAntes = new Map([...antes.current.keys()].map((k, i) => [k, i]));
    filasDom.forEach((f, i) => {
      const k = f.dataset.categoria!;
      ahora.set(k, f.offsetTop);
      const previo = antes.current.get(k);
      if (!quieta() && previo !== undefined && puestoAntes.get(k) !== i && Math.abs(previo - f.offsetTop) > 1) {
        f.animate([{ transform: `translateY(${previo - f.offsetTop}px)` }, { transform: "none" }], { duration: 650, easing: EASE });
      }
    });
    antes.current = ahora;
  });

  const max = Math.max(...filas.map((f) => Math.max(f.total, f.anterior ?? 0)), 0);
  const sedes = new Map(filas.flatMap((f) => f.tramos).map((t) => [t.clave, t]));
  const conAntes = filas.some((f) => (f.anterior ?? 0) > 0);

  return (
    <div className="hilos-gastos" data-guia="fin-gastos.hilos">
      <div className="hilos-leyenda" aria-hidden>
        {[...sedes.values()].map((s) => (
          <span key={s.clave}>
            <MuestraTramo color={COLOR[s.color]} />
            {s.nombre}
          </span>
        ))}
        {conAntes && (
          <span>
            <i className="hilo-antes-muestra" />
            dónde estaba en {nombreMesAnterior}
          </span>
        )}
      </div>
      <ol ref={lista} className="hilos-filas">
        {filas.map((f, i) => {
          const cambio = f.cambio ? etiquetaCambio(f.cambio) : null;
          const esta = abierta === f.categoria;
          // La sede elegida solo vale si esta categoría la tiene (al cambiar la sede de arriba puede quedar sin nada).
          const sedeDeEsta = esta && sede !== null && f.tramos.some((t) => t.clave === sede) ? sede : null;
          return (
            <li key={f.categoria} data-categoria={f.categoria} data-abierta={esta || undefined} className="hilo-fila" style={{ "--i": i } as CSSProperties}>
              {/* Toda la fila se toca; los botones de adentro (el nombre, cada color del hilo) hacen lo suyo y no la tocan dos veces. */}
              <div
                className="hilo-cabeza"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button, a")) return;
                  elegir(f.categoria, null);
                }}
              >
                <span className="hilo-rango">{i + 1}</span>
                <button type="button" className="hilo-nombre" aria-expanded={esta} aria-controls={`hilo-${f.categoria}`} onClick={() => elegir(f.categoria, null)}>
                  <b>{f.nombre}</b>
                  <small>{f.pct} % de lo gastado</small>
                </button>
                <span className="hilo-barra">
                  <BarraApilada
                    segmentos={f.tramos.map((t) => ({
                      clave: t.clave,
                      nombre: t.nombre,
                      valor: t.monto,
                      color: COLOR[t.color],
                      titulo: `${t.nombre}: ${solesRedondo(t.monto)}, el ${t.pct} % · tócalo para ver en qué se fue`,
                    }))}
                    total={max}
                    unidad="soles"
                    formato={solesRedondo}
                    retraso={i}
                    etiqueta={`${f.nombre}: ${f.tramos.map((t) => `${t.nombre} ${solesRedondo(t.monto)}`).join(", ")}`}
                    respuesta={{ onElegir: (clave) => elegir(f.categoria, clave), resaltada: sedeDeEsta, accion: "Ver lo que se gastó en esa sede" }}
                  />
                  {(f.anterior ?? 0) > 0 && (
                    <i aria-hidden className="hilo-antes" style={{ left: `${((f.anterior ?? 0) / max) * 100}%` }} title={`En ${nombreMesAnterior}: ${solesRedondo(f.anterior ?? 0)}`} />
                  )}
                </span>
                <span className="hilo-cambio">
                  {cambio && (
                    <Chip tono={cambio.tono} versalitas={false} title={f.anterior ? `En ${nombreMesAnterior}: ${solesRedondo(f.anterior)}` : `En ${nombreMesAnterior} no hubo gastos de esto`}>
                      {cambio.texto}
                    </Chip>
                  )}
                </span>
                <span className="hilo-monto">{solesRedondo(f.total)}</span>
                <span className="hilo-linea">{f.historia && <Sparkline serie={f.historia} indice={i} />}</span>
              </div>
              <div className="hilo-cajon" id={`hilo-${f.categoria}`} inert={!esta}>
                <div>
                  {dibujada === f.categoria && (
                    <Desglose
                      fila={f}
                      gastos={gastos}
                      sede={sedeDeEsta}
                      onSede={(s) => {
                        setSede(s);
                        setMas(false);
                      }}
                      mas={mas}
                      onMas={setMas}
                      onAbrirGasto={onAbrirGasto}
                      onVerEnLaTabla={onVerEnLaTabla}
                    />
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Lo de adentro de una categoría abierta: sus sedes en columna (si gastó más de una) y sus gastos, uno por uno. */
function Desglose({
  fila,
  gastos,
  sede,
  onSede,
  mas,
  onMas,
  onAbrirGasto,
  onVerEnLaTabla,
}: {
  fila: FilaHilo;
  gastos: readonly GastoFila[];
  sede: ClaveSede | null;
  onSede: (s: ClaveSede | null) => void;
  mas: boolean;
  onMas: (abierto: boolean) => void;
  onAbrirGasto: (id: string) => void;
  onVerEnLaTabla: (categoria: string, sede: ClaveSede | null) => void;
}) {
  const conColumna = fila.tramos.length > 1;
  const lista = desgloseDe(gastos, fila.categoria, sede);
  const mayor = lista[0]?.monto ?? 0;
  const resumen = resumenDelDesglose(fila, sede);
  const nombreDe = new Map(fila.tramos.map((t) => [t.clave, t]));
  const conSede = conColumna && sede === null;

  // La marca de la sede elegida se desliza hasta ella (sube o baja en la columna; de lado, cuando la columna es una fila en el celular).
  const columna = useRef<HTMLDivElement>(null);
  const marca = useRef<HTMLSpanElement>(null);
  const puesta = useRef(false);
  useLayoutEffect(() => {
    const col = columna.current;
    const m = marca.current;
    if (!col || !m) return;
    const colocar = (sinMover: boolean) => {
      const b = col.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (!b) return;
      if (sinMover) m.style.transition = "none";
      Object.assign(m.style, { left: `${b.offsetLeft}px`, top: `${b.offsetTop}px`, width: `${b.offsetWidth}px`, height: `${b.offsetHeight}px` });
      if (sinMover) {
        void m.offsetWidth;
        m.style.transition = "";
      }
      // De lado (celular), la elegida queda a la vista sin mover nada más: también al abrir o al cambiar el ancho, entonces sin deslizar.
      if (col.scrollWidth > col.clientWidth) col.scrollTo({ left: b.offsetLeft - (col.clientWidth - b.offsetWidth) / 2, behavior: sinMover || quieta() ? "auto" : "smooth" });
    };
    colocar(!puesta.current || quieta());
    puesta.current = true;
    const ro = new ResizeObserver(() => colocar(true));
    ro.observe(col);
    return () => ro.disconnect();
  }, [sede]);

  // Al cambiar de sede la lista cambia de alto: crece o se encoge desde el que tenía, no de golpe.
  const caja = useRef<HTMLDivElement>(null);
  const alto = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return;
    const nuevo = el.offsetHeight;
    if (alto.current !== null && Math.abs(alto.current - nuevo) > 1 && !quieta()) {
      el.animate([{ height: `${alto.current}px` }, { height: `${nuevo}px` }], { duration: 420, easing: EASE });
    }
    alto.current = nuevo;
  }, [sede]);

  const filaDeGasto = (g: GastoDelDesglose) => {
    const t = nombreDe.get(g.clave);
    return (
      <button key={g.id} type="button" className="fila-cayla hilo-gasto" onClick={() => onAbrirGasto(g.id)}>
        <span className="hilo-gasto-dia">{fechaCorta(g.fecha)}</span>
        <span className="hilo-gasto-que">
          <b>{g.descripcion}</b>
          {g.proveedorNombre && <small>{g.proveedorNombre}</small>}
        </span>
        {conSede && <span className="hilo-gasto-sede">{t && <MuestraTramo color={COLOR[t.color]} />}{t?.nombre ?? "Otra sede"}</span>}
        <span className="hilo-gasto-barra">
          <BarraAvance pct={mayor > 0 ? (g.monto / mayor) * 100 : 0} alto="fina" tono="tinta" decorativa />
        </span>
        <span className="hilo-gasto-monto">{solesRedondo(g.monto)}</span>
      </button>
    );
  };

  return (
    <div className="hilo-desglose" data-columna={conColumna || undefined}>
      {conColumna && (
        // La columna filtra la lista de al lado (no cambia de sección): sus sedes son botones que quedan presionados. Es la forma que eligió
        // Felipe mirando (la 3, 2026-10-30), aparte de la píldora de filtro del ERP: queda escrito en ADR-0493.
        <div ref={columna} className="hilo-sedes" role="group" aria-label={`Ver ${fila.nombre.toLowerCase()} por sede`}>
          <span ref={marca} className="hilo-sedes-marca" aria-hidden />
          <button type="button" aria-pressed={sede === null} className="hilo-sede" onClick={() => onSede(null)} style={{ "--i": 0 } as CSSProperties}>
            <span className="hilo-sede-nombre">Todas</span>
            <span className="hilo-sede-monto">{solesRedondo(fila.total)}</span>
            <BarraApilada segmentos={fila.tramos.map((t) => ({ clave: t.clave, nombre: t.nombre, valor: t.monto, color: COLOR[t.color] }))} alto={4} decorativa sinEntrada className="hilo-sede-barra" />
          </button>
          {fila.tramos.map((t, k) => (
            <button key={t.clave} type="button" aria-pressed={sede === t.clave} className="hilo-sede" onClick={() => onSede(t.clave)} style={{ "--i": k + 1 } as CSSProperties}>
              <span className="hilo-sede-nombre">
                <MuestraTramo color={COLOR[t.color]} />
                {t.nombre}
              </span>
              <span className="hilo-sede-monto">{solesRedondo(t.monto)}</span>
              <BarraApilada segmentos={[{ clave: t.clave, nombre: t.nombre, valor: t.monto, color: COLOR[t.color] }]} total={fila.total} alto={4} decorativa sinEntrada className="hilo-sede-barra" />
            </button>
          ))}
        </div>
      )}
      <div className="hilo-detalle" aria-live="polite">
        <p className="hilo-resumen">
          <b>{resumen.fuerte}</b>
          {resumen.resto}
        </p>
        <div ref={caja} className="hilo-caja">
          <div className="hilo-gastos" data-con-sede={conSede || undefined}>
            {lista.slice(0, A_LA_VISTA).map(filaDeGasto)}
          </div>
          {lista.length > A_LA_VISTA && (
            <FilasDeMas abierto={mas}>
              <div className="hilo-gastos" data-con-sede={conSede || undefined}>
                {lista.slice(A_LA_VISTA).map(filaDeGasto)}
              </div>
            </FilasDeMas>
          )}
        </div>
        <div className="hilo-pie">
          {lista.length > A_LA_VISTA ? <BotonVerMas abierto={mas} onCambiar={onMas} texto={`Ver ${lista.length - A_LA_VISTA} más`} forma="enlace" /> : <span />}
          <EnlaceVer onClick={() => onVerEnLaTabla(fila.categoria, sede)}>{lista.length === 1 ? "Ver este gasto en la tabla" : `Ver los ${lista.length} en la tabla`}</EnlaceVer>
        </div>
      </div>
    </div>
  );
}
