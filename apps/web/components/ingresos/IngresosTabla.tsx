"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Buscador } from "@/components/ui/Buscador";
import { BotonDescargar } from "@/components/ui/BotonDescargar";
import { BotonImprimir } from "@/components/ui/BotonImprimir";
import { Chip } from "@/components/ui/Chip";
import { HojaIngresos } from "./HojaIngresos";
import { MenuAcciones } from "@/components/ui/MenuAcciones";
import { DetalleIngreso } from "./DetalleIngreso";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { TablaViva, useTablaViva, type ColumnaViva, type FiltroDeAfuera } from "@/components/ui/TablaViva";
import { descargarCsv } from "@/lib/exportar-csv";
import { ENCABEZADOS_DETALLE, encabezadosPorModelo, filasPorColorYTalla, filasPorModelo, nombreArchivoIngresos } from "@/lib/ingresos-exportar";
import type { Apariencia } from "@/lib/ingresos";
import {
  ORDEN_INICIAL_INGRESOS,
  buscarModelosIngresos,
  conPreposicion,
  costoDelModelo,
  cuentaNovedad,
  esCampoOrdenIngresos,
  ordenarModelosIngresos,
  precioDelModelo,
  prendasTexto,
  type ModeloIngresado,
} from "@/lib/ingresos-reglas";
import { fechaRelativa, ordenarFilas, sumaDe, unirConO, type OrdenViva } from "@/lib/tabla-viva-reglas";

// La lista de modelos de «Ingresos»: una línea por modelo con su foto, si es Nuevo o un Reingreso, su categoría, cuándo entró, cuántas
// prendas entraron, su precio en esta sede y —solo para quien ve el dinero— su costo. Vive en el cliente porque se busca, se filtra, se
// ordena y se abre sin volver al servidor: el rango ya trajo todo lo que se muestra (la búsqueda del navegador no abre el loader,
// ADR-0149). Por eso es la primera pantalla con la tabla con superpoderes (`TablaViva`, ADR-0596): filtrar «Nuevo o Reingreso» y la
// categoría desde su cabecera, la frase de lo que ves, la cabecera que acompaña al bajar y el total de lo que ves al pie.

/** El alto de un botón de fila: 32 px con el mouse y 44 con el dedo (el patrón de `parecidas-boton` y `compra-celular`), para que quede a la altura de
 *  las píldoras. Una utilidad le gana a `.btn-chico`, que mide 44 siempre. */
const ALTO_COMPACTO = "min-h-8 [@media(pointer:coarse)]:min-h-11";
const MODELO = { uno: "modelo", varios: "modelos", genero: "m" } as const;
const NUEVO = "Nuevo";
const REINGRESO = "Reingreso";

/** El orden de la pantalla: nombre, prendas, precio y costo con sus desempates de siempre (lo sin costo al final, el empate por nombre);
 *  las columnas nuevas (clase, categoría, cuándo entró), con el orden de la tabla. */
function ordenarIngresos(columnas: readonly ColumnaViva<ModeloIngresado>[]) {
  return (filas: readonly ModeloIngresado[], orden: OrdenViva): ModeloIngresado[] =>
    esCampoOrdenIngresos(orden.clave)
      ? ordenarModelosIngresos(filas, { campo: orden.clave, dir: orden.dir })
      : ordenarFilas(filas, columnas.find((c) => c.clave === orden.clave), orden.dir);
}

function ChipClase({ nuevo }: { nuevo: boolean }) {
  return (
    <Chip tono={nuevo ? "verde" : "pizarra"} versalitas={false} title={nuevo ? "Es la primera vez que entra este modelo" : "Este modelo ya había entrado antes"}>
      {nuevo ? NUEVO : REINGRESO}
    </Chip>
  );
}

export function IngresosTabla({
  modelos,
  apariencia,
  veCosto,
  rangoTexto,
  sede,
  desde,
  hasta,
  hoy,
}: {
  modelos: ModeloIngresado[];
  apariencia: Record<string, Apariencia>;
  veCosto: boolean;
  rangoTexto: string;
  /** Para el nombre del archivo que se baja. */
  sede: string;
  desde: string;
  hasta: string;
  /** El día de Lima: con él, «cuándo entró» dice «hace 3 días». */
  hoy: string;
}) {
  const [busqueda, setBusqueda] = useState("");
  // Los modelos abiertos (por si compras quiere comparar el detalle de dos): se abren y se cierran con un toque.
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set());
  function alternar(productoId: string) {
    setAbiertos((antes) => {
      const ahora = new Set(antes);
      if (!ahora.delete(productoId)) ahora.add(productoId);
      return ahora;
    });
  }
  // «Nuevo o Reingreso» se filtra según TODOS los modelos (no salta cuando una búsqueda deja solo de una clase); con una sola clase no
  // filtra nada, así que su cabecera solo ordena (y si estaba puesto, deja de filtrar: lo hace `useTablaViva`).
  const hayDeLasDos = cuentaNovedad(modelos).hayDeLasDos;
  const encontrados = useMemo(() => buscarModelosIngresos(modelos, busqueda), [modelos, busqueda]);

  // Las columnas: la plantilla se declara una vez y la usan la cabecera, las filas y el pie. El costo solo existe para quien lo ve: su
  // columna no se dibuja vacía.
  const columnas = useMemo<ColumnaViva<ModeloIngresado>[]>(
    () => [
      {
        clave: "modelo",
        titulo: "Modelo",
        tipo: "texto",
        valor: (m) => m.referencia,
        principal: true,
        alinear: "izquierda",
        ancho: "minmax(0,2.6fr)",
        // Toda la fila se toca con el mouse; el botón del nombre es lo que usan el teclado y el lector de pantalla (su Enter sube hasta
        // la fila). Lo que se fue de las columnas escondidas va bajo el nombre (`debajo`), junto al código.
        celda: (m, { indice, debajo }) => {
          const a = apariencia[m.productoId];
          const abierto = abiertos.has(m.productoId);
          return (
            <span className="flex min-w-0 items-center gap-3">
              <MiniaturaPrenda tamano="lg" fotoUrl={a?.fotoUrl ?? null} prefijo={a?.prefijo} familia={a?.familia} categoria={a?.categoria} />
              <span className="min-w-0">
                <button
                  type="button"
                  aria-expanded={abierto}
                  aria-controls={`ingreso-${m.productoId}`}
                  data-guia={indice === 0 ? "movimientos.ingresos-nombre" : undefined}
                  className="block max-w-full truncate text-left font-medium text-tinta"
                >
                  {m.referencia}
                  <span className="sr-only">{abierto ? ". Ocultar colores y tallas" : ". Ver colores y tallas"}</span>
                </button>
                {m.codigo && <span className="tv-sub truncate">{m.codigo}</span>}
                {debajo}
              </span>
            </span>
          );
        },
      },
      {
        clave: "clase",
        titulo: "Clase",
        tipo: "opcion",
        valor: (m) => (m.esNuevo ? NUEVO : REINGRESO),
        filtra: hayDeLasDos,
        ancho: "7.5rem",
        sinNombreEnTarjeta: true,
        ayuda: "«Nuevo» llega por primera vez; «Reingreso» ya había entrado antes",
        guia: "movimientos.ingresos-novedad",
        guiaCelda: "movimientos.ingresos-etiqueta",
        celda: (m) => <ChipClase nuevo={m.esNuevo} />,
        dibujarOpcion: (v) => <ChipClase nuevo={v === NUEVO} />,
        frase: (v, n) => unirConO(v.map((x) => (x === NUEVO ? (n === 1 ? "nuevo" : "nuevos") : n === 1 ? "reingreso" : "reingresos"))),
      },
      {
        clave: "categoria",
        titulo: "Categoría",
        tipo: "opcion",
        valor: (m) => m.categoria,
        filtra: true,
        seVa: 1060,
        ancho: "minmax(8.5rem,1fr)",
        resumen: (m) => m.categoria,
        frase: (v) => `de ${unirConO(v)}`,
      },
      {
        clave: "entro",
        titulo: "Entró",
        tipo: "fecha",
        valor: (m) => m.ultimoDia,
        seVa: 840,
        ancho: "7rem",
        ayuda: "El último día del período en que entró algo de este modelo",
        resumen: (m) => `entró ${fechaRelativa(m.ultimoDia, hoy).texto}`,
      },
      {
        clave: "prendas",
        titulo: "Prendas",
        tipo: "numero",
        valor: (m) => m.unidades,
        texto: (m) => m.unidades.toLocaleString("es-PE"),
        destacadaEnTarjeta: true,
        unidadEnTarjeta: "prendas",
        celda: (m) => (
          <span title={`${m.deStockInicial.toLocaleString("es-PE")} de stock inicial · ${m.deRecepcion.toLocaleString("es-PE")} de mercadería recibida`}>
            {m.unidades.toLocaleString("es-PE")}
          </span>
        ),
        suma: (v) => sumaDe(v, (m) => m.unidades).toLocaleString("es-PE"),
      },
      {
        clave: "precio",
        titulo: "Precio",
        tipo: "monto",
        valor: (m) => m.precioMin,
        texto: precioDelModelo,
        ayuda: "Lo que se cobra en esta sede por lo que entró",
        guiaCelda: "movimientos.ingresos-precio",
      },
      ...(veCosto
        ? [
            {
              clave: "costo",
              titulo: "Costo",
              tipo: "monto" as const,
              valor: (m: ModeloIngresado) => m.costoMin,
              texto: costoDelModelo,
              // Bajo 840 px de tabla el costo pasa bajo el nombre: el modelo necesita el lugar, y el precio se queda a la vista.
              seVa: 840 as const,
              resumen: (m: ModeloIngresado) => `costo ${costoDelModelo(m)}`,
              ayuda: "Lo que costó. Solo lo ve quien tiene permiso de dinero.",
            },
          ]
        : []),
    ],
    [apariencia, abiertos, hayDeLasDos, hoy, veCosto],
  );
  const ordenar = useMemo(() => ordenarIngresos(columnas), [columnas]);
  const tabla = useTablaViva({ filas: encontrados, columnas, ordenInicial: { clave: ORDEN_INICIAL_INGRESOS.campo, dir: ORDEN_INICIAL_INGRESOS.dir }, ordenar });
  const visibles = tabla.visibles;
  const q = busqueda.trim();
  const deAfuera: FiltroDeAfuera[] = q ? [{ clave: "busqueda", pildora: `Busca: «${q}»`, frase: `con «${q}»`, quitar: () => setBusqueda("") }] : [];

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

  // Baja LO QUE SE VE (con la búsqueda, los filtros y el orden de la tabla): armado acá, con lo que el rango ya trajo.
  function bajar(conDetalle: boolean) {
    const nombre = nombreArchivoIngresos({ sede, desde, hasta, detalle: conDetalle });
    if (conDetalle) descargarCsv(nombre, ENCABEZADOS_DETALLE, filasPorColorYTalla(visibles));
    else descargarCsv(nombre, encabezadosPorModelo(veCosto), filasPorModelo(visibles, veCosto));
  }

  return (
    <>
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
        {visibles.length > 0 && (
          <>
            {/* Desde sm: los tres botones sueltos, a la altura de las píldoras de al lado (32 px con el mouse, 44 con el dedo: `btn-chico`
                mide 44 siempre y la fila quedaba con tres alturas). En el celular se juntan en «Más»: sueltos empujaban la tabla casi una
                pantalla hacia abajo. */}
            <div data-guia="movimientos.ingresos-descargar" className="hidden flex-wrap items-center gap-2 sm:flex">
              <BotonDescargar chico className={ALTO_COMPACTO} onClick={() => bajar(false)} title="Baja lo que estás viendo, con tu búsqueda, tus filtros y tu orden: una línea por modelo">
                Descargar Excel
              </BotonDescargar>
              <BotonDescargar chico className={ALTO_COMPACTO} onClick={() => bajar(true)} title="Lo mismo, con una línea por cada color y talla de cada modelo">
                Descargar Excel con tallas
              </BotonDescargar>
              <BotonImprimir
                chico
                className={ALTO_COMPACTO}
                onClick={imprimir}
                cargando={preparando}
                guia="movimientos.ingresos-imprimir"
                title="Imprime lo que estás viendo, con la foto de cada modelo. En el cuadro de impresión también puedes guardarlo como PDF"
              >
                Imprimir la lista
              </BotonImprimir>
            </div>
            <div data-guia="movimientos.ingresos-mas" className="sm:hidden">
              <MenuAcciones
                etiqueta="Más acciones de Ingresos"
                texto="Más"
                items={[
                  { clave: "excel", etiqueta: "Descargar Excel", onSelect: () => bajar(false) },
                  { clave: "excel-tallas", etiqueta: "Descargar Excel con tallas", onSelect: () => bajar(true) },
                  { clave: "imprimir", etiqueta: "Imprimir la lista", onSelect: imprimir },
                ]}
              />
            </div>
          </>
        )}
      </div>
      <TablaViva
        tabla={tabla}
        clave={(m) => m.productoId}
        etiqueta="Modelos que entraron"
        sustantivo={MODELO}
        hoy={hoy}
        total={modelos.length}
        cola={`que entraron ${conPreposicion(rangoTexto)}`}
        suma={(v) => prendasTexto(sumaDe(v, (m) => m.unidades))}
        deAfuera={deAfuera}
        onAbrir={(m) => alternar(m.productoId)}
        abierta={(m) => abiertos.has(m.productoId)}
        debajoDeFila={(m, i) =>
          abiertos.has(m.productoId) ? (
            <DetalleIngreso modelo={m} id={`ingreso-${m.productoId}`} guia={i === 0 ? "movimientos.ingresos-detalle" : undefined} />
          ) : null
        }
        guia="movimientos.ingresos-tabla"
        guiaFrase="movimientos.ingresos-total"
        guiaFila="movimientos.ingresos-fila"
        guiaPie="movimientos.ingresos-pie"
        cifrasCentradas
      />
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
