"use client";

import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CircleCheck, Download, FileText, Plus, Store, UserRound, Wallet } from "lucide-react";
import { BotonFiltros, DesplegablePildora, PanelPildoras, TODOS } from "@/components/ui/FiltrosPildora";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Modal } from "@/components/ui/Modal";
import { Interruptor } from "@/components/ui/campos";
import { DIAS_POR_DEFECTO, PERIODOS_RAPIDOS } from "@/lib/movimientos-reglas";
import { NOMBRE_METODO_HISTORIAL, type ComprobanteFiltro, type EstadoFiltro, type PeriodoHistorial } from "@/lib/ventas-historial-reglas";
import {
  ATAJOS,
  CLAVE_ATAJOS_ELEGIDOS,
  atajoActivo,
  atajosVisibles,
  cambiosDeAtajo,
  leerAtajosElegidos,
  type ClaveAtajo,
} from "@/lib/historial-acciones-reglas";

// Filtros de Ventas ▸ Historial (ADR-0147), con el mismo patrón que Catálogo y Compras: a la vista el período
// (los atajos de siempre: 7, 30 y 90 días, o fechas propias) y un botón «Filtros · N» que despliega el panel
// de píldoras —tienda, vendedor, pago, estado, comprobante—, con un chip por cada filtro aplicado que se quita
// con un toque. Viven en la URL (?rango=…&estado=…&comp=…&pago=…&sede=…): la página es un Server Component
// que filtra en Postgres, el enlace se puede compartir y «atrás» vuelve al filtro anterior. Cambiar un filtro
// borra el cursor de paginado. Los valores llegan ya resueltos por `filtrosDesdeParams`: uno inválido de la URL
// no queda «apretado» acá. Sin nada en la URL rigen los últimos 30 días y «30 días» aparece apretado: nadie se
// pregunta por qué no ve la venta de hace dos meses. Tienda y vendedor solo los recibe un líder.
//
// Atajos (ADR-0230): «Hoy» es un período más; «Mis ventas» y «Por enviar» vienen de fábrica y cada colaboradora suma los
// suyos en «+ Atajo» (se guardan en su navegador). Un atajo es solo un conjunto de parámetros de la URL: tocarlo es lo
// mismo que elegir esos filtros en el panel, así que el panel y el atajo nunca se contradicen.

const PASTILLA = "label-cayla inline-flex items-center rounded-full border px-3 py-1 text-[10px] transition-colors";
const PASTILLA_ACTIVA = "border-tinta bg-tinta text-crema";
const PASTILLA_INACTIVA = "border-tinta/20 text-tinta/75 hover:border-rojo hover:text-rojo";

function Pastilla({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activa} className={`${PASTILLA} ${activa ? PASTILLA_ACTIVA : PASTILLA_INACTIVA}`}>
      {children}
    </button>
  );
}

type Opcion = { id: string; nombre: string };
type Chip = { texto: string; quitar: Record<string, string> };

export function FiltrosHistorialVentas({
  tiendas,
  vendedores,
  periodo,
  desde,
  hasta,
  estado,
  comprobante,
  pago,
  sede,
  vendedor,
  incluirPrueba,
  puedeMias,
  porEnviar,
  sedePorDefecto = "",
  exportarHref,
}: {
  /** Solo para un líder: las tiendas entre las que puede elegir. Sin esta prop no hay selector. */
  tiendas?: Opcion[];
  /** Solo para un líder: quiénes registraron ventas. */
  vendedores?: Opcion[];
  /** «Mis ventas» necesita saber quién mira: una terminal (un aparato, ADR-0162) no tiene «mis» ventas. */
  puedeMias: boolean;
  periodo: PeriodoHistorial;
  /** Las fechas que rigen, para los campos de «Personalizado» (con un período rápido, el desde que aplicó la página). */
  desde: string;
  hasta: string;
  estado: EstadoFiltro;
  comprobante: ComprobanteFiltro;
  pago: string;
  sede: string;
  vendedor: string;
  /** D-54 (ADR-0159): con el toggle apagado (el default) las ventas `es_prueba` ni siquiera llegan de la base. */
  incluirPrueba: boolean;
  /** Cuántos comprobantes esperan a SUNAT (cualquier fecha): el número del atajo «Por enviar». 0 = sin número. */
  porEnviar: number;
  /** La tienda elegida arriba en la cabecera: la que el líder ve sin elegir nada. */
  sedePorDefecto?: string;
  /** Solo el líder: descarga lo filtrado (ADR-0230). */
  exportarHref?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Los filtros que dice el botón «Filtros · N» son los del panel; los de un atajo ya se ven apretados en su píldora.
  // Los atajos que eligió esta colaboradora viven en su navegador (en el servidor no existen: ahí son solo los de fábrica).
  const guardados = useSyncExternalStore(suscribirAtajos, leerAtajosGuardados, () => null);
  const misAtajos = useMemo(() => leerAtajosElegidos(guardados), [guardados]);
  const [eligiendo, setEligiendo] = useState(false);
  const actual = Object.fromEntries(params.entries());
  const visibles = atajosVisibles(misAtajos).filter((a) => puedeMias || a.clave !== "mias");
  const cubiertoPorAtajo = (k: string) => visibles.some((a) => atajoActivo(a, actual) && k in a.params);
  // La tienda cuenta como filtro solo si se eligió en la URL: la de la cabecera por defecto no es un filtro puesto.
  const sedeEnUrl = params.get("sede") ?? "";
  const activos = [
    sedeEnUrl,
    vendedor && !cubiertoPorAtajo("mias") ? vendedor : "",
    pago && !cubiertoPorAtajo("pago") ? pago : "",
    estado !== "todas" && !cubiertoPorAtajo("estado") ? estado : "",
    comprobante !== "todos" && !cubiertoPorAtajo("comp") ? comprobante : "",
  ].filter(Boolean).length;
  const [panelAbierto, setPanelAbierto] = useState(activos > 0);
  function guardarAtajos(lista: ClaveAtajo[]) {
    try {
      window.localStorage.setItem(CLAVE_ATAJOS_ELEGIDOS, JSON.stringify(lista));
    } catch {
      // Navegador sin almacenamiento (modo privado estricto): solo quedan los de fábrica.
    }
    window.dispatchEvent(new Event(EVENTO_ATAJOS));
  }

  // «Personalizado» se abre con un toque aunque todavía no haya fechas en la URL.
  const [personalizadoAbierto, setPersonalizadoAbierto] = useState(false);
  const mostrarFechas = periodo === "personalizado" || periodo === "todo" || personalizadoAbierto;

  function aplicar(cambios: Record<string, string>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete("cursor");
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const chips = (
    [
      sedeEnUrl && { texto: sedeEnUrl === "todas" ? "Todas las tiendas" : (tiendas?.find((t) => t.id === sedeEnUrl)?.nombre ?? "Tienda"), quitar: { sede: "" } },
      vendedor && !cubiertoPorAtajo("mias") && { texto: vendedores?.find((v) => v.id === vendedor)?.nombre ?? "Vendedor", quitar: { vendedor: "" } },
      pago && !cubiertoPorAtajo("pago") && { texto: NOMBRE_METODO_HISTORIAL[pago] ?? pago, quitar: { pago: "" } },
      estado !== "todas" && !cubiertoPorAtajo("estado") && { texto: estado === "anulada" ? "Anuladas" : "Completadas", quitar: { estado: "" } },
      comprobante !== "todos" && !cubiertoPorAtajo("comp") && { texto: TEXTO_COMPROBANTE[comprobante], quitar: { comp: "" } },
      incluirPrueba && { texto: "Con datos de prueba", quitar: { prueba: "" } },
    ] as (Chip | false | "")[]
  ).filter((c): c is Chip => !!c);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="-mx-4 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
        <div role="group" aria-label="Período" className="flex shrink-0 items-center gap-1.5">
          <Pastilla
            activa={!mostrarFechas && periodo === "hoy"}
            onClick={() => {
              setPersonalizadoAbierto(false);
              aplicar({ rango: "hoy", desde: "", hasta: "" });
            }}
          >
            Hoy
          </Pastilla>
          {PERIODOS_RAPIDOS.map((dias) => (
            <Pastilla
              key={dias}
              activa={!mostrarFechas && periodo === String(dias)}
              onClick={() => {
                setPersonalizadoAbierto(false);
                aplicar({ rango: dias === DIAS_POR_DEFECTO ? "" : String(dias), desde: "", hasta: "" });
              }}
            >
              {dias} días
            </Pastilla>
          ))}
          <Pastilla activa={mostrarFechas} onClick={() => setPersonalizadoAbierto(true)}>
            Personalizado
          </Pastilla>
        </div>
        <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-tinta/15" />
        <div role="group" aria-label="Atajos" className="flex shrink-0 items-center gap-1.5">
          {visibles.map((a) => {
            const activo = atajoActivo(a, actual);
            return (
              <Pastilla key={a.clave} activa={activo} onClick={() => aplicar(cambiosDeAtajo(a, activo))}>
                {a.etiqueta}
                {a.clave === "por_enviar" && porEnviar > 0 && (
                  <span className={`ml-1.5 rounded-full px-1.5 text-[9.5px] leading-4 tracking-normal ${activo ? "bg-crema text-tinta" : "bg-ambar text-crema"}`}>{porEnviar}</span>
                )}
              </Pastilla>
            );
          })}
          <button
            type="button"
            onClick={() => setEligiendo(true)}
            className={`${PASTILLA} gap-1 border-dashed border-tinta/30 text-tinta/65 hover:border-rojo hover:text-rojo`}
          >
            <Plus className="h-3 w-3" aria-hidden /> Atajo
          </button>
        </div>
        </div>
        {/* `BotonFiltros` trae su `mt-1.5` para alinearse con un campo con etiqueta; acá no hay etiqueta. */}
        <div className="-mt-1.5 flex shrink-0 items-center gap-2">
          {exportarHref && (
            // Una descarga, no una navegación: `<a download>` y no `Link` (no pasa por el loader de pantalla).
            // Exportar un Excel es trabajo de computadora: en el celular no ocupa el lugar de los períodos y atajos.
            <a href={exportarHref} download className="mt-1.5 hidden h-9 items-center gap-1.5 rounded-lg border border-tinta/20 px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo sm:inline-flex">
              <Download className="h-3.5 w-3.5" aria-hidden /> Exportar
            </a>
          )}
          <BotonFiltros abierto={panelAbierto} activos={activos} onClick={() => setPanelAbierto((v) => !v)} />
        </div>
      </div>

      {mostrarFechas && (
        <div className="anim-revelar flex flex-wrap items-end gap-x-4 gap-y-1 rounded-xl bg-sand/50 px-4 py-2.5">
          {/* Con un período rápido vigente, «Desde» muestra la fecha que rige aunque no esté en la URL: el
              control dice la verdad. Tocarlo la vuelve explícita. */}
          <div className="w-44">
            <CampoFecha etiqueta="Desde" valor={periodo === "todo" ? "" : desde} onValor={(v) => aplicar({ desde: v, rango: "" })} />
          </div>
          <div className="w-44">
            <CampoFecha etiqueta="Hasta" valor={periodo === "todo" ? "" : hasta} onValor={(v) => aplicar({ hasta: v, rango: "" })} />
          </div>
          <button
            type="button"
            onClick={() => aplicar({ rango: "todo", desde: "", hasta: "" })}
            aria-pressed={periodo === "todo"}
            className={`label-cayla pb-2 text-[11px] underline-offset-2 hover:text-rojo hover:underline ${periodo === "todo" ? "text-tinta" : "text-tinta/65"}`}
          >
            Todo el historial
          </button>
        </div>
      )}

      {panelAbierto && (
        <PanelPildoras>
          {tiendas && (
            <DesplegablePildora
              icono={Store}
              etiqueta="Tienda"
              valor={sede || "todas"}
              // Volver a la tienda de la cabecera deja la URL limpia; «Todas» se escribe a propósito.
              onValor={(v) => aplicar({ sede: v === sedePorDefecto ? "" : v })}
              opciones={[{ valor: "todas", texto: "Todas las tiendas" }, ...tiendas.map((t) => ({ valor: t.id, texto: t.nombre }))]}
            />
          )}

          {vendedores && vendedores.length > 0 && (
            <DesplegablePildora
              icono={UserRound}
              etiqueta="Vendedor"
              valor={vendedor || TODOS}
              onValor={(v) => aplicar({ vendedor: v === TODOS ? "" : v })}
              opciones={[{ valor: TODOS, texto: "Todos los vendedores" }, ...vendedores.map((v) => ({ valor: v.id, texto: v.nombre }))]}
            />
          )}

          <DesplegablePildora
            icono={Wallet}
            etiqueta="Pago"
            valor={pago || TODOS}
            onValor={(v) => aplicar({ pago: v === TODOS ? "" : v })}
            opciones={[
              { valor: TODOS, texto: "Todos los pagos" },
              ...Object.entries(NOMBRE_METODO_HISTORIAL).map(([valor, etiqueta]) => ({ valor, texto: valor === "anticipo" ? "Anticipo de apartado" : etiqueta })),
            ]}
          />

          <DesplegablePildora
            icono={CircleCheck}
            etiqueta="Estado"
            valor={estado === "todas" ? TODOS : estado}
            onValor={(v) => aplicar({ estado: v === TODOS ? "" : v })}
            opciones={[
              { valor: TODOS, texto: "Todas las ventas" },
              { valor: "completada", texto: "Completadas" },
              { valor: "anulada", texto: "Anuladas" },
            ]}
          />

          <DesplegablePildora
            icono={FileText}
            etiqueta="Comprobante"
            valor={comprobante === "todos" ? TODOS : comprobante}
            onValor={(v) => aplicar({ comp: v === TODOS ? "" : v })}
            opciones={[
              { valor: TODOS, texto: "Con o sin comprobante" },
              { valor: "con", texto: TEXTO_COMPROBANTE.con },
              { valor: "sin", texto: TEXTO_COMPROBANTE.sin },
              { valor: "factura", texto: TEXTO_COMPROBANTE.factura },
              { valor: "por_enviar", texto: TEXTO_COMPROBANTE.por_enviar },
            ]}
          />

          {/* D-54 (ADR-0159): apagado por defecto — las ventas de prueba (archivadas, nunca borradas) ni siquiera se piden
              a la base. Vive en el panel y no a la vista: no es un filtro del día a día, es una excepción puntual. */}
          <div className="shrink-0 px-3">
            <Pastilla activa={incluirPrueba} onClick={() => aplicar({ prueba: incluirPrueba ? "" : "1" })}>
              Con datos de prueba
            </Pastilla>
          </div>
        </PanelPildoras>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button
              key={Object.keys(c.quitar).join("|")}
              type="button"
              onClick={() => aplicar(c.quitar)}
              aria-label={`Quitar filtro ${c.texto}`}
              className="label-cayla inline-flex items-center gap-1.5 rounded-full border border-tinta/15 bg-tinta/[0.04] px-2.5 py-1 text-[10px] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo"
            >
              {c.texto}
              <span aria-hidden className="text-sm leading-none">
                ×
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setPersonalizadoAbierto(false);
              router.push(pathname);
            }}
            className="label-cayla px-1 text-[10px] text-tinta/55 hover:text-rojo"
          >
            Limpiar todo
          </button>
        </div>
      )}

      {eligiendo && (
        <Modal titulo="Tus atajos" subtitulo="Los de fábrica siempre están. Los que marques quedan guardados en este equipo." onClose={() => setEligiendo(false)} ancho="max-w-sm" variante="hoja">
          <ul className="divide-y divide-dashed divide-tinta/10">
            {ATAJOS.filter((a) => puedeMias || a.clave !== "mias").map((a) => (
              <li key={a.clave} className="py-1.5">
                <Interruptor
                  activo={a.deFabrica || misAtajos.includes(a.clave)}
                  disabled={a.deFabrica}
                  etiqueta={a.etiqueta}
                  pie={a.deFabrica ? "De fábrica" : undefined}
                  onActivo={(v) => guardarAtajos(v ? [...misAtajos, a.clave] : misAtajos.filter((c) => c !== a.clave))}
                />
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}

// El almacén de los atajos elegidos: `localStorage` más un evento propio (el `storage` del navegador solo avisa a OTRAS
// pestañas). Lo que se lee es el texto guardado, que no cambia de identidad entre lecturas: sin bucles de render.
const EVENTO_ATAJOS = "cayla:atajos-historial";
function suscribirAtajos(avisar: () => void) {
  window.addEventListener(EVENTO_ATAJOS, avisar);
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO_ATAJOS, avisar);
    window.removeEventListener("storage", avisar);
  };
}
function leerAtajosGuardados(): string | null {
  try {
    return window.localStorage.getItem(CLAVE_ATAJOS_ELEGIDOS);
  } catch {
    return null;
  }
}

const TEXTO_COMPROBANTE: Record<ComprobanteFiltro, string> = {
  todos: "Con o sin comprobante",
  con: "Con boleta o factura",
  sin: "Sin comprobante",
  factura: "Solo facturas",
  por_enviar: "Por enviar a SUNAT",
};
