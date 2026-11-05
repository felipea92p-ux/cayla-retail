"use client";

// La lista de Gastos como el extracto del banco («L1 · Por día», Felipe 2026-10-30): por día, del más nuevo al más viejo, con el total
// del día en su separador (que se queda arriba al bajar). Cada fila dice qué fue y, debajo, en qué, cómo se pagó y su comprobante; solo
// lo que no es normal lleva su marca; lo chico que se repite el mismo día va en una fila «×N» que se abre en su lugar. Se ven los últimos
// días y el resto con «Ver los N días de antes». Las reglas viven en `lib/gastos-extracto-reglas.ts`; aquí solo se dibujan.
// Del benchmark visual (Felipe 2026-10-31): cada fila lleva a la izquierda el ícono de su categoría (06); la del gasto abierto en el cajón
// queda marcada y ↑ ↓ (o J y K) pasan de una fila a otra, llevando el cajón con ellas (01); y el gasto recién registrado se busca solo y
// respira en verde una vez (05).
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { ChevronRight } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Globito } from "@/components/ui/Globito";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { MuestraTramo } from "@/components/ui/BarraApilada";
import { SeparadorDia } from "@/components/ui/TituloSeccion";
import { COLOR } from "@/components/finanzas/gastos/HilosGastos";
import { IconoCategoriaGasto } from "@/components/finanzas/gastos/IconoCategoriaGasto";
import { pasoConFlecha } from "@/lib/vista-rapida-reglas";
import { esperaOcupada, suscribirEspera } from "@/lib/espera-estado";
import { soles } from "@/lib/compras-reglas";
import { SEDE_EMPRESA, type SedeTelar } from "@/lib/finanzas-telar-reglas";
import { igvBajoElMonto, type GastoFila } from "@/lib/gastos-reglas";
import type { FiltrosLista } from "@/lib/gastos-telar-reglas";
import {
  detalleDeRepetidos,
  detalleDelGasto,
  diasALaVista,
  dondeEstaEnElExtracto,
  extractoPorDia,
  ordenDelExtracto,
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
  abierto = null,
  recien = null,
  onRecienVisto,
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
  /** El gasto abierto en el cajón: su fila queda marcada (`aria-current`) y a la vista. */
  abierto?: string | null;
  /** El gasto recién registrado: la lista lo busca, lo deja a la vista y respira en verde una vez (`data-recien`). */
  recien?: string | null;
  /** Ya se mostró el recién registrado (la marca se suelta para que no vuelva a respirar). */
  onRecienVisto?: () => void;
}) {
  const dias = useMemo(() => extractoPorDia(gastos, hoy), [gastos, hoy]);
  // Dónde está el gasto que hay que mostrar (el abierto o el recién registrado): su día y, si va dentro de un «×N», ese grupo.
  const dondeEsta = dondeEstaEnElExtracto(dias, recien ?? abierto);
  // El recién registrado se muestra cuando ya está en la lista (llega con el refresco) y el loader se fue: si no, respiraría tapado.
  const ocupada = useSyncExternalStore(suscribirEspera, esperaOcupada, () => false);
  const recienALaVista = recien !== null && dondeEsta !== null && !ocupada ? recien : null;
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
        data-id={g.id}
        aria-current={g.id === abierto || undefined}
        data-recien={g.id === recienALaVista || undefined}
        data-dentro={dentro || undefined}
        data-anulado={g.estado === "anulado" || undefined}
        data-guia={dentro ? undefined : "fin-gastos.fila"}
        onClick={() => onAbrir(g)}
      >
        <span className="extracto-ico">
          <IconoCategoriaGasto codigo={g.categoria} />
        </span>
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
    const grupoAbierto = abiertos.has(f.clave) || dondeEsta?.grupo === f.clave;
    const id = `extracto-${f.clave.replace(/[^a-z0-9]+/gi, "-")}`;
    return (
      <div key={f.clave} className="extracto-repetidos" data-abierto={grupoAbierto || undefined}>
        <button type="button" className="fila-cayla extracto-fila" aria-expanded={grupoAbierto} aria-controls={id} onClick={() => alternar(f.clave)} data-guia="fin-gastos.repetidos">
          <span className="extracto-ico">
            <IconoCategoriaGasto codigo={g.categoria} />
          </span>
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
        <FilasDeMas abierto={grupoAbierto} id={id}>
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
  const antesAbiertos = verAntes || (dondeEsta !== null && dondeEsta.dia >= aLaVista);
  const escondido = useMemo(() => loQueEsconden(dias.slice(aLaVista)), [dias, aLaVista]);

  // El gasto que hay que mostrar (el abierto en el cajón o el recién registrado) puede estar dentro de un «×N» cerrado o en los días de
  // antes: lo que lo tapa se abre solo mientras se lo muestra, y el efecto lo trae a la vista. El recién registrado, al centro (respira una
  // vez); el abierto, apenas lo justo (`nearest`), porque se está pasando de uno a otro.
  const mostrar = recien ? recienALaVista : abierto;
  useEffect(() => {
    if (!mostrar) return;
    const cuadro = requestAnimationFrame(() => {
      const el = ref.current?.querySelector<HTMLElement>(`.extracto-fila[data-id="${mostrar}"]`);
      const quieta = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el?.scrollIntoView({ block: recien ? "center" : "nearest", behavior: quieta ? "auto" : "smooth" });
      // Se venía pasando de gasto con el teclado desde la lista: el foco sigue a la fila del abierto.
      if (!recien && ref.current?.contains(document.activeElement)) el?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(cuadro);
  }, [mostrar, recien, dias, ref]);
  // La marca de recién registrado se suelta después de respirar (1,4 s, `cayla-fila-recien`): si no, volvería a respirar al rehacerse la lista.
  useEffect(() => {
    if (!recienALaVista || !onRecienVisto) return;
    const t = setTimeout(onRecienVisto, 1800);
    return () => clearTimeout(t);
  }, [recienALaVista, onRecienVisto]);

  /**
   * ↑ ↓ (o J y K) desde una fila. Con el cajón abierto pasan de gasto en el mismo orden que sus flechas («3 de 12», entrando a los «×N»)
   * y la fila del nuevo se lleva el foco; sin cajón, el foco pasa a la fila de al lado. La regla de qué tecla cuenta es la de los cajones.
   */
  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    const destino = e.target as HTMLElement;
    const key = e.key === "j" ? "ArrowDown" : e.key === "k" ? "ArrowUp" : e.key;
    const paso = pasoConFlecha({ key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, defaultPrevented: e.defaultPrevented, nacioEnElCajon: e.currentTarget.contains(destino), destino });
    const actual = destino.closest<HTMLButtonElement>(".extracto-fila");
    if (paso === null || !actual) return;
    if (abierto) {
      const orden = ordenDelExtracto(dias);
      const otro = orden[orden.findIndex((g) => g.id === abierto) + paso];
      if (!otro) return;
      e.preventDefault();
      onAbrir(otro);
      return;
    }
    const filas = [...e.currentTarget.querySelectorAll<HTMLButtonElement>(".extracto-fila")].filter((f) => !f.closest("[inert]"));
    const siguiente = filas[filas.indexOf(actual) + paso];
    if (!siguiente) return;
    e.preventDefault();
    siguiente.focus({ preventScroll: true });
    siguiente.scrollIntoView({ block: "nearest" });
  };

  return (
    <div ref={ref} className="extracto-gastos" data-con-sede={verTodas || undefined} onKeyDown={alTeclear}>
      {dias.slice(0, aLaVista).map(dia)}
      {deAntes > 0 && (
        <>
          <FilasDeMas abierto={antesAbiertos} id="extracto-dias-de-antes">
            {dias.slice(aLaVista).map((d, i) => dia(d, aLaVista + i))}
          </FilasDeMas>
          {/* Lo que pide algo no se esconde: el botón dice qué hay detrás (una factura vencida es vieja por definición y casi siempre cae
              aquí; /formidable, 2026-10-30). */}
          <BotonVerMas
            abierto={antesAbiertos}
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
