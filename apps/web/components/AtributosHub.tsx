"use client";

import { Pestanas } from "@/components/ui/Pestanas";
import { ColoresLista } from "@/components/ColoresLista";
import { TallasLista } from "@/components/TallasLista";
import { TejidosLista } from "@/components/TejidosLista";
import { PatronesLista } from "@/components/PatronesLista";
import { TemporadasLista } from "@/components/TemporadasLista";
import type { ComponentProps } from "react";

/**
 * "Atributos" (2026-09-17, pedido de Felipe: "con 3 está bien") — reemplaza
 * a Colores/Tallas/Tejidos/Patrones/Etiquetas como 5 filas y 5 pantallas
 * sueltas del lateral. Las 5 siguen siendo el mismo mecanismo de siempre
 * (vocabulario cerrado: propone/aprueba/rechaza) con sus propias
 * mutaciones — esto solo las agrupa bajo una pestaña cada una, en vez de
 * cinco pantallas completas que un colaborador tenía que aprender a ubicar
 * por separado.
 *
 * Deliberadamente NO se fusionó la lógica de las 5 en un componente
 * genérico: Colores tiene hex/muestra/tipo, Tallas exige comentario al
 * aprobar, Etiquetas agrupa por estilo y vigencia — forzar un molde único
 * las hubiera llenado de `if` (principio 3, piezas pequeñas y componibles).
 * Lo que sí se unificó fue la presentación: cada acción con formulario
 * (agregar/aprobar-con-comentario/rechazar) pasó de un panel que se abría
 * dentro de la misma tarjeta a un modal — mismo lenguaje que "Vista rápida"
 * de Categorías y Productos.
 */

type Tipo = "colores" | "tallas" | "tejidos" | "patrones" | "temporadas";

// EL ORDEN ES DE RELEVANCIA, no cronológico ni alfabético:
//   (Sellos —Nuevo, Top ventas, Para liquidar— fue la primera pestaña hasta el 2026-10-22: desde ese día es su propia
//   entrada de Catálogo, Catálogo ▸ Insignias, con las campañas dentro. Felipe lo pidió.)
//   1. Colores y 2. Tallas — obligatorios: no existe una variante sin las dos, y
//      un colaborador las necesita al recibir mercadería. Colores va primero
//      porque es el que más se propone (35 vs 22).
//   3. Tejidos y 4. Patrones — opcionales, atributos del producto que además
//      dependen de la categoría. Patrones: es el vocabulario más chico.
//   5. Temporadas (ADR-0246) — también de la prenda y opcional, pero lista CERRADA
//      de nueve: aquí no se propone nada, se mira el calendario y se completa lo
//      que quedó «Sin temporada». Por eso va al final.
// La primera pestaña es también la que abre `/productos/atributos` sin `?tipo=`
// (ver `page.tsx`); las rutas viejas `/productos/colores` etc. siguen entrando
// directo a la suya.
const TABS: { tipo: Tipo; etiqueta: string; icono: string }[] = [
  // Gota: el color de la tela.
  { tipo: "colores", etiqueta: "Colores", icono: "M12 2.69l5.66 5.66a8 8 0 11-11.31 0z" },
  // Barras ascendentes: S, M, L — la progresión de una talla.
  { tipo: "tallas", etiqueta: "Tallas", icono: "M4 18h4M4 12h10M4 6h16" },
  // Cuadrícula 2x2: la trama de un tejido.
  { tipo: "tejidos", etiqueta: "Tejidos", icono: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
  // Rombos en quincunce: un estampado/patrón repetido.
  { tipo: "patrones", etiqueta: "Patrones", icono: "M12 2l2 2-2 2-2-2zM4 10l2 2-2 2-2-2zM20 10l2 2-2 2-2-2zM12 18l2 2-2 2-2-2zM12 10l2 2-2 2-2-2z" },
  // Medio sol y medio copo: las dos mitades del año (Primavera-Verano, Otoño-Invierno).
  {
    tipo: "temporadas",
    etiqueta: "Temporadas",
    icono: "M11 7a5 5 0 000 10zM11 3v2M11 19v2M5 6l1.4 1.4M5 18l1.4-1.4M2 12h2M17.5 7v10M13.2 9.5l8.6 5M13.2 14.5l8.6-5",
  },
];

const AYUDA: Record<Tipo, string> = {
  colores: "Vocabulario cerrado de color. Cualquiera propone, un Líder aprueba o rechaza.",
  tallas: "Vocabulario cerrado de talla. Aprobar exige un comentario: una talla mal aprobada ensucia la unicidad de variante y es más cara de deshacer con SKUs ya colgando.",
  tejidos: "Vocabulario cerrado de tejido — atributo del producto, no cambia entre tallas de la misma prenda. Haz clic en uno para ver su foto y las prendas que lo usan.",
  patrones: "Vocabulario cerrado de patrón/estampado — igual que tejido, atributo del producto. Haz clic en uno para ver su foto y las prendas que lo usan.",
  temporadas:
    "De qué temporada es la prenda: una sola, de una lista fija de nueve. La del color manda sobre la de la prenda, y la de la prenda sobre la de su categoría. Al empezar la estación que la termina, Frescura avisa «Temporada pasada» y sugiere qué hacer (nunca rebaja sola).",
};

function IconoTab({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function AtributosHub({
  tipo,
  colores,
  tallas,
  tejidos,
  patrones,
  prendasPorTejido = {},
  prendasPorPatron = {},
  puedeEditar,
  temporadas = null,
  esLider = false,
  veProductos = false,
  tipos,
}: {
  tipo: Tipo;
  colores: ComponentProps<typeof ColoresLista>["coloresIniciales"];
  tallas: ComponentProps<typeof TallasLista>["tallasIniciales"];
  tejidos: ComponentProps<typeof TejidosLista>["tejidosIniciales"];
  patrones: ComponentProps<typeof PatronesLista>["patronesIniciales"];
  /** Cuántas prendas usan cada tejido / patrón (ADR-0256). Solo se leen al abrir esas pestañas. */
  prendasPorTejido?: Record<string, number>;
  prendasPorPatron?: Record<string, number>;
  /** Colores, tallas, tejidos y patrones: el líder o la terminal administrativa (ADR-0160). */
  puedeEditar: boolean;
  /** Temporadas (ADR-0246): lo que armó el servidor al abrir esa pestaña, o la nota de por qué no pudo (su SQL todavía
   *  no está en esta base). `null` en las demás pestañas: no se lee. */
  temporadas?: ComponentProps<typeof TemporadasLista>["carga"];
  /** Corregir el calendario de estaciones: SOLO el líder (y los Admin, que lo son). Asignar temporadas usa `puedeEditar`. */
  esLider?: boolean;
  /** La cuenta ve el módulo «Productos» (ADR-0161): solo entonces «Sin temporada» y el detalle de un tejido o patrón
   *  enlazan a la ficha de cada prenda. */
  veProductos?: boolean;
  /** Las pestañas que ve esta cuenta. Ausente = todas. */
  tipos?: readonly Tipo[];
}) {
  // La pestaña activa vive en la URL (`?tipo=`), no en estado de React —
  // mismo patrón que Grilla/Tabla en `/productos`. Con estado local
  // (`useState(tipoInicial)`) un enlace viejo a `/productos/tallas`
  // (redirige acá vía `next.config.ts`) mostraba la pestaña de la visita
  // ANTERIOR en esta misma sesión: React reusa la instancia del componente
  // entre navegaciones del App Router y un `useState` solo lee su valor
  // inicial una vez, nunca de nuevo — bug real, no hipotético, encontrado
  // verificando el redirect en el navegador antes de darlo por bueno.
  // El generador de dibujos de Tejidos y Patrones pinta con los colores activos del catálogo (ADR-0256).
  const coloresDibujo = colores.filter((c) => c.activo && c.hex).map((c) => ({ nombre: c.nombre, hex: c.hex as string, sinonimos: c.sinonimos }));

  return (
    <div className="space-y-5">
      {/* Cada atributo es otra sección (otra lista, otras acciones): la pestaña de vista del sistema (ADR-0358), con su icono. */}
      <Pestanas
        etiquetaAccesible="Atributos"
        idIndicador="atributos-secciones"
        guia="atributos.pestanas"
        activa={tipo}
        items={TABS.filter((t) => !tipos || tipos.includes(t.tipo)).map((t) => ({
          clave: t.tipo,
          etiqueta: t.etiqueta,
          href: `/productos/atributos?tipo=${t.tipo}`,
          guia: `atributos.pestana-${t.tipo}`,
          icono: <IconoTab d={t.icono} />,
        }))}
      />

      <p data-guia="atributos.ayuda" className="text-xs text-tinta/60">{AYUDA[tipo]}</p>

      {tipo === "colores" && <ColoresLista coloresIniciales={colores} puedeEditar={puedeEditar} />}
      {tipo === "tallas" && <TallasLista tallasIniciales={tallas} puedeEditar={puedeEditar} />}
      {tipo === "tejidos" && <TejidosLista tejidosIniciales={tejidos} puedeEditar={puedeEditar} prendasPorId={prendasPorTejido} veProductos={veProductos} colores={coloresDibujo} />}
      {tipo === "patrones" && <PatronesLista patronesIniciales={patrones} puedeEditar={puedeEditar} prendasPorId={prendasPorPatron} veProductos={veProductos} colores={coloresDibujo} />}
      {tipo === "temporadas" && <TemporadasLista carga={temporadas} puedeEditar={puedeEditar} esLider={esLider} veProductos={veProductos} />}
    </div>
  );
}
