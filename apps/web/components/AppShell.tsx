"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { Boton } from "@/components/ui/campos";
import { Insignia } from "@/components/ui/Insignia";
import { UbicacionSwitcher } from "@/components/UbicacionSwitcher";
import { PerfilModal } from "@/components/PerfilModal";

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
   ------------------------------------------------------------------ */
type FilaLateral =
  | { tipo: "item"; item: Item; indentada: boolean; ordenEnGrupo: number; grupoId?: string }
  | { tipo: "grupo"; item: ItemGrupo };

function GrupoLateral({
  titulo,
  items,
  pathname,
  activo,
  gruposAbiertos,
  gruposTocados,
  onToggleGrupo,
}: {
  titulo: string | null;
  items: FilaMenu[];
  pathname: string;
  activo: (href: string) => boolean;
  gruposAbiertos: Record<string, boolean>;
  /** Recién en `true` tras el primer toggle/auto-apertura de ESE grupo:
   *  evita que sus hijas jueguen `anim-revelar` en la carga inicial, cuando
   *  ya arrancan visibles (no es una revelación, es la foto de siempre). */
  gruposTocados: Record<string, boolean>;
  onToggleGrupo: (id: string) => void;
}) {
  // Aplana cabecera + hijas (solo si está abierta) en las filas que de
  // verdad se van a pintar — el riel lee ESTE índice, nunca el del array
  // original, así que nunca se desalinea aunque un grupo cambie cuántas
  // filas ocupa al abrirse o cerrarse.
  const filas: FilaLateral[] = [];
  items.forEach((it) => {
    if (esGrupo(it)) {
      filas.push({ tipo: "grupo", item: it });
      if (gruposAbiertos[it.id]) {
        it.hijos.forEach((h, idx) =>
          filas.push({ tipo: "item", item: h, indentada: true, ordenEnGrupo: idx, grupoId: it.id })
        );
      }
    } else {
      filas.push({ tipo: "item", item: it, indentada: false, ordenEnGrupo: 0 });
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
          : !gruposAbiertos[f.item.id]
            ? Math.max(-1, ...f.item.hijos.filter((h) => activo(h.href)).map((h) => h.href.length))
            : -1;
      if (largo > mejorLargo) {
        mejorLargo = largo;
        indiceActivo = i;
      }
    });
  }

  return (
    <div>
      {/* Con un solo grupo el título sobra: sería una etiqueta para TODO el
          menú, que es justo el ruido que se estaba sacando. Una Encargada ve
          las tres filas sin encabezado; el Líder ve los dos nombres. */}
      {titulo && <p className="label-cayla px-4 pb-3 text-[11px] text-tinta/65">{titulo}</p>}
      <div className="relative flex flex-col" style={{ gap: AIRE_FILA }}>
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
        {filas.map((f, n) => {
          const esActivo = n === indiceActivo;

          if (f.tipo === "grupo") {
            const abierto = gruposAbiertos[f.item.id] ?? false;
            const contieneActivo = f.item.hijos.some((h) => activo(h.href));
            return (
              <button
                key={f.item.id}
                type="button"
                onClick={() => onToggleGrupo(f.item.id)}
                aria-expanded={abierto}
                style={{ height: ALTO_FILA }}
                className={`group relative flex items-center gap-3.5 rounded-lg pl-4 pr-3 text-sm transition-colors ${
                  esActivo ? "bg-sand/70 font-medium text-tinta" : "text-tinta/80 hover:bg-sand/40 hover:text-rojo"
                }`}
              >
                <Icono
                  d={f.item.icono}
                  className={`h-5 w-5 shrink-0 transition-colors duration-300 ease-cayla ${
                    esActivo || contieneActivo ? "text-tinta" : "text-tinta/60 group-hover:text-rojo"
                  }`}
                />
                <span className="flex-1 text-left">{f.item.etiqueta}</span>
                {/* Cerrado, el grupo no muestra a sus hijas: el número sube a la cabecera para que se vea igual. */}
                {!abierto && <Insignia n={f.item.hijos.reduce((n, h) => n + (h.contador ?? 0), 0)} etiqueta="por atender" />}
                <Icono
                  d={IC.chevron}
                  className={`h-3.5 w-3.5 shrink-0 text-tinta/50 transition-transform duration-300 ease-cayla ${
                    abierto ? "rotate-90" : ""
                  }`}
                />
              </button>
            );
          }

          const tocado = f.indentada && f.grupoId ? (gruposTocados[f.grupoId] ?? false) : false;
          return (
            <Link
              key={f.item.href}
              href={f.item.href}
              aria-current={esActivo ? "page" : undefined}
              style={{
                height: ALTO_FILA,
                animationDelay: tocado ? `${f.ordenEnGrupo * 30}ms` : undefined,
              }}
              className={`group relative flex items-center gap-3.5 rounded-lg pr-3 text-sm transition-colors ${
                f.indentada ? "pl-9" : "pl-4"
              } ${esActivo ? "bg-sand/70 font-medium text-tinta" : "text-tinta/80 hover:bg-sand/40 hover:text-rojo"} ${
                tocado ? "anim-revelar" : ""
              }`}
            >
              {/* Marca fantasma: al pasar el mouse por una fila apagada aparece
                  el riel en gris, en el mismo sitio exacto donde va a quedar el
                  rojo si sueltas el clic. Se lee "estás acá / irías allá" — es
                  el riel mostrando su próximo destino, no un efecto aparte. */}
              {!esActivo && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-0 top-1/2 w-[2px] -translate-y-1/2 scale-y-0 rounded-full bg-tinta/30 transition-transform duration-200 ease-cayla group-hover:scale-y-100"
                  style={{ height: ALTO_RIEL }}
                />
              )}
              <Icono
                d={f.item.icono}
                className={`h-5 w-5 shrink-0 transition-[transform,color] duration-300 ease-cayla ${
                  esActivo ? "text-tinta" : "text-tinta/60 group-hover:translate-x-0.5 group-hover:text-rojo"
                }`}
              />
              <span className="flex-1">{f.item.etiqueta}</span>
              <Insignia n={f.item.contador ?? 0} etiqueta="por atender" />
            </Link>
          );
        })}
      </div>
    </div>
  );
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

export function AppShell({ persona, ubicaciones, trasladosPorAtender, children }: Props) {
  const pathname = usePathname();
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [perfilAbierto, setPerfilAbierto] = useState(false);
  const disparadorNuevo = useRef<HTMLButtonElement | null>(null);
  const esLider = persona.rol === "lider";

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
    // «Recibir mercadería» (/recibir) vive en Compras para el líder y en Inventario para quien no lo es.
    compras: ["/compras", "/compras/proveedores", "/compras/por-pagar", ...(esLider ? ["/recibir"] : [])],
    inventario: ["/inventario", "/inventario/movimientos", "/inventario/traslados", "/inventario/conteo", "/inventario/resumen", ...(esLider ? [] : ["/recibir"])],
  };
  const grupoActivo = Object.entries(RUTAS_POR_GRUPO).find(([, rutas]) => rutas.some((h) => activo(h)))?.[0] ?? null;

  const [gruposAbiertos, setGruposAbiertos] = useState<Record<string, boolean>>(() =>
    grupoActivo ? { [grupoActivo]: true } : {}
  );
  // Recién en `true` tras el primer toggle/auto-apertura DE ESE grupo: sigue
  // en `false` al montar aunque `grupoActivo` ya lo haya abierto arriba —
  // esa apertura inicial es la foto de siempre, no una revelación que deba
  // animarse.
  const [gruposTocados, setGruposTocados] = useState<Record<string, boolean>>({});

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
      setGruposTocados((g) => ({ ...g, [grupoActivo]: true }));
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
  const colaboradores: Item = { href: "/colaboradores", etiqueta: "Colaboradores", icono: IC.colaboradores };
  const produccion: Item = { href: "/produccion", etiqueta: "Producción", icono: IC.produccion };
  // Producción (revertido 2026-09-17, pedido de Felipe): vuelve a verse SOLO
  // parado en el Taller, líder incluido. La "restauración" del 15-sep dejaba
  // Producción visible para el líder aunque estuviera parado en una tienda —
  // justo la inconsistencia que se pidió corregir: el menú debe reflejar
  // siempre dónde estás parado, igual que Vender/Inventario/Compras. Si el
  // líder necesita decidir qué se fabrica, se para en el Taller con el
  // selector de ubicación, como con cualquier otra pantalla operativa.
  const veProduccion = persona.ubicacionTipo === "taller";

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
  // `ComprasNav.tsx` (pedido de Felipe, 2026-09-16, mismo criterio que
  // Catálogo: "generalizado y ordenado"). Líder-only, como ya era la
  // "Compras" plana que reemplaza — registra facturas y pagos a proveedor.
  const grupoCompras: ItemGrupo = {
    id: "compras",
    etiqueta: "Compras",
    icono: IC.compras,
    hijos: [proveedores, facturas, recibirMercaderia, porPagar],
  };

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
        ...(veProduccion ? [produccion] : []),
        ...(esLider ? [grupoCompras] : []),
        grupoVenta,
        grupoInventario,
      ],
    },
  ].filter((g) => g.items.length > 0);

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
    <div className="min-h-screen bg-crema">
      {/* ==================== Lateral (escritorio) ==================== */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-lateral flex-col border-r border-tinta/10 bg-crema sm:flex">
        <Link href="/" className="group flex items-center gap-3 px-7 pb-6 pt-7">
          <Image
            src="/cayla-isotipo.png"
            alt="CAYLA"
            width={32}
            height={32}
            priority
            className="h-8 w-auto transition-transform duration-500 ease-cayla group-hover:scale-105"
          />
          <span className="label-cayla text-sm text-tinta transition-colors group-hover:text-rojo" style={{ letterSpacing: "0.26em" }}>
            CAYLA
          </span>
        </Link>

        <div className="px-3 pb-7">
          <Boton peso="primario" onClick={abrirNuevo} className="w-full" aria-haspopup="menu" aria-expanded={nuevoAbierto}>
            <span className="flex items-center justify-center gap-2">
              <Icono d={IC.nuevo} className="h-3.5 w-3.5" /> Nuevo
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
              gruposTocados={gruposTocados}
              onToggleGrupo={(id) => {
                setGruposTocados((g) => ({ ...g, [id]: true }));
                setGruposAbiertos((g) => ({ ...g, [id]: !g[id] }));
              }}
            />
          ))}
        </nav>

        {/* El lateral terminaba en un vacío de media pantalla. La firma de la
            marca le da un piso al bloque de abajo, en vez de dejar el aire
            colgando entre el último ítem y la persona. */}
        <p className="font-display px-7 pb-5 pt-6 text-xs italic text-taupe-profundo">Donde el estilo transforma.</p>

        <div className="border-t border-tinta/10 px-7 py-5">
          <div className="flex items-center gap-3">
            {/* Botón, no <div>: abre "Mi perfil". Salir queda AFUERA de este
                botón, como hermano — un clic ahí nunca dispara el perfil. */}
            <button
              type="button"
              onClick={() => setPerfilAbierto(true)}
              className="group flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <span
                aria-hidden
                className="font-display flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sand text-sm text-tinta transition-colors group-hover:bg-rojo/15"
              >
                {iniciales}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-tinta transition-colors group-hover:text-rojo">{persona.nombre}</p>
                <p className="label-cayla mt-0.5 truncate text-[11px] text-tinta/65">
                  {esLider ? "Líder" : "Colaborador"} · {persona.ubicacionEtiqueta}
                </p>
              </div>
            </button>
            <LogoutButton />
          </div>
        </div>
      </aside>

      {perfilAbierto && <PerfilModal onClose={() => setPerfilAbierto(false)} />}

      {/* ==================== Cabecera ==================== */}
      {/* Translúcida + desenfoque: el contenido pasa POR DEBAJO al hacer scroll.
          No es decoración, es la única forma de que se note que hay más página
          arriba en vez de que el texto se corte contra una banda opaca. */}
      <header className="fixed inset-x-0 top-0 z-30 border-b border-tinta/10 bg-crema/85 backdrop-blur-md sm:left-lateral">
        <div className="flex items-center gap-3 px-4 py-2.5 sm:px-8 sm:py-3">
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
      <main className="px-4 pb-28 pt-20 sm:ml-lateral sm:px-10 sm:pb-12 sm:pt-24">
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
