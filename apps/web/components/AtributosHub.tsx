"use client";

import Link from "next/link";
import { ColoresLista } from "@/components/ColoresLista";
import { TallasLista } from "@/components/TallasLista";
import { TejidosLista } from "@/components/TejidosLista";
import { PatronesLista } from "@/components/PatronesLista";
import { EtiquetasLista } from "@/components/EtiquetasLista";
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

type Tipo = "colores" | "tallas" | "tejidos" | "patrones" | "etiquetas";

// EL ORDEN ES DE RELEVANCIA, no cronológico ni alfabético:
//   1. Etiquetas — lo comercial: campañas, fechas y descuentos. Es lo único que
//      cambia cada semana y lo que toca el precio.
//   2. Colores y 3. Tallas — obligatorios: no existe una variante sin las dos, y
//      un colaborador las necesita al recibir mercadería. Colores va primero
//      porque es el que más se propone (35 vs 22).
//   4. Tejidos y 5. Patrones — opcionales, atributos del producto que además
//      dependen de la categoría. Patrones al final: es el vocabulario más chico.
// La primera pestaña es también la que abre `/productos/atributos` sin `?tipo=`
// (ver `page.tsx`); las rutas viejas `/productos/colores` etc. siguen entrando
// directo a la suya.
const TABS: { tipo: Tipo; etiqueta: string; icono: string }[] = [
  // Cinta de marcapáginas — distinta del colgante de Categorías a propósito.
  { tipo: "etiquetas", etiqueta: "Etiquetas", icono: "M6 3h12a1 1 0 011 1v16l-7-4-7 4V4a1 1 0 011-1z" },
  // Gota: el color de la tela.
  { tipo: "colores", etiqueta: "Colores", icono: "M12 2.69l5.66 5.66a8 8 0 11-11.31 0z" },
  // Barras ascendentes: S, M, L — la progresión de una talla.
  { tipo: "tallas", etiqueta: "Tallas", icono: "M4 18h4M4 12h10M4 6h16" },
  // Cuadrícula 2x2: la trama de un tejido.
  { tipo: "tejidos", etiqueta: "Tejidos", icono: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
  // Rombos en quincunce: un estampado/patrón repetido.
  { tipo: "patrones", etiqueta: "Patrones", icono: "M12 2l2 2-2 2-2-2zM4 10l2 2-2 2-2-2zM20 10l2 2-2 2-2-2zM12 18l2 2-2 2-2-2zM12 10l2 2-2 2-2-2z" },
];

const AYUDA: Record<Tipo, string> = {
  colores: "Vocabulario cerrado de color. Cualquiera propone, un Líder aprueba o rechaza.",
  tallas: "Vocabulario cerrado de talla. Aprobar exige un comentario: una talla mal aprobada ensucia la unicidad de variante y es más cara de deshacer con SKUs ya colgando.",
  tejidos: "Vocabulario cerrado de tejido — atributo del producto, no cambia entre tallas de la misma prenda.",
  patrones: "Vocabulario cerrado de patrón/estampado — igual que tejido, atributo del producto.",
  etiquetas: "Marcas comerciales que se le ponen a una prenda (Nuevo, Black Friday, Para liquidar). No es la etiqueta física de código de barras.",
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
  etiquetas,
  puedeEditar,
}: {
  tipo: Tipo;
  colores: ComponentProps<typeof ColoresLista>["coloresIniciales"];
  tallas: ComponentProps<typeof TallasLista>["tallasIniciales"];
  tejidos: ComponentProps<typeof TejidosLista>["tejidosIniciales"];
  patrones: ComponentProps<typeof PatronesLista>["patronesIniciales"];
  etiquetas: ComponentProps<typeof EtiquetasLista>["etiquetasIniciales"];
  puedeEditar: boolean;
}) {
  // La pestaña activa vive en la URL (`?tipo=`), no en estado de React —
  // mismo patrón que Grilla/Tabla en `/productos`. Con estado local
  // (`useState(tipoInicial)`) un enlace viejo a `/productos/tallas`
  // (redirige acá vía `next.config.ts`) mostraba la pestaña de la visita
  // ANTERIOR en esta misma sesión: React reusa la instancia del componente
  // entre navegaciones del App Router y un `useState` solo lee su valor
  // inicial una vez, nunca de nuevo — bug real, no hipotético, encontrado
  // verificando el redirect en el navegador antes de darlo por bueno.
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-0.5 rounded-lg bg-sand p-0.5">
        {TABS.map((t) => (
          <Link
            key={t.tipo}
            href={`/productos/atributos?tipo=${t.tipo}`}
            aria-current={tipo === t.tipo ? "page" : undefined}
            className={`label-cayla flex items-center gap-1.5 rounded-md px-3 py-2 text-[10.5px] transition-colors ${
              tipo === t.tipo ? "bg-papel text-tinta" : "text-tinta/60 hover:text-tinta"
            }`}
          >
            <IconoTab d={t.icono} />
            {t.etiqueta}
          </Link>
        ))}
      </div>

      <p className="text-xs text-tinta/60">{AYUDA[tipo]}</p>

      {tipo === "colores" && <ColoresLista coloresIniciales={colores} puedeEditar={puedeEditar} />}
      {tipo === "tallas" && <TallasLista tallasIniciales={tallas} puedeEditar={puedeEditar} />}
      {tipo === "tejidos" && <TejidosLista tejidosIniciales={tejidos} puedeEditar={puedeEditar} />}
      {tipo === "patrones" && <PatronesLista patronesIniciales={patrones} puedeEditar={puedeEditar} />}
      {tipo === "etiquetas" && <EtiquetasLista etiquetasIniciales={etiquetas} puedeEditar={puedeEditar} />}
    </div>
  );
}
