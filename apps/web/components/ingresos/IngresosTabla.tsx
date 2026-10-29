"use client";

import { Fragment, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SearchX } from "lucide-react";
import { Buscador } from "@/components/ui/Buscador";
import { BotonDescargar } from "@/components/ui/BotonDescargar";
import { BotonImprimir } from "@/components/ui/BotonImprimir";
import { Chip } from "@/components/ui/Chip";
import { HojaIngresos } from "./HojaIngresos";
import { MatrizIngreso } from "./MatrizIngreso";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { Encabezado, Tabla, celda, fila, type Columna } from "@/components/ui/Tabla";
import { Vacio } from "@/components/ui/Vacio";
import { descargarCsv } from "@/lib/exportar-csv";
import { ENCABEZADOS_DETALLE, encabezadosPorModelo, filasPorColorYTalla, filasPorModelo, nombreArchivoIngresos } from "@/lib/ingresos-exportar";
import type { Apariencia } from "@/lib/ingresos";
import {
  ORDEN_INICIAL_INGRESOS,
  buscarModelosIngresos,
  costoDelModelo,
  cuentaNovedad,
  esCampoOrdenIngresos,
  filtrarPorNovedad,
  modelosTexto,
  ordenarModelosIngresos,
  precioDelModelo,
  prendasTexto,
  siguienteOrdenIngresos,
  type FiltroNovedad,
  type ModeloIngresado,
  type OrdenIngresos,
} from "@/lib/ingresos-reglas";

// La lista de modelos de «Ingresos»: una línea por modelo con su foto, si es Nuevo o un Reingreso, cuántas prendas entraron, su
// precio en esta sede y —solo para quien ve el dinero— su costo. Vive en el cliente porque se busca, se filtra, se ordena y se abre
// sin volver al servidor: el rango ya trajo todo lo que se muestra (la búsqueda del navegador no abre el loader, ADR-0149).

export function IngresosTabla({
  modelos,
  apariencia,
  veCosto,
  rangoTexto,
  sede,
  desde,
  hasta,
}: {
  modelos: ModeloIngresado[];
  apariencia: Record<string, Apariencia>;
  veCosto: boolean;
  rangoTexto: string;
  /** Para el nombre del archivo que se baja. */
  sede: string;
  desde: string;
  hasta: string;
}) {
  const [filtro, setFiltro] = useState<FiltroNovedad>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<OrdenIngresos>(ORDEN_INICIAL_INGRESOS);
  // Los modelos abiertos (por si compras quiere comparar el detalle de dos): se abren y se cierran con un toque.
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set());
  function alternar(productoId: string) {
    setAbiertos((antes) => {
      const ahora = new Set(antes);
      if (!ahora.delete(productoId)) ahora.add(productoId);
      return ahora;
    });
  }
  // El filtro se ofrece según TODOS los modelos (no salta cuando una búsqueda deja solo de una clase); con una sola clase no filtra
  // nada, así que no se ofrece, y si estaba puesto se vuelve a «todos». Los números de sus píldoras siguen a la búsqueda.
  const hayDeLasDos = cuentaNovedad(modelos).hayDeLasDos;
  const activo: FiltroNovedad = hayDeLasDos ? filtro : "todos";
  const encontrados = buscarModelosIngresos(modelos, busqueda);
  const cuenta = cuentaNovedad(encontrados);
  const visibles = ordenarModelosIngresos(filtrarPorNovedad(encontrados, activo), orden);
  const prendas = visibles.reduce((suma, m) => suma + m.unidades, 0);
  // Con solo una búsqueda puesta, el botón del vacío la borra; con un filtro de por medio, quita todo lo puesto.
  const soloBusqueda = busqueda.trim() !== "" && activo === "todos";
  function limpiar() {
    setBusqueda("");
    setFiltro("todos");
  }
  // Imprimir: la hoja (con foto) se monta pegada a <body> SOLO mientras se imprime —en pantalla no existe—, se espera a que carguen
  // sus fotos y recién ahí se abre el cuadro de impresión. Al cerrarlo (imprimas o canceles) la hoja se quita.
  const [imprimiendo, setImprimiendo] = useState(false);
  const [preparando, setPreparando] = useState(false);
  const [impresoEn, setImpresoEn] = useState("");
  function imprimir() {
    setImpresoEn(new Intl.DateTimeFormat("es-PE", { dateStyle: "long", timeStyle: "short", timeZone: "America/Lima" }).format(new Date()));
    setPreparando(true);
    setImprimiendo(true);
  }
  useEffect(() => {
    if (!imprimiendo) return;
    let cancelado = false;
    const alTerminar = () => {
      setImprimiendo(false);
      setPreparando(false);
    };
    window.addEventListener("afterprint", alTerminar, { once: true });
    (async () => {
      // El portal se pinta en el siguiente cuadro; sus fotos tardan un poco más (con tope: una foto rota no frena la hoja).
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await esperarImagenes(document.getElementById("ingresos-print"), 4000);
      if (cancelado) return;
      setPreparando(false);
      window.print();
    })();
    return () => {
      cancelado = true;
      window.removeEventListener("afterprint", alTerminar);
    };
  }, [imprimiendo]);

  // Baja LO QUE SE VE (con la búsqueda, el filtro y el orden de la pantalla): armado acá, con lo que el rango ya trajo.
  function bajar(conDetalle: boolean) {
    const nombre = nombreArchivoIngresos({ sede, desde, hasta, detalle: conDetalle });
    if (conDetalle) descargarCsv(nombre, ENCABEZADOS_DETALLE, filasPorColorYTalla(visibles));
    else descargarCsv(nombre, encabezadosPorModelo(veCosto), filasPorModelo(visibles, veCosto));
  }

  // Una plantilla para el encabezado y las filas (Tabla). El costo solo existe para quien lo ve: su columna no se dibuja vacía.
  const plantilla = veCosto ? "sm:grid-cols-[minmax(0,1fr)_5.5rem_8rem_8rem]" : "sm:grid-cols-[minmax(0,1fr)_5.5rem_8rem]";
  const columnas: Columna[] = [
    { titulo: "Modelo", campo: "modelo" },
    { titulo: "Prendas", alinear: "der", campo: "prendas" },
    { titulo: "Precio", alinear: "der", campo: "precio", ayuda: "Lo que se cobra en esta sede por lo que entró" },
    ...(veCosto ? [{ titulo: "Costo", alinear: "der" as const, campo: "costo", ayuda: "Lo que costó. Solo lo ve quien tiene permiso de dinero." }] : []),
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p data-guia="movimientos.ingresos-total" className="text-sm text-taupe">
          <b className="font-semibold text-tinta">{prendasTexto(prendas)}</b> en {modelosTexto(visibles.length)}, {rangoTexto}.
        </p>
        {visibles.length > 0 && (
          <div data-guia="movimientos.ingresos-descargar" className="flex flex-wrap items-center gap-2">
            <BotonDescargar chico onClick={() => bajar(false)} title="Baja lo que estás viendo, con tu búsqueda y tu orden: una línea por modelo">
              Descargar Excel
            </BotonDescargar>
            <BotonDescargar chico onClick={() => bajar(true)} title="Lo mismo, con una línea por cada color y talla de cada modelo">
              Descargar Excel con tallas
            </BotonDescargar>
            <BotonImprimir chico onClick={imprimir} cargando={preparando} guia="movimientos.ingresos-imprimir" title="Imprime lo que estás viendo, con la foto de cada modelo. En el cuadro de impresión también puedes guardarlo como PDF">
              Imprimir la lista
            </BotonImprimir>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Buscador
          valor={busqueda}
          onCambio={setBusqueda}
          placeholder="Buscar un modelo"
          etiqueta="Buscar un modelo por su nombre, su código o su categoría"
          atajo
          guia="movimientos.ingresos-buscador"
          className="w-full sm:max-w-xs"
        />
        {hayDeLasDos && (
          <div role="group" aria-label="Nuevos o reingresos" data-guia="movimientos.ingresos-novedad" className="flex flex-wrap items-center gap-1.5">
            <Pastilla activa={activo === "todos"} onClick={() => setFiltro("todos")} cuenta={encontrados.length}>
              Todos
            </Pastilla>
            <Pastilla activa={activo === "nuevo"} onClick={() => setFiltro("nuevo")} cuenta={cuenta.nuevos}>
              Nuevos
            </Pastilla>
            <Pastilla activa={activo === "reingreso"} onClick={() => setFiltro("reingreso")} cuenta={cuenta.reingresos}>
              Reingresos
            </Pastilla>
          </div>
        )}
      </div>
      <Tabla guia="movimientos.ingresos-tabla">
        <Encabezado columnas={columnas} plantilla={plantilla} orden={orden} onOrden={(campo) => esCampoOrdenIngresos(campo) && setOrden((o) => siguienteOrdenIngresos(o, campo))} />
        {visibles.length === 0 && (
          <Vacio tamano="chico" icono={<SearchX />} accion={{ texto: soloBusqueda ? "Borrar la búsqueda" : "Quitar lo puesto", onClick: limpiar }}>
            {busqueda.trim() !== "" ? `Ningún modelo coincide con «${busqueda.trim()}».` : "Ningún modelo es de esa clase."}
          </Vacio>
        )}
        {visibles.map((m, i) => {
          const a = apariencia[m.productoId];
          const detalle = [m.codigo, m.categoria].filter(Boolean).join(" · ");
          const abierto = abiertos.has(m.productoId);
          return (
            <Fragment key={m.productoId}>
              {/* Toda la fila se toca con el mouse; el botón del nombre es lo que usan el teclado y el lector de pantalla (su Enter
                  sube hasta la fila). Abierta, la fila queda marcada con `aria-current`, como las demás del sistema. */}
              <div
                role="row"
                data-guia={i === 0 ? "movimientos.ingresos-fila" : undefined}
                aria-current={abierto ? "true" : undefined}
                onClick={() => alternar(m.productoId)}
                className={fila(plantilla, "cursor-pointer items-center")}
              >
                <div className={celda("izq", "flex items-center gap-3")}>
                  <MiniaturaPrenda tamano="lg" fotoUrl={a?.fotoUrl ?? null} prefijo={a?.prefijo} familia={a?.familia} categoria={a?.categoria} />
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <button
                        type="button"
                        aria-expanded={abierto}
                        aria-controls={`ingreso-${m.productoId}`}
                        data-guia={i === 0 ? "movimientos.ingresos-nombre" : undefined}
                        className="truncate text-left text-sm font-medium text-tinta"
                      >
                        {m.referencia}
                        <span className="sr-only">{abierto ? ". Ocultar colores y tallas" : ". Ver colores y tallas"}</span>
                      </button>
                      <span data-guia={i === 0 ? "movimientos.ingresos-etiqueta" : undefined} className="shrink-0">
                        <Chip tono={m.esNuevo ? "verde" : "pizarra"} versalitas={false} title={m.esNuevo ? "Es la primera vez que entra este modelo" : "Este modelo ya había entrado antes"}>
                          {m.esNuevo ? "Nuevo" : "Reingreso"}
                        </Chip>
                      </span>
                    </span>
                    {detalle && <span className="block truncate text-xs text-taupe">{detalle}</span>}
                  </span>
                </div>
                <span
                  className={celda("der", "text-sm font-semibold text-tinta")}
                  title={`${m.deStockInicial.toLocaleString("es-PE")} de stock inicial · ${m.deRecepcion.toLocaleString("es-PE")} de mercadería recibida`}
                >
                  {m.unidades.toLocaleString("es-PE")}
                </span>
                <span data-guia={i === 0 ? "movimientos.ingresos-precio" : undefined} className={celda("der", "text-sm text-tinta")}>
                  <Etiqueta>Precio </Etiqueta>
                  {precioDelModelo(m)}
                </span>
                {veCosto && (
                  <span className={celda("der", "text-sm text-tinta/75")}>
                    <Etiqueta>Costo </Etiqueta>
                    {costoDelModelo(m)}
                  </span>
                )}
              </div>
              {abierto && (
                <div id={`ingreso-${m.productoId}`} data-guia={i === 0 ? "movimientos.ingresos-detalle" : undefined} className="anim-revelar bg-hueso/60 px-5 py-3 sm:pl-[5.25rem]">
                  <MatrizIngreso variantes={m.variantes} />
                </div>
              )}
            </Fragment>
          );
        })}
        {visibles.length > 0 && (
          // El total de lo que se ve, como la fila de totales de Excel: sigue a la búsqueda y al filtro.
          <div role="row" data-guia="movimientos.ingresos-pie" className={`grid gap-x-4 gap-y-1 bg-hueso/60 px-5 py-2.5 text-sm font-semibold text-tinta ${plantilla}`}>
            <span className="min-w-0 truncate">Total · {modelosTexto(visibles.length)}</span>
            <span className="whitespace-nowrap tabular-nums sm:text-right">
              {prendas.toLocaleString("es-PE")}
              <span className="text-xs font-normal text-taupe sm:hidden"> {prendas === 1 ? "prenda" : "prendas"}</span>
            </span>
          </div>
        )}
      </Tabla>
      {imprimiendo &&
        createPortal(
          <HojaIngresos modelos={visibles} abiertos={abiertos} apariencia={apariencia} veCosto={veCosto} sede={sede} rangoTexto={rangoTexto} impresoEn={impresoEn} />,
          document.body,
        )}
    </>
  );
}

/** Espera a que carguen las fotos de la hoja (o a que pase `tope` ms): imprimir antes dejaba cuadros vacíos donde iba la foto. */
function esperarImagenes(raiz: HTMLElement | null, tope: number): Promise<void> {
  const pendientes = Array.from(raiz?.querySelectorAll("img") ?? []).filter((img) => !img.complete);
  if (pendientes.length === 0) return Promise.resolve();
  return new Promise((resolver) => {
    let faltan = pendientes.length;
    const uno = () => {
      faltan -= 1;
      if (faltan <= 0) resolver();
    };
    for (const img of pendientes) {
      img.addEventListener("load", uno, { once: true });
      img.addEventListener("error", uno, { once: true });
    }
    setTimeout(resolver, tope);
  });
}

/** En el celular el encabezado de la tabla se esconde y cada fila apila sus datos: cada cifra dice qué es. */
function Etiqueta({ children }: { children: string }) {
  return <span className="text-xs text-taupe sm:hidden">{children}</span>;
}

/** La píldora de filtro del sistema (ADR-0358) con cuántos modelos tiene. */
function Pastilla({ activa, onClick, cuenta, children }: { activa: boolean; onClick: () => void; cuenta: number; children: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activa} className="pildora-cayla shrink-0">
      {children}
      <span className="pildora-cayla__n">{cuenta.toLocaleString("es-PE")}</span>
    </button>
  );
}
