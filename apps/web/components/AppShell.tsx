"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { Boton } from "@/components/ui/campos";
import { Insignia } from "@/components/ui/Insignia";
import { UbicacionSwitcher } from "@/components/UbicacionSwitcher";
import { hijosMenuCompras, hijosMenuProduccion, type ClaveMenuCompras, type ClaveMenuProduccion } from "@/lib/produccion-menu";
import { PerfilModal } from "@/components/PerfilModal";
import { guardarLateralPlegado } from "@/lib/lateral-cookie";

// Navegación v3 (aprobada 2026-07-18, investigada de QuickBooks + POS retail):
// escritorio = lateral con "+ Nuevo" global; celular = 4 pestañas + botón + central.
// "Inventario" es el mundo único del stock físico (catálogo, recibir, almacén).
//
// v3.2 (2026-09-09, ADR-0014): el lateral era el último rincón de la app que
// seguía en la gramática de julio — bloque `bg-sand` plano para marcar dónde
// estás, sin nada del "hilo vivo" que desde ADR-0011 rige todos los campos.
// Ahora el marcador es UN solo riel rojo que se DESLIZA de una fila a otra:
// la misma pieza del `Segmentado` (que ya se desliza en horizontal) puesta de
// canto. Estructura, ancho y respiro cambiaron; ninguna ruta lo hizo.
//
// v3.3 (2026-09-15, ADR-0057): Punto de Venta/Caja/Cambios/Devoluciones/
// Facturación se agrupan bajo una cabecera colapsable "Venta" (arranca
// abierta). El riel sigue sin medir el DOM: camina sobre las filas
// REALMENTE visibles (cabecera + hijas si está abierto), no sobre el array
// de datos — ver `GrupoLateral`. Rutas sin cambios.
//
// v3.5 (2026-09-18, rediseño de Traslados): los ítems pueden llevar un
// `contador` — hoy solo «Traslados», con cuántos esperan a quien mira. Se
// pinta también en la cabecera «Inventario» cuando el grupo está cerrado
// (arranca cerrado salvo que estés dentro: sin eso el número no se vería casi
// nunca) y sobre la pestaña «Inventario» del celular, que no tiene lateral.
// La insignia cabe dentro de los 48 px de la fila: no mueve el riel.
//
// v3.4 (2026-09-16, pedido de Felipe): "Catálogo" agrupa Productos/
// Categorías/Colores — hasta hoy Categorías y Colores no vivían en el
// lateral, solo como pestañas de `ProductosNav.tsx` dentro de `/productos`
// (ahora redundante, se retira de las 4 pantallas que la usaban). Con dos
// grupos colapsables el estado por nombre de "Venta" (`ventaAbierto`/
// `ventaTocado`) no alcanzaba sin duplicar variables por cada grupo nuevo:
// `ItemVenta` pasa a `ItemGrupo` (con `id`) y el estado a un mapa por id
// (`gruposAbiertos`/`gruposTocados`). Comportamiento idéntico al de Venta,
// ahora servido para cualquier cantidad de grupos.

// v3.6 (2026-09-19, spike `docs/maquetas/menu-lateral-spike-2026-09/`): el lateral se
// pliega a una columna de íconos (17rem → 4.75rem). Botón en la cabecera o tecla `[`;
// la preferencia vive en una cookie que lee el layout (`lib/lateral-cookie.ts`). Plegado,
// cada grupo abre un cajón flotante con sus hijas (`CajonGrupo`), los ítems sueltos muestran
// su nombre al pasar el mouse y la insignia de «por atender» se posa sobre el ícono. Las hijas
// de un grupo expandido se despliegan por `grid-template-rows` (`.lateral-hijos`, globals.css)
// en vez de montarse con `anim-revelar`. El ancho lo comparten aside, cabecera, <main> y las
// barras fijas por UN token: plegar solo cambia `--spacing-lateral` en `[data-lateral]`.
//
// V2 (Fase UI 1, 2026-09-11): `ubicaciones.nombre` ya es legible por sí solo
// ("Tienda Lima") — a diferencia de V1, donde el código dejó de servir tras
// la unificación con Dynamic y hacía falta `sedeEtiqueta` aparte. Por eso acá
// no hay campo "código": no existe en `retail.ubicaciones` (V2) y no hace
// falta traducir nada.
type Persona = {
  nombre: string;
  rol: "lider" | "integrante";
  ubicacionId: string;
  ubicacionEtiqueta: string;
  /** Producción (2026-09-15): un integrante del Taller ve el módulo sin ser
   *  líder. Solo el AppShell lo mira; el permiso real lo da la base. */
  ubicacionTipo: "tienda" | "almacen" | "taller";
  puedeCambiarUbicacion: boolean;
};

type Props = {
  persona: Persona;
  /** Solo se usa si `persona.puedeCambiarUbicacion` — un integrante nunca ve
   *  el selector, así que no hace falta traerle la lista completa. */
  ubicaciones: { id: string; nombre: string }[];
  /** Traslados que esperan una acción de quien mira (`getTrasladosPorAtender`). `null` = no se pudo
   *  calcular: el menú sale igual, sin número. */
  trasladosPorAtender?: number | null;
  /** Estado inicial del lateral, leído de la cookie en el servidor (sin parpadeo al cargar). */
  lateralPlegado?: boolean;
  children: React.ReactNode;
};

// Íconos de línea (brandbook: "íconos rellenos ×, solo línea") — trazo 1.5
function Icono({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className ?? "h-5 w-5"}>
      <path d={d} />
    </svg>
  );
}
const IC = {
  inicio: "M3 11l9-8 9 8M5 9.5V21h5v-6h4v6h5V9.5",
  vender: "M6 6h15l-1.5 9h-12L6 6zm0 0L5 3H2m7 18a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z",
  caja: "M12 3v18m4-15H10a2.5 2.5 0 000 5h4a2.5 2.5 0 010 5H8",
  productos: "M20.5 7.3L12 12m0 0L3.5 7.3M12 12v9m8.5-13.7v9.4a1 1 0 01-.5.87l-7.5 4.3a1 1 0 01-1 0l-7.5-4.3a1 1 0 01-.5-.87V7.3a1 1 0 01.5-.87l7.5-4.3a1 1 0 011 0l7.5 4.3a1 1 0 01.5.87z",
  inventario: "M4 7l8-4 8 4v10l-8 4-8-4V7zm8 4L4 7m8 4l8-4m-8 4v10",
  movimientos: "M3 7h13m0 0l-4-4m4 4l-4 4M21 17H8m0 0l4 4m-4-4l4-4",
  traslados: "M4 12h13M13 5l7 7-7 7",
  // Planilla con un visto: contar lo que hay y dejarlo asentado. La cabecera
  // "Inventario" se queda con la caja de siempre (IC.inventario), que
  // "Existencias" comparte — es la raíz del módulo, la misma cosa.
  conteo: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  // Cuatro recuadros: la foto completa de una sede de un vistazo (Resumen).
  resumen: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  facturacion: "M9 12h6m-6 4h6M9 8h1m3.5-5H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8.5L13.5 3z",
  compras: "M3 4h2l2.2 11.2a1 1 0 001 .8h9.6a1 1 0 001-.8L20 8H6.5M9 20a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2zM12 8v4m-2-2h4",
  colaboradores: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  produccion: "M6 9a3 3 0 100-6 3 3 0 000 6zm0 12a3 3 0 100-6 3 3 0 000 6zM20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12",
  // Flechas verticales (no las horizontales de "movimientos", para no leerse
  // como el mismo ícono con otro nombre): cambiar una talla por otra.
  cambios: "M7 3v14m0 0l-4-4m4 4l4-4M17 21V7m0 0l4 4m-4-4l-4 4",
  // Flecha en U: la prenda vuelve.
  devoluciones: "M9 14l-4-4 4-4M5 10h11a4 4 0 010 8h-4",
  nuevo: "M12 5v14m-7-7h14",
  // Bolsa, no carrito: el carrito ya es de "Punto de Venta" (IC.vender) — la
  // cabecera "Venta" necesita un trazo propio para no verse igual a su hija.
  venta: "M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 016 0v2",
  // Cuatro cuadros: "Catálogo" agrupa a Productos (una sola caja, IC.productos)
  // — la cabecera necesita su propio trazo por el mismo motivo que "Venta".
  catalogo: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z",
  // Etiqueta colgante: el vocabulario que clasifica una prenda.
  categorias: "M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3zM6 6h.008v.008H6V6z",
  // Tres muestras en racimo (2026-09-17, consolidación de Catálogo): Color/
  // Talla/Tejido/Patrón/Etiqueta eran 5 filas e ícono propio cada una — ahora
  // son pestañas de una sola pantalla, "Atributos", que se queda con un solo
  // trazo que sugiere "varias muestras a la vez" en vez de una cosa puntual.
  atributos: "M4 4h6v6H4zM14 4h6v6h-6zM9 14h6v6H9z",
  // Camión: quien entrega la mercadería — "Compras" (cabecera) se queda con
  // la bolsa+recibo de siempre; sus hijas necesitan trazo propio cada una.
  proveedores: "M1 3h15v13H1zM16 8h4l3 3v5h-7V8z M5.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z M18.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  // Hoja con líneas: el documento de la factura.
  facturas: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  // Bandeja de entrada: lo que llega a la sede.
  recibir: "M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z",
  // Reloj: lo que todavía no se pagó, contra una fecha.
  porPagar: "M12 22a10 10 0 100-20 10 10 0 000 20z M12 6v6l4 2",
  // Recibo con una flecha que vuelve: el documento por el que el proveedor devuelve dinero.
  notasCredito: "M4 3h13a1 1 0 011 1v15.5a1.5 1.5 0 01-2.4 1.2L14 19l-2.2 1.7a1 1 0 01-1.2 0L8.4 19l-2.2 1.7A1.5 1.5 0 014 19.5V4a1 1 0 011-1z M8 8h6 M8 12h4",
  chevron: "M9 6l6 6-6 6",
};

/* ------------------------------------------------------------------
   Geometría del riel. El indicador y las filas leen los MISMOS dos
   números, así que el riel no se puede desalinear de la fila que
   marca — que es exactamente lo que pasa cuando el alto de la fila
   vive en una clase de Tailwind y el desplazamiento en un `style`.
   ------------------------------------------------------------------ */
const ALTO_FILA = 48; // px
const AIRE_FILA = 8; // px entre filas
const PASO_FILA = ALTO_FILA + AIRE_FILA;
const ALTO_RIEL = 20; // px — la misma marca de canto del listbox de campos.tsx

type Item = { href: string; etiqueta: string; icono: string; /** Cuántas cosas de este ítem piden acción a quien mira; 0 o ausente = sin insignia. */ contador?: number };
// Cabecera colapsable: agrupa Items bajo un nombre común, no navega (sin
// href propio). `id` identifica el grupo en los mapas de estado de abajo
// (gruposAbiertos/gruposTocados) — con un solo grupo ("Venta", al nacer)
// alcanzaba una variable por nombre; con dos hace falta una clave.
type ItemGrupo = { id: string; etiqueta: string; icono: string; hijos: Item[] };
type FilaMenu = Item | ItemGrupo;
function esGrupo(f: FilaMenu): f is ItemGrupo {
  return "hijos" in f;
}

/* ------------------------------------------------------------------
   Una sección del lateral. Cada grupo lleva su propio riel: con un
   riel único para toda la columna habría que medir el alto real de
   los títulos de grupo en el DOM, y una medición que se hace tarde es
   un riel que salta al cargar la página.

   v3.6 (2026-09-19): el lateral se pliega a una columna de íconos
   (`compacto`). Ahí los grupos no se abren en línea — sus hijas viven en
   el cajón flotante (`CajonGrupo`) — así que a efectos del riel cuentan
   como cerrados: la cabecera representa a la ruta activa, igual que ya
   hacía con el grupo cerrado.
   ------------------------------------------------------------------ */
type FilaLateral =
  | { tipo: "item"; item: Item }
  | { tipo: "grupo"; item: ItemGrupo };

function GrupoLateral({
  titulo,
  items,
  pathname,
  activo,
  gruposAbiertos,
  compacto,
  cajonDe,
  onToggleGrupo,
  onAbrirCajon,
  onEntrarFila,
  onSalirFila,
}: {
  titulo: string | null;
  items: FilaMenu[];
  pathname: string;
  activo: (href: string) => boolean;
  gruposAbiertos: Record<string, boolean>;
  /** Lateral plegado a íconos: sin etiquetas, sin hijas en línea. */
  compacto: boolean;
  /** Id del grupo cuyo cajón está abierto (solo tiene sentido si `compacto`). */
  cajonDe: string | null;
  onToggleGrupo: (id: string) => void;
  onAbrirCajon: (id: string, el: HTMLElement, enfocar: boolean) => void;
  /** Mouse/foco sobre una fila: el AppShell decide si muestra la etiqueta o abre el cajón. */
  onEntrarFila: (el: HTMLElement, texto: string, grupoId?: string) => void;
  onSalirFila: () => void;
}) {
  // Un grupo cuenta como abierto solo si el lateral está expandido Y su estado dice abierto.
  const estaAbierto = (id: string) => !compacto && (gruposAbiertos[id] ?? false);

  // Aplana cabecera + hijas (solo si está abierta) en las filas que de
  // verdad se van a ver — el riel lee ESTE índice, nunca el del array
  // original, así que nunca se desalinea aunque un grupo cambie cuántas
  // filas ocupa al abrirse o cerrarse.
  const filas: FilaLateral[] = [];
  items.forEach((it) => {
    if (esGrupo(it)) {
      filas.push({ tipo: "grupo", item: it });
      if (estaAbierto(it.id)) it.hijos.forEach((h) => filas.push({ tipo: "item", item: h }));
    } else {
      filas.push({ tipo: "item", item: it });
    }
  });

  // Con el grupo cerrado, la cabecera hace de sustituto de sus hijas: si una
  // de ellas es la ruta activa, el riel se queda en la cabecera (la única
  // fila que representa a esa ruta mientras está colapsada).
  //
  // Coincidencia EXACTA primero. Un padre y su hija pueden compartir prefijo
  // de ruta sin ser el mismo destino — "Productos" (`/productos`) y
  // "Colores" (`/productos/colores`) son hermanos, no un padre conteniendo a
  // su hija, pero `activo()` (prefijo, pensado para "esta ruta cuelga de
  // esta otra") los confunde: en `/productos/colores` marcaba "Productos"
  // como activo por venir primero en el array, nunca a "Colores" (mismo
  // hueco latente ya existía entre "Punto de Venta" y "Facturación",
  // `/vender` vs `/vender/facturacion` — se corrige acá para los dos).
  // Si ninguna fila calza exacto (`/productos/nuevo`, que no es ninguna de
  // las tres pestañas), recién ahí se cae a la coincidencia por prefijo.
  // Y entre varios prefijos que calzan, gana el MÁS LARGO (2026-09-16, al
  // agrupar Inventario): en `/inventario/traslados/<id>` calzan "Existencias"
  // (`/inventario`) y "Traslados" (`/inventario/traslados`) — la segunda es
  // la que de verdad contiene la ruta, aunque venga después en el array.
  // Una cabecera colapsada compite con el largo de la hija que le calza.
  const filaExacta = filas.findIndex((f) => f.tipo === "item" && f.item.href === pathname);
  let indiceActivo = filaExacta;
  if (indiceActivo < 0) {
    let mejorLargo = -1;
    filas.forEach((f, i) => {
      const largo =
        f.tipo === "item"
          ? activo(f.item.href)
            ? f.item.href.length
            : -1
          : !estaAbierto(f.item.id)
            ? Math.max(-1, ...f.item.hijos.filter((h) => activo(h.href)).map((h) => h.href.length))
            : -1;
      if (largo > mejorLargo) {
        mejorLargo = largo;
        indiceActivo = i;
      }
    });
  }
  // La fila activa se identifica por clave (no por su posición en el JSX): las hijas siempre están
  // montadas —cerradas miden 0 de alto— para poder animar su despliegue, así que el índice de
  // `filas` (solo lo visible) y el orden del árbol ya no coinciden.
  const filaActiva = indiceActivo >= 0 ? filas[indiceActivo] : null;
  const claveActiva = filaActiva ? (filaActiva.tipo === "grupo" ? `g:${filaActiva.item.id}` : `i:${filaActiva.item.href}`) : null;

  // Clases de una fila (cabecera o ítem). `overflow-hidden` + `nowrap`: al plegar, la etiqueta se
  // apaga y el ancho la recorta, en vez de partirse en dos líneas a mitad de la animación.
  const claseFila = (esActivo: boolean, indentada: boolean) =>
    `group relative flex items-center gap-3.5 overflow-hidden whitespace-nowrap rounded-lg pr-3 text-sm transition-colors ${
      indentada ? "pl-9" : "pl-4"
    } ${esActivo ? "bg-sand/70 font-medium text-tinta" : "text-tinta/80 hover:bg-sand/40 hover:text-rojo"}`;
  const claseEtiqueta = `min-w-0 flex-1 truncate transition-opacity duration-200 ease-cayla ${compacto ? "opacity-0" : ""}`;

  return (
    <div>
      {/* Con un solo grupo el título sobra: sería una etiqueta para TODO el
          menú, que es justo el ruido que se estaba sacando. Una Encargada ve
          las tres filas sin encabezado; el Líder ve los dos nombres. */}
      {titulo && <p className="label-cayla px-4 pb-3 text-[11px] text-tinta/65">{titulo}</p>}
      {/* Sin `gap`: las hijas de un grupo cerrado miden 0 pero seguirían pagando su separación. El aire
          (AIRE_FILA) se pone como margen de cada fila, así un grupo cerrado no deja huecos. */}
      <div className="relative flex flex-col">
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 w-[2px] rounded-full bg-rojo transition-[transform,opacity] duration-300 ease-cayla"
          style={{
            height: ALTO_RIEL,
            top: (ALTO_FILA - ALTO_RIEL) / 2,
            transform: `translateY(${Math.max(indiceActivo, 0) * PASO_FILA}px)`,
            opacity: indiceActivo >= 0 ? 1 : 0,
          }}
        />
        {items.map((it, n) => {
          const margen = n > 0 ? { marginTop: AIRE_FILA } : undefined;

          if (!esGrupo(it)) {
            const esActivo = claveActiva === `i:${it.href}`;
            return (
              <div key={it.href} style={margen}>
                <Link
                  href={it.href}
                  aria-current={esActivo ? "page" : undefined}
                  style={{ height: ALTO_FILA }}
                  className={claseFila(esActivo, false)}
                  onMouseEnter={(e) => onEntrarFila(e.currentTarget, it.etiqueta)}
                  onFocus={(e) => onEntrarFila(e.currentTarget, it.etiqueta)}
                  onMouseLeave={onSalirFila}
                  onBlur={onSalirFila}
                >
                  <FantasmaRiel esActivo={esActivo} />
                  <Icono
                    d={it.icono}
                    className={`h-5 w-5 shrink-0 transition-[transform,color] duration-300 ease-cayla ${
                      esActivo ? "text-tinta" : "text-tinta/60 group-hover:translate-x-0.5 group-hover:text-rojo"
                    }`}
                  />
                  <span className={claseEtiqueta}>{it.etiqueta}</span>
                  <InsigniaFila n={it.contador ?? 0} compacto={compacto} />
                </Link>
              </div>
            );
          }

          const abierto = estaAbierto(it.id);
          const esActivo = claveActiva === `g:${it.id}`;
          const contieneActivo = it.hijos.some((h) => activo(h.href));
          const suma = it.hijos.reduce((acc, h) => acc + (h.contador ?? 0), 0);
          return (
            <div key={it.id} style={margen}>
              <button
                type="button"
                data-grupo-id={it.id}
                onClick={(e) => (compacto ? onAbrirCajon(it.id, e.currentTarget, true) : onToggleGrupo(it.id))}
                onMouseEnter={(e) => onEntrarFila(e.currentTarget, it.etiqueta, it.id)}
                onMouseLeave={onSalirFila}
                // Plegado el botón abre un menú (el cajón); expandido, despliega sus hijas en línea.
                aria-haspopup={compacto ? "menu" : undefined}
                aria-expanded={compacto ? cajonDe === it.id : abierto}
                style={{ height: ALTO_FILA }}
                className={`w-full text-left ${claseFila(esActivo, false)}`}
              >
                <Icono
                  d={it.icono}
                  className={`h-5 w-5 shrink-0 transition-colors duration-300 ease-cayla ${
                    esActivo || contieneActivo ? "text-tinta" : "text-tinta/60 group-hover:text-rojo"
                  }`}
                />
                <span className={`${claseEtiqueta} text-left`}>{it.etiqueta}</span>
                {/* Cerrado (o plegado), el grupo no muestra a sus hijas: el número sube a la cabecera para que se vea igual. */}
                {!abierto && <InsigniaFila n={suma} compacto={compacto} />}
                <Icono
                  d={IC.chevron}
                  className={`h-3.5 w-3.5 shrink-0 text-tinta/50 transition-[transform,opacity] duration-300 ease-cayla ${
                    abierto ? "rotate-90" : ""
                  } ${compacto ? "opacity-0" : ""}`}
                />
              </button>
              {/* Las hijas se despliegan por `grid-template-rows: 0fr → 1fr`: se abren sin medir alturas
                  (una medición tardía es un salto). `inert` cerrado: invisibles Y fuera del tabulador. */}
              <div className="lateral-hijos" data-abierto={abierto} inert={!abierto}>
                <div>
                  {it.hijos.map((h, idx) => {
                    const hijoActivo = claveActiva === `i:${h.href}`;
                    return (
                      <div key={h.href} className="lateral-hijo" style={{ marginTop: AIRE_FILA, "--i": idx } as React.CSSProperties}>
                        <Link
                          href={h.href}
                          aria-current={hijoActivo ? "page" : undefined}
                          style={{ height: ALTO_FILA }}
                          className={claseFila(hijoActivo, true)}
                        >
                          {/* Marca fantasma: al pasar el mouse por una fila apagada aparece
                              el riel en gris, en el mismo sitio exacto donde va a quedar el
                              rojo si sueltas el clic. Se lee "estás acá / irías allá" — es
                              el riel mostrando su próximo destino, no un efecto aparte. */}
                          <FantasmaRiel esActivo={hijoActivo} />
                          <Icono
                            d={h.icono}
                            className={`h-5 w-5 shrink-0 transition-[transform,color] duration-300 ease-cayla ${
                              hijoActivo ? "text-tinta" : "text-tinta/60 group-hover:translate-x-0.5 group-hover:text-rojo"
                            }`}
                          />
                          <span className="flex-1">{h.etiqueta}</span>
                          <Insignia n={h.contador ?? 0} etiqueta="por atender" />
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FantasmaRiel({ esActivo }: { esActivo: boolean }) {
  if (esActivo) return null;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-0 top-1/2 w-[2px] -translate-y-1/2 scale-y-0 rounded-full bg-tinta/30 transition-transform duration-200 ease-cayla group-hover:scale-y-100"
      style={{ height: ALTO_RIEL }}
    />
  );
}

// El número «por atender» de una fila del lateral: en línea al final de la fila; plegado, no hay
// sitio para una columna, así que se posa sobre la esquina del ícono (con un anillo del color del
// fondo para que no se funda con el trazo).
function InsigniaFila({ n, compacto }: { n: number; compacto: boolean }) {
  if (compacto) {
    return <Insignia n={n} etiqueta="por atender" tamano="compacta" className="absolute left-[27px] top-[5px] ring-2 ring-crema" />;
  }
  return <Insignia n={n} etiqueta="por atender" />;
}

/* ------------------------------------------------------------------
   MenuNuevo — el panel del botón "+ Nuevo".

   NO es un `Modal` de Radix a propósito, y no por ahorrar: atrapar el
   foco es el patrón de un DIÁLOGO. Un menú hace lo contrario — el
   tabulador lo CIERRA y sigue de largo. Migrarlo a `Modal` le pondría
   el comportamiento de otra cosa.

   Lo que sí seguía faltando (BACKLOG desde ADR-0003) era el teclado del
   patrón menu button: flechas entre opciones, Inicio/Fin, Espacio para
   activar, tipeo para saltar, y sobre todo que Tab no recorriera el
   panel para terminar dentro de la app que está detrás del velo —
   visualmente bloqueada, pero perfectamente tabulable.

   El teclado es el mismo de `CampoSelect` (campos.tsx), lo que también
   quiere decir que se comporta igual: se levantó de ahí, no se inventó.
   Una diferencia con el patrón de la W3C, asumida: ahí Tab cierra y
   mueve al SIGUIENTE elemento de la página; acá cierra y devuelve el
   foco al botón que abrió. Cuesta un Tab más y evita tener que
   arrastrar un buscador de "próximo elemento tabulable" para un menú
   de cinco opciones. Nunca deja el foco flotando, que era el problema.
   ------------------------------------------------------------------ */
// Fase UI 1 (2026-09-11) + Prioridad 1 (2026-09-12): recortado a las
// escrituras que V2 ya tiene resueltas de punta a punta (RPC + pantalla).
// "Nuevo producto" y "Registrar gasto" vuelven cuando su propia pantalla se
// adapte (Fase 2/3/4) — ofrecerlas antes sería un enlace que compila y
// revienta contra un esquema que ya no existe. "Nueva venta" exige caja
// abierta — si no hay, /vender lo explica y manda a /caja, no es un enlace roto.
//
// ADR-0111: UNA sola puerta para recibir. ADR-0113: la misma para todos — Recibir mercadería salió de
// Compras (solo líder) a `/recibir`, porque cuenta cualquier colaborador de la sede. «Registrar comprobante»
// sigue siendo del líder: es dinero. El «Ingreso sin comprobante» queda como excepción, dentro de esa pantalla.
function MenuNuevo({ onClose, esLider }: { onClose: () => void; esLider: boolean }) {
  const acciones = [
    { href: "/vender", etiqueta: "Nueva venta", detalle: "Registrar la compra de una clienta" },
    ...(esLider ? [{ href: "/compras/nueva", etiqueta: "Registrar comprobante", detalle: "Una compra a proveedor, con su pago si es al contado" }] : []),
    { href: "/recibir", etiqueta: "Recibir mercadería", detalle: "Lo que llegó, contra sus comprobantes" },
    { href: "/inventario/mover", etiqueta: "Mover mercadería", detalle: "Trasladar stock entre ubicaciones" },
    { href: "/cambios", etiqueta: "Registrar cambio", detalle: "La clienta cambia una prenda por otra talla o color" },
    { href: "/devoluciones", etiqueta: "Registrar devolución", detalle: "Una clienta devuelve algo que compró" },
  ];

  const [activo, setActivo] = useState(0);
  const filas = useRef<(HTMLAnchorElement | null)[]>([]);
  const tipeo = useRef({ texto: "", reloj: 0 });

  // El foco entra al panel al abrirse: se monta al final del árbol, así que
  // sin esto el tabulador recorría toda la app antes de llegar a las opciones.
  useEffect(() => {
    filas.current[0]?.focus();
  }, []);

  // Escape queda en `document` y no en el panel: si alguien hizo clic en el
  // velo, el foco puede haber salido de las filas, y Escape tiene que cerrar
  // igual. Es la única tecla que no depende de dónde esté parado el foco.
  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [onClose]);

  function irA(i: number) {
    const n = (i + acciones.length) % acciones.length;
    setActivo(n);
    filas.current[n]?.focus();
  }

  function alTeclado(e: React.KeyboardEvent) {
    switch (e.key) {
      case "Tab":
        // Cierra en vez de dejar pasar: sin esto el tabulador sale del panel
        // y sigue por la app de atrás, que está tapada por el velo pero
        // entera tabulable.
        e.preventDefault();
        onClose();
        break;
      case "ArrowDown":
        e.preventDefault();
        irA(activo + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        irA(activo - 1);
        break;
      case "Home":
        e.preventDefault();
        irA(0);
        break;
      case "End":
        e.preventDefault();
        irA(acciones.length - 1);
        break;
      case " ":
        // Enter ya navega solo (es un <a>); Espacio no activa un enlace.
        e.preventDefault();
        filas.current[activo]?.click();
        break;
      default: {
        if (e.key.length !== 1) return;
        if (Date.now() - tipeo.current.reloj > 500) tipeo.current.texto = "";
        tipeo.current.reloj = Date.now();
        tipeo.current.texto += e.key.toLowerCase();
        const i = acciones.findIndex((a) => a.etiqueta.toLowerCase().startsWith(tipeo.current.texto));
        if (i >= 0) irA(i);
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="anim-velo absolute inset-0 bg-tinta/25 backdrop-blur-[2px]" />
      <div
        role="menu"
        aria-label="Nuevo"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={alTeclado}
        className="anim-entrada card-cayla absolute inset-x-4 bottom-24 p-2 shadow-lg sm:inset-x-auto sm:bottom-auto sm:left-lateral sm:top-24 sm:ml-4 sm:w-[21rem]"
      >
        {/* `role="menu"` solo admite hijos de menú, así que el encabezado sale
            del árbol de accesibilidad: el nombre del panel ya lo da aria-label. */}
        <p aria-hidden className="label-cayla px-3.5 pb-1.5 pt-2.5 text-[11px] text-tinta/65">Nuevo</p>
        {acciones.map((a, i) => (
          <Link
            key={a.href}
            href={a.href}
            role="menuitem"
            // Un menú es UNA parada de tabulador, no una por opción — y acá
            // además Tab lo cierra, así que ninguna fila entra en la secuencia.
            tabIndex={-1}
            ref={(el) => {
              filas.current[i] = el;
            }}
            onClick={onClose}
            // El mouse manda sobre el mismo índice que las flechas, igual que en
            // el desplegable de campos.tsx: así nunca hay dos filas encendidas.
            onMouseEnter={() => setActivo(i)}
            // Escalonado de 30ms por fila, el mismo del desplegable de campos.tsx:
            // la lista se lee como que se despliega, no como que aparece entera.
            style={{ animationDelay: `${i * 30}ms` }}
            className={`anim-revelar relative block rounded-lg px-3.5 py-3 outline-none transition-colors ${
              i === activo ? "bg-sand/60" : ""
            }`}
          >
            <span
              aria-hidden
              className={`absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-rojo transition-transform duration-200 ease-cayla ${
                i === activo ? "scale-y-100" : "scale-y-0"
              }`}
            />
            <p className="text-sm font-medium text-tinta">{a.etiqueta}</p>
            <p className="mt-0.5 text-xs text-tinta/65">{a.detalle}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   CajonGrupo — las hijas de un grupo cuando el lateral está plegado.

   Con el lateral en 4.75rem no hay dónde desplegar «Inventario» en
   línea, así que la cabecera abre este cajón a su derecha. Mismo
   criterio que `MenuNuevo`: es un MENÚ, no un diálogo — no atrapa el
   foco; Tab y Escape lo cierran y devuelven el foco a la cabecera que
   lo abrió. Teclado calcado de ahí: flechas, Inicio/Fin, Espacio.

   Se abre de dos maneras: clic/Enter (el foco entra a la primera hija)
   o pasando el mouse 120 ms (el foco NO se mueve: es mirar, no elegir).
   ------------------------------------------------------------------ */
function CajonGrupo({
  grupo,
  top,
  left,
  activo,
  enfocar,
  onCerrar,
  onEntrar,
  onSalir,
}: {
  grupo: ItemGrupo;
  top: number;
  left: number;
  activo: (href: string) => boolean;
  enfocar: boolean;
  onCerrar: (devolverFoco: boolean) => void;
  onEntrar: () => void;
  onSalir: () => void;
}) {
  const filas = useRef<(HTMLAnchorElement | null)[]>([]);

  useEffect(() => {
    if (enfocar) filas.current[0]?.focus();
  }, [enfocar]);

  // La hija activa es la de coincidencia más larga (misma regla que el riel: `/inventario` y
  // `/inventario/traslados` calzan las dos en un traslado, gana la que de verdad lo contiene).
  const mejor = grupo.hijos.reduce<Item | null>(
    (m, h) => (activo(h.href) && (!m || h.href.length > m.href.length) ? h : m),
    null,
  );

  function irA(i: number) {
    const n = (i + grupo.hijos.length) % grupo.hijos.length;
    filas.current[n]?.focus();
  }
  function alTeclado(e: React.KeyboardEvent) {
    const i = filas.current.findIndex((f) => f === document.activeElement);
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        irA(i + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        irA(i - 1);
        break;
      case "Home":
        e.preventDefault();
        irA(0);
        break;
      case "End":
        e.preventDefault();
        irA(grupo.hijos.length - 1);
        break;
      case "Escape":
      case "Tab":
        e.preventDefault();
        onCerrar(true);
        break;
      case " ":
        // Enter ya navega solo (es un <a>); Espacio no activa un enlace.
        e.preventDefault();
        filas.current[i]?.click();
        break;
    }
  }

  return (
    <div
      role="menu"
      aria-label={grupo.etiqueta}
      onKeyDown={alTeclado}
      onMouseEnter={onEntrar}
      onMouseLeave={onSalir}
      style={{ top, left }}
      className="anim-flota card-cayla fixed z-[60] w-[15rem] p-2 shadow-lg"
    >
      <p aria-hidden className="label-cayla px-3 pb-1.5 pt-2 text-[11px] text-tinta/65">{grupo.etiqueta}</p>
      {grupo.hijos.map((h, i) => {
        const esActivo = mejor?.href === h.href;
        return (
          <Link
            key={h.href}
            href={h.href}
            role="menuitem"
            tabIndex={-1}
            aria-current={esActivo ? "page" : undefined}
            ref={(el) => {
              filas.current[i] = el;
            }}
            onClick={() => onCerrar(false)}
            // Escalonado de 30 ms por fila, el mismo de `MenuNuevo` y del desplegable de campos.tsx.
            style={{ animationDelay: `${i * 30}ms` }}
            className={`anim-revelar group relative flex h-11 items-center gap-3 rounded-lg px-3 text-sm outline-none transition-colors focus-visible:bg-sand/60 focus-visible:text-rojo ${
              esActivo ? "bg-sand/70 font-medium text-tinta" : "text-tinta/80 hover:bg-sand/40 hover:text-rojo"
            }`}
          >
            {esActivo && <span aria-hidden className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-rojo" />}
            <Icono d={h.icono} className={`h-[18px] w-[18px] shrink-0 transition-colors ${esActivo ? "text-tinta" : "text-tinta/60 group-hover:text-rojo"}`} />
            <span className="flex-1">{h.etiqueta}</span>
            <Insignia n={h.contador ?? 0} etiqueta="por atender" />
          </Link>
        );
      })}
    </div>
  );
}

// Rutas (y todo lo que cuelga de ellas) que usan el ancho completo del <main>.
// Inventario entró el 2026-09-16: la tabla de Existencias con «En tránsito» y
// «En la red» (6 columnas) y la de Movimientos con origen → destino no caben
// en 64rem sin recortar la prenda.
// `/recibir` (ADR-0113) salió de `/compras` y trae su ancho: la lista de pendientes + el envío con la tabla de
// conteo (prenda, SKU, pendiente, llegó, dif., estado) no caben en 64rem.
// Caja entró el 2026-09-18 (pedido de Felipe): el tablero de la caja abierta —KPIs, dona,
// ritmo del día, movimientos— tiene qué mostrar a lo ancho y en pantalla grande sobraba
// margen. Lo que cuelga de /caja y NO es tablero (el formulario de abrir caja y el historial
// de cierres) se topa por su cuenta con `max-w-5xl`: no fueron pensados para estirarse.
// Cambios y Devoluciones entraron el 2026-09-19 (pedido de Felipe): con el flujo guiado y el
// panel de validaciones ya había de sobra qué poner a los lados.
const SIN_TOPE_DE_ANCHO = ["/vender", "/compras", "/productos", "/inventario", "/recibir", "/caja", "/cambios", "/devoluciones"];

export function AppShell({ persona, ubicaciones, trasladosPorAtender, lateralPlegado = false, children }: Props) {
  const pathname = usePathname();
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [perfilAbierto, setPerfilAbierto] = useState(false);
  const disparadorNuevo = useRef<HTMLButtonElement | null>(null);
  const esLider = persona.rol === "lider";

  // ---- Lateral plegado (v3.6) ----
  const [plegado, setPlegado] = useState(lateralPlegado);
  const asideRef = useRef<HTMLElement | null>(null);
  // Etiqueta flotante de una fila plegada y cajón de un grupo: uno a la vez, ambos siempre pegados
  // al borde derecho del lateral.
  const [etiqueta, setEtiqueta] = useState<{ texto: string; top: number; left: number } | null>(null);
  const [cajon, setCajon] = useState<{ grupoId: string; top: number; left: number; enfocar: boolean } | null>(null);
  const relojCajon = useRef(0); // espera de 120 ms antes de abrir por mouse
  const relojCierre = useRef(0); // cierre con 260 ms de gracia: cruzar del lateral al cajón no lo cierra

  const borde = () => (asideRef.current?.getBoundingClientRect().right ?? 76) + 8;
  const cerrarCajon = (devolverFoco = false) => {
    window.clearTimeout(relojCajon.current);
    window.clearTimeout(relojCierre.current);
    if (cajon && devolverFoco) document.querySelector<HTMLElement>(`[data-grupo-id="${cajon.grupoId}"]`)?.focus();
    setCajon(null);
  };
  // Los dos gestos del cierre con gracia, para que el lateral y el cajón los compartan.
  const mantenerCajon = () => window.clearTimeout(relojCierre.current);
  const programarCierre = () => {
    window.clearTimeout(relojCajon.current);
    // Limpiar el cierre anterior ANTES de programar otro: al salir de una fila y del lateral a la vez
    // se llama dos veces, y como el id del primero se pisaba en el ref, `mantenerCajon` (al entrar al
    // cajón) solo cancelaba el segundo — el primero cerraba el cajón 260 ms después, con el mouse encima.
    window.clearTimeout(relojCierre.current);
    relojCierre.current = window.setTimeout(() => cerrarCajon(), 260);
  };

  const alternarLateral = () => {
    const siguiente = !plegado;
    setPlegado(siguiente);
    cerrarCajon();
    setEtiqueta(null);
    guardarLateralPlegado(siguiente);
  };

  // Atajo `[`: como en tantas apps con lateral. No se dispara escribiendo en un campo, con un
  // modificador, ni con un diálogo o el menú «Nuevo» abiertos.
  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='dialog']")) return;
      if (nuevoAbierto || perfilAbierto) return;
      e.preventDefault();
      alternarLateral();
    };
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  });

  // Pasar el mouse por una fila plegada: los ítems sueltos muestran su nombre; un grupo abre su
  // cajón tras 120 ms (intención, no roce). Expandido no hay nada que mostrar: la fila ya dice todo.
  const entrarFila = (el: HTMLElement, texto: string, grupoId?: string) => {
    if (!plegado) return;
    mantenerCajon();
    if (grupoId) {
      setEtiqueta(null);
      window.clearTimeout(relojCajon.current);
      relojCajon.current = window.setTimeout(() => abrirCajon(grupoId, el, false), 120);
    } else {
      const r = el.getBoundingClientRect();
      setEtiqueta({ texto, top: r.top + r.height / 2, left: borde() + 2 });
    }
  };
  const salirFila = () => {
    setEtiqueta(null);
    programarCierre();
  };
  const abrirCajon = (grupoId: string, el: HTMLElement, enfocar: boolean) => {
    mantenerCajon();
    const g = grupos.flatMap((x) => x.items).find((f): f is ItemGrupo => esGrupo(f) && f.id === grupoId);
    if (!g) return;
    const r = el.getBoundingClientRect();
    // Alto estimado (cabecera + filas de 44 px + aire): alcanza para que nunca se salga por abajo.
    const alto = 16 + 34 + g.hijos.length * 44;
    setEtiqueta(null);
    setCajon({ grupoId, top: Math.max(64, Math.min(r.top - 8, window.innerHeight - alto - 12)), left: borde(), enfocar });
  };

  const abrirNuevo = (e: React.MouseEvent<HTMLButtonElement>) => {
    disparadorNuevo.current = e.currentTarget;
    setNuevoAbierto(true);
  };
  // Al cerrar, el foco vuelve al botón que abrió: si se quedara en el panel
  // que se acaba de desmontar, el teclado quedaría flotando en el body.
  const cerrarNuevo = useCallback(() => {
    setNuevoAbierto(false);
    disparadorNuevo.current?.focus();
  }, []);

  const activo = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  // Grupos colapsables: arrancan CERRADOS por defecto (pedido de Felipe,
  // 2026-09-16 — con "Catálogo" sumado a "Venta" se veía todo desplegado a
  // la vez; antes, con un solo grupo, arrancar abierto no se notaba tanto).
  // La única excepción es el grupo que CONTIENE la ruta en la que se
  // aterriza: cargar directo `/vender` o `/productos/colores` (recarga, link
  // externo, no un clic dentro de la app) tiene que abrir ESE grupo solo —
  // si no, la fila activa quedaría escondida detrás de un grupo cerrado. La
  // lista de rutas por grupo es la misma fuente que arma `hijos` más abajo,
  // repetida a mano porque los grupos todavía no existen a esta altura de
  // la función.
  const RUTAS_POR_GRUPO: Record<string, string[]> = {
    venta: ["/vender", "/caja", "/cambios", "/devoluciones", "/vender/facturacion"],
    catalogo: ["/productos", "/productos/categorias", "/productos/atributos", "/productos/marcas"],
    produccion: ["/produccion"],
    // «Recibir mercadería» (/recibir) vive en Compras para el líder y en Inventario para quien no lo es.
    compras: ["/compras", "/compras/proveedores", "/compras/por-pagar", ...(esLider ? ["/recibir"] : [])],
    inventario: ["/inventario", "/inventario/movimientos", "/inventario/traslados", "/inventario/conteo", "/inventario/resumen", ...(esLider ? [] : ["/recibir"])],
  };
  const grupoActivo = Object.entries(RUTAS_POR_GRUPO).find(([, rutas]) => rutas.some((h) => activo(h)))?.[0] ?? null;

  const [gruposAbiertos, setGruposAbiertos] = useState<Record<string, boolean>>(() =>
    grupoActivo ? { [grupoActivo]: true } : {}
  );

  // Cambiar de sección DESPUÉS de montado (un link de "+ Nuevo", un
  // favorito, sin recargar la página) tampoco debe dejar la ruta nueva
  // escondida — y de paso cierra el grupo anterior (reemplaza el mapa
  // entero, no lo combina): moverse de "Venta" a "Catálogo" no debe dejar
  // los dos abiertos, o se vuelve a la queja original de "todo expandido".
  // Ajuste de estado durante el render, no en un efecto (mismo patrón que ya
  // exige el linter del repo — BITÁCORA 2026-09-14, búfer de animación del
  // ticket): comparar contra el valor del render anterior evita re-disparar
  // esto en cada render y evita animar la apertura inicial (ya cubierta arriba).
  const [grupoActivoAnterior, setGrupoActivoAnterior] = useState(grupoActivo);
  if (grupoActivo !== grupoActivoAnterior) {
    setGrupoActivoAnterior(grupoActivo);
    if (grupoActivo) {
      setGruposAbiertos({ [grupoActivo]: true });
    }
  }

  const inicio: Item = { href: "/", etiqueta: "Inicio", icono: IC.inicio };
  const puntoDeVenta: Item = { href: "/vender", etiqueta: "Punto de Venta", icono: IC.vender };
  const caja: Item = { href: "/caja", etiqueta: "Caja", icono: IC.caja };
  const cambios: Item = { href: "/cambios", etiqueta: "Cambios", icono: IC.cambios };
  const devoluciones: Item = { href: "/devoluciones", etiqueta: "Devoluciones", icono: IC.devoluciones };
  const productos: Item = { href: "/productos", etiqueta: "Productos", icono: IC.productos };
  const categorias: Item = { href: "/productos/categorias", etiqueta: "Categorías", icono: IC.categorias };
  // Reemplaza a Colores/Tallas/Tejidos/Patrones/Etiquetas como filas sueltas
  // (2026-09-17, pedido de Felipe: "con 3 está bien") — las 5 siguen vivas,
  // ahora como pestañas dentro de `/productos/atributos`.
  const atributos: Item = { href: "/productos/atributos", etiqueta: "Atributos", icono: IC.atributos };
  // Lo que espera a quien mira: sin número (0/null) no hay insignia.
  const nTraslados = trasladosPorAtender && trasladosPorAtender > 0 ? trasladosPorAtender : undefined;
  const inventario: Item = { href: "/inventario", etiqueta: "Inventario", icono: IC.inventario, contador: nTraslados };
  // Los cuatro hijos de Inventario (Felipe, 2026-09-16, integrando sus
  // diseños): "Existencias" es la raíz del módulo; Movimientos se mudó de
  // `/movimientos` a `/inventario/movimientos` (la ruta vieja redirige).
  const existencias: Item = { href: "/inventario", etiqueta: "Existencias", icono: IC.inventario };
  const movimientos: Item = { href: "/inventario/movimientos", etiqueta: "Movimientos", icono: IC.movimientos };
  const traslados: Item = { href: "/inventario/traslados", etiqueta: "Traslados", icono: IC.traslados, contador: nTraslados };
  const conteo: Item = { href: "/inventario/conteo", etiqueta: "Conteo", icono: IC.conteo };
  // Quinta pestaña de Inventario (ADR-0101): decisión a nivel sede, solo líder —
  // mismo criterio de visibilidad que Compras.
  const resumen: Item = { href: "/inventario/resumen", etiqueta: "Resumen", icono: IC.resumen };
  const facturacion: Item = { href: "/vender/facturacion", etiqueta: "Facturación", icono: IC.facturacion };
  // Mismas cuatro secciones y mismo orden que ya definía `ComprasNav.tsx`
  // (la factura del proveedor es el eje; "Recibir mercadería" y "Por pagar"
  // son lo que se hace CONTRA una factura) — esa nav queda redundante con
  // el grupo del lateral, igual que pasó con Productos/Categorías/Colores.
  const proveedores: Item = { href: "/compras/proveedores", etiqueta: "Proveedores", icono: IC.proveedores };
  const facturas: Item = { href: "/compras", etiqueta: "Comprobantes", icono: IC.facturas };
  const recibirMercaderia: Item = { href: "/recibir", etiqueta: "Recibir mercadería", icono: IC.recibir };
  const porPagar: Item = { href: "/compras/por-pagar", etiqueta: "Por pagar", icono: IC.porPagar };
  // Notas de crédito (2026-09-19): lo que el proveedor le acredita a CAYLA. Va pegada a «Por pagar»
  // porque las dos responden a la misma pregunta —cuánto dinero hay entre CAYLA y ese proveedor—, una
  // de cada lado. Sin insignia: el contador de «por reclamar» saldría de `notas_credito_tablero()`, que
  // recorre comprobantes, cierres y notas; pagarlo en CADA pantalla de la app por un número que ya se ve
  // como primera cifra del módulo no vale la pena (principio 5).
  const notasCredito: Item = { href: "/compras/notas-credito", etiqueta: "Notas de crédito", icono: IC.notasCredito };
  const colaboradores: Item = { href: "/colaboradores", etiqueta: "Colaboradores", icono: IC.colaboradores };
  const ordenes: Item = { href: "/produccion/ordenes", etiqueta: "Órdenes", icono: IC.produccion };
  // Producción y Compras son dos módulos distintos (ADR-0133, decisión de Felipe
  // 2026-09-19): cada uno con su grupo. Producción (D-A — reemplaza la regla del
  // 2026-09-17 «solo parado en el Taller, líder incluido»): el líder la ve desde
  // cualquier ubicación, porque la base ya lo permite (`fn_puede_operar_ubicacion`
  // = líder o mi ubicación); quien trabaja en el Taller ve sus pantallas. El
  // candado real sigue siendo el de cada RPC; esto solo decide qué se muestra.
  const perfilMenu = { esLider, ubicacionTipo: persona.ubicacionTipo };
  const clavesProduccion = hijosMenuProduccion(perfilMenu);
  const clavesCompras = hijosMenuCompras(perfilMenu);
  const veProduccion = clavesProduccion.length > 0;

  // Integración con Dynamic (2026-09-12): "Colaboradores" salió del nav
  // porque Dynamic es dueño de la IDENTIDAD (alta, rol, sede, activar/
  // desactivar) — eso sigue igual, retail no la administra ni la duplica.
  // Vuelve el 2026-09-13 con un significado distinto y propio de retail:
  // no "quién es esta persona" sino "a quién de Dynamic le doy entrada a
  // retail" (0013_colaboradores_autorizados.sql — "control total temporal"
  // de 0012 abrió la puerta a cualquiera; esto la vuelve a cerrar a una
  // lista elegida). Comercial y Finanzas siguen sin pantalla V2, siguen
  // fuera por esa otra razón. "Facturación" (0010_facturacion.sql) —
  // líder-only, emite documentos legales ante SUNAT.
  // "Venta" agrupa el mostrador + lo legal del cobro (rediseño 2026-09-15):
  // Punto de Venta/Caja/Cambios/Devoluciones son de cualquier integrante;
  // Facturación queda adentro pero sigue líder-only, igual que siempre.
  const grupoVenta: ItemGrupo = {
    id: "venta",
    etiqueta: "Ventas",
    icono: IC.venta,
    hijos: [puntoDeVenta, caja, cambios, devoluciones, ...(esLider ? [facturacion] : [])],
  };
  // "Catálogo" agrupa qué ES una prenda (Productos) y el vocabulario del que
  // cuelga (Categorías, Colores) — pedido de Felipe, 2026-09-16, de
  // mantenerlos separados del resto del menú. Categorías/Colores solo vivían
  // como pestañas de `ProductosNav.tsx` dentro de `/productos`; esa nav
  // queda redundante con el grupo y se retira de las 4 pantallas que la usaban.
  const grupoCatalogo: ItemGrupo = {
    id: "catalogo",
    etiqueta: "Catálogo",
    icono: IC.catalogo,
    hijos: [productos, categorias, atributos],
  };
  // "Compras" agrupa las cuatro pantallas que antes vivían como pestañas de
  // `ComprasNav.tsx` (pedido de Felipe, 2026-09-16, mismo criterio que Catálogo:
  // "generalizado y ordenado"). Líder-only: registra facturas y pagos a proveedor.
  // Sigue siendo un módulo APARTE de Producción (2026-09-19): se conectan por los
  // datos, no por el menú.
  const itemsCompras: Record<ClaveMenuCompras, Item> = { proveedores, comprobantes: facturas, recibir: recibirMercaderia, porPagar, notasCredito };
  const grupoCompras: ItemGrupo = {
    id: "compras",
    etiqueta: "Compras",
    icono: IC.compras,
    hijos: clavesCompras.map((c) => itemsCompras[c]),
  };

  // "Producción" (ADR-0133) es el módulo de fabricar: hoy solo Órdenes; Resumen,
  // proveedores de producción, Insumos y Eficiencia se suman cuando existan
  // (F3 a F7). Sin rótulos de sección a propósito: el riel del lateral se mueve
  // por filas de alto fijo (`PASO_FILA`) y una fila de otra altura lo desalinearía.
  const itemsProduccion: Record<ClaveMenuProduccion, Item> = { ordenes };
  const hijosProduccion: Item[] = clavesProduccion.map((c) => itemsProduccion[c]);
  const grupoProduccion: ItemGrupo = {
    id: "produccion",
    etiqueta: "Producción",
    icono: IC.produccion,
    hijos: hijosProduccion,
  };
  // Un grupo de una sola fila no agrupa nada: se muestra como fila suelta.
  const entradaProduccion: FilaMenu =
    hijosProduccion.length > 1 ? grupoProduccion : { ...ordenes, etiqueta: "Producción" };

  // "Inventario" agrupa las cuatro pantallas del stock (Felipe, 2026-09-16,
  // integrando sus diseños; mismo criterio que Catálogo y Compras). Antes
  // eran tres filas sueltas (Movimientos, Inventario, Traslados) y Conteo
  // solo se alcanzaba por pestaña. Lo ve cualquier integrante: opera stock,
  // recibe y cuenta, con menos permisos dentro de cada pantalla.
  const grupoInventario: ItemGrupo = {
    id: "inventario",
    etiqueta: "Inventario",
    icono: IC.inventario,
    // Quien no es líder no tiene el grupo Compras: su puerta a «Recibir mercadería» está acá, donde vive el stock.
    hijos: [existencias, movimientos, traslados, conteo, ...(esLider ? [resumen] : [recibirMercaderia])],
  };

  const grupos = [
    {
      titulo: null,
      // Orden pedido por Felipe, 2026-09-16: Inicio, Colaboradores, Catálogo,
      // Producción, Compras, Ventas, Inventario.
      items: [
        inicio,
        ...(esLider ? [colaboradores] : []),
        grupoCatalogo,
        ...(veProduccion ? [entradaProduccion] : []),
        ...(clavesCompras.length > 0 ? [grupoCompras] : []),
        grupoVenta,
        grupoInventario,
      ],
    },
  ].filter((g) => g.items.length > 0);

  const grupoDelCajon = cajon
    ? (grupos.flatMap((x) => x.items).find((f): f is ItemGrupo => esGrupo(f) && f.id === cajon.grupoId) ?? null)
    : null;

  // Celular: 5 columnas fijas con el "+" al centro. Punto de Venta y Caja
  // son las de uso diario en el mostrador; Productos/Movimientos/
  // Colaboradores quedan a un toque del lateral (no entran en 5 columnas
  // fijas). El lateral de escritorio (con el grupo "Venta") no existe en
  // celular — esta barra es su propia estructura, sin cambios acá.
  const columnas: (Item | null)[] = [inicio, puntoDeVenta, null, inventario, caja];
  const indiceMovil = columnas.findIndex((c) => c !== null && activo(c.href));

  const iniciales =
    persona.nombre
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0))
      .join("")
      .toUpperCase() || "·";

  return (
    // `data-lateral` cambia UN token (`--spacing-lateral`, globals.css): el aside, la cabecera, el <main> y las
    // barras fijas de abajo lo leen, así que plegar no obliga a tocar ninguno de los cuatro.
    <div className="min-h-screen bg-crema" data-lateral={plegado ? "plegado" : undefined}>
      {/* ==================== Lateral (escritorio) ==================== */}
      <aside
        id="lateral"
        ref={asideRef}
        onMouseLeave={() => programarCierre()}
        onMouseEnter={() => mantenerCajon()}
        className="ease-cayla fixed inset-y-0 left-0 z-40 hidden w-lateral flex-col overflow-hidden border-r border-tinta/10 bg-crema transition-[width] duration-300 sm:flex"
      >
        {/* Plegado el isotipo queda centrado en la columna (76 px): el padding se anima con el ancho. */}
        <Link href="/" className={`group flex items-center gap-3 overflow-hidden whitespace-nowrap pb-6 pt-7 transition-[padding] duration-300 ease-cayla ${plegado ? "pl-3.5" : "pl-7"}`}>
          <Image
            src="/cayla-isotipo.png"
            alt="CAYLA"
            width={32}
            height={32}
            priority
            className="h-8 w-auto transition-transform duration-500 ease-cayla group-hover:scale-105"
          />
          <span
            className={`label-cayla text-sm text-tinta transition-[color,opacity] duration-200 group-hover:text-rojo ${plegado ? "opacity-0" : ""}`}
            style={{ letterSpacing: "0.26em" }}
          >
            CAYLA
          </span>
        </Link>

        <div className="px-3 pb-7">
          {/* Plegado queda un cuadrado con el «+» (del mismo alto que una fila de 48 px, 52 de ancho:
              columna de 76 − 12 de aire a cada lado). El botón ya anima `all`, así que el ancho viaja solo. */}
          <Boton
            peso="primario"
            onClick={abrirNuevo}
            onMouseEnter={(e) => entrarFila(e.currentTarget, "Nuevo")}
            onMouseLeave={salirFila}
            onFocus={(e) => entrarFila(e.currentTarget, "Nuevo")}
            onBlur={salirFila}
            className={plegado ? "w-[52px]" : "w-full"}
            aria-label="Nuevo"
            aria-haspopup="menu"
            aria-expanded={nuevoAbierto}
          >
            <span className={`flex items-center justify-center ${plegado ? "gap-0" : "gap-2"} transition-[gap] duration-300 ease-cayla`}>
              <Icono d={IC.nuevo} className="h-3.5 w-3.5 shrink-0" />
              <span className={`inline-block overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ease-cayla ${plegado ? "max-w-0 opacity-0" : "max-w-20"}`}>Nuevo</span>
            </span>
          </Boton>
        </div>

        <nav className="scroll-cayla flex-1 space-y-7 overflow-y-auto px-3">
          {grupos.map((g) => (
            <GrupoLateral
              key={g.titulo}
              titulo={grupos.length > 1 ? g.titulo : null}
              items={g.items}
              pathname={pathname}
              activo={activo}
              gruposAbiertos={gruposAbiertos}
              compacto={plegado}
              cajonDe={cajon?.grupoId ?? null}
              onToggleGrupo={(id) => setGruposAbiertos((g) => ({ ...g, [id]: !g[id] }))}
              onAbrirCajon={abrirCajon}
              onEntrarFila={entrarFila}
              onSalirFila={salirFila}
            />
          ))}
        </nav>

        {/* El lateral terminaba en un vacío de media pantalla. La firma de la
            marca le da un piso al bloque de abajo, en vez de dejar el aire
            colgando entre el último ítem y la persona. */}
        <p aria-hidden={plegado} className={`font-display overflow-hidden whitespace-nowrap px-7 pb-5 pt-6 text-xs italic text-taupe-profundo transition-opacity duration-200 ${plegado ? "opacity-0" : ""}`}>
          Donde el estilo transforma.
        </p>

        {/* Plegado el avatar queda centrado en la columna (px-5 + 36 de avatar = centro en 38 px). */}
        <div className={`overflow-hidden border-t border-tinta/10 py-5 transition-[padding] duration-300 ease-cayla ${plegado ? "px-5" : "px-7"}`}>
          <div className="flex items-center gap-3">
            {/* Botón, no <div>: abre "Mi perfil". Salir queda AFUERA de este
                botón, como hermano — un clic ahí nunca dispara el perfil. */}
            <button
              type="button"
              onClick={() => setPerfilAbierto(true)}
              onMouseEnter={(e) => entrarFila(e.currentTarget, "Mi perfil")}
              onMouseLeave={salirFila}
              onFocus={(e) => entrarFila(e.currentTarget, "Mi perfil")}
              onBlur={salirFila}
              aria-label={plegado ? "Mi perfil" : undefined}
              className="group flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <span
                aria-hidden
                className="font-display flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sand text-sm text-tinta transition-colors group-hover:bg-rojo/15"
              >
                {iniciales}
              </span>
              <div className={`min-w-0 flex-1 transition-opacity duration-200 ${plegado ? "opacity-0" : ""}`}>
                <p className="truncate text-sm text-tinta transition-colors group-hover:text-rojo">{persona.nombre}</p>
                <p className="label-cayla mt-0.5 truncate text-[11px] text-tinta/65">
                  {esLider ? "Líder" : "Colaborador"} · {persona.ubicacionEtiqueta}
                </p>
              </div>
            </button>
            {/* Plegado «Salir» no cabe: se apaga y sale del tabulador (`inert`); el perfil sigue a un clic. */}
            <span className={`transition-opacity duration-200 ${plegado ? "opacity-0" : ""}`} inert={plegado}>
              <LogoutButton />
            </span>
          </div>
        </div>
      </aside>

      {perfilAbierto && <PerfilModal onClose={() => setPerfilAbierto(false)} />}

      {/* Etiqueta de una fila plegada. Fuera del <aside> a propósito: el aside recorta (`overflow-hidden`)
          y una etiqueta que se corta a mitad de palabra es peor que ninguna. */}
      {plegado && etiqueta && !cajon && (
        <div
          role="tooltip"
          style={{ top: etiqueta.top, left: etiqueta.left }}
          className="anim-revelar pointer-events-none fixed z-[60] -translate-y-1/2 whitespace-nowrap rounded-lg bg-tinta px-3 py-1.5 text-[13px] font-medium text-crema"
        >
          {etiqueta.texto}
        </div>
      )}
      {plegado && cajon && grupoDelCajon && (
        <CajonGrupo
          key={grupoDelCajon.id}
          grupo={grupoDelCajon}
          top={cajon.top}
          left={cajon.left}
          activo={activo}
          enfocar={cajon.enfocar}
          onCerrar={(devolverFoco) => cerrarCajon(devolverFoco)}
          onEntrar={() => mantenerCajon()}
          onSalir={() => programarCierre()}
        />
      )}

      {/* ==================== Cabecera ==================== */}
      {/* Translúcida + desenfoque: el contenido pasa POR DEBAJO al hacer scroll.
          No es decoración, es la única forma de que se note que hay más página
          arriba en vez de que el texto se corte contra una banda opaca. */}
      <header className="ease-cayla fixed inset-x-0 top-0 z-30 border-b border-tinta/10 bg-crema/85 backdrop-blur-md sm:left-lateral sm:transition-[left] sm:duration-300">
        <div className="flex items-center gap-3 px-4 py-2.5 sm:px-8 sm:py-3">
          {/* Plegar/expandir el lateral. Solo escritorio: en celular no hay lateral (hay pestañas abajo). */}
          <button
            type="button"
            onClick={alternarLateral}
            aria-label={plegado ? "Expandir menú lateral" : "Contraer menú lateral"}
            aria-expanded={!plegado}
            aria-controls="lateral"
            title={`${plegado ? "Expandir" : "Contraer"} el menú  ( [ )`}
            className="-ml-2 hidden h-9 w-9 place-items-center rounded-lg text-tinta/65 transition-colors hover:bg-sand/60 hover:text-rojo sm:grid"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
              <rect x="3" y="4" width="18" height="16" rx="2.5" />
              <path d="M9 4v16" />
              {/* La flecha se da vuelta al plegar: apunta hacia donde irá el lateral. */}
              <path d="M15.5 9.5L13 12l2.5 2.5" className={`origin-center transition-transform duration-300 ease-cayla ${plegado ? "-scale-x-100" : ""}`} />
            </svg>
          </button>
          <Link href="/" className="flex items-center gap-2 sm:hidden">
            <Image src="/cayla-isotipo.png" alt="CAYLA" width={26} height={26} priority className="h-[26px] w-auto" />
          </Link>
          {/* Selector de ubicación del líder (Fase 2, ya no pendiente):
              cambia toda la app de perspectiva, no solo Inventario/Recepción
              (que ya tenían el suyo propio, local a esa pantalla). Un
              integrante sigue viendo solo la etiqueta, sin poder tocarla. */}
          <div className="ml-auto shrink-0">
            {persona.puedeCambiarUbicacion ? (
              <UbicacionSwitcher ubicaciones={ubicaciones} ubicacionActualId={persona.ubicacionId} />
            ) : (
              <span className="label-cayla text-[11px] text-tinta/65">{persona.ubicacionEtiqueta}</span>
            )}
          </div>
        </div>
      </header>

      {/* ==================== Contenido ==================== */}
      {/* Vender y Compras van sin el tope de max-w-5xl: el catálogo + ticket
          necesita todo el ancho (pedido de Felipe, 2026-09-12), y las tablas
          de Compras —seis columnas con documento, proveedor, estados y
          cifras— se apretaban en la columna de lectura (pedido de Felipe,
          2026-09-14). El resto de la app sigue centrado en la columna
          angosta de siempre. */}
      <main className="ease-cayla px-4 pb-28 pt-20 sm:ml-lateral sm:px-10 sm:pb-12 sm:pt-24 sm:transition-[margin-left] sm:duration-300">
        <div className={SIN_TOPE_DE_ANCHO.some((r) => pathname === r || pathname.startsWith(`${r}/`)) ? "" : "mx-auto max-w-5xl"}>{children}</div>
      </main>

      {/* ==================== Pestañas (celular) ==================== */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-tinta/10 bg-crema/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)] sm:hidden">
        <div className="relative grid grid-cols-5">
          {/* El mismo riel del lateral, acostado: una sola marca que se desliza
              entre pestañas en vez de cinco que se prenden y se apagan. */}
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 h-[2px] w-1/5 rounded-full bg-rojo transition-[transform,opacity] duration-300 ease-cayla"
            style={{ transform: `translateX(${Math.max(indiceMovil, 0) * 100}%)`, opacity: indiceMovil >= 0 ? 1 : 0 }}
          />
          {columnas.map((c, n) =>
            c === null ? (
              // Botón + central — el "+ Nuevo" de QuickBooks, siempre a un toque
              <button
                key="nuevo"
                onClick={abrirNuevo}
                aria-label="Nuevo"
                aria-haspopup="menu"
                aria-expanded={nuevoAbierto}
                className="flex flex-col items-center justify-center py-2"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-tinta text-crema shadow-md transition-transform duration-200 ease-cayla active:scale-95">
                  <Icono d={IC.nuevo} className="h-5 w-5" />
                </span>
              </button>
            ) : (
              <Link
                key={c.href}
                href={c.href}
                aria-current={n === indiceMovil ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-3 transition-colors ${n === indiceMovil ? "text-rojo" : "text-tinta/70"}`}
              >
                <span className="relative">
                  <Icono d={c.icono} className="h-[22px] w-[22px]" />
                  {c.contador ? <Insignia n={c.contador} etiqueta="por atender" tamano="compacta" className="absolute -right-3 -top-2" /> : null}
                </span>
                <span className="text-[11px]">{c.etiqueta}</span>
              </Link>
            ),
          )}
        </div>
      </nav>

      {nuevoAbierto && <MenuNuevo onClose={cerrarNuevo} esLider={esLider} />}
    </div>
  );
}
