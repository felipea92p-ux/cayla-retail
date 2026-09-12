"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Navegación de dos niveles (rediseño 2026-09-12, ver docs/diseno/catalogo-vocabulario-2026-09-12/).
//
// ANTES: 9 pestañas planas en una sola fila — Proveedores, Compras, Recibir,
// Almacén, Catálogo, Conteo, Etiquetas, Importar, Vocabulario — mezclando el
// VOCABULARIO (qué ES una prenda: categorías, colores, modelo/variante) con
// los FLUJOS OPERATIVOS que lo usan (comprar, recibir, contar, etiquetar,
// importar). Consecuencia real, documentada en
// docs/datos/modulos/02-catalogo-y-vocabulario.md (hueco 1): "Vocabulario"
// —donde se agregaría un color nuevo— quedaba en la posición 9 de 9, y la
// pantalla para agregar un color directamente no existía.
//
// AHORA: un primer nivel de solo dos opciones (Catálogo / Operación), y
// dentro de Catálogo, tres subtemas —Modelos, Categorías, Colores— cada uno
// con su propia pantalla. Validado contra dos sistemas reales del mismo
// dominio: Shopify separa Productos/Variantes de Colecciones; Square for
// Retail usa categorías anidadas simples, cada una con su propia pantalla —
// ninguno amontona todo en una fila de pestañas.
const SUBTEMAS_CATALOGO = [
  { href: "/inventario", etiqueta: "Modelos" },
  { href: "/inventario/categorias", etiqueta: "Categorías" },
  { href: "/inventario/colores", etiqueta: "Colores" },
];

const OPERACION = [
  { href: "/inventario/proveedores", etiqueta: "Proveedores" },
  { href: "/inventario/compras", etiqueta: "Compras" },
  { href: "/inventario/recibir", etiqueta: "Recibir" },
  { href: "/inventario/almacen", etiqueta: "Almacén" },
  { href: "/inventario/conteo", etiqueta: "Conteo" },
  { href: "/inventario/etiquetas", etiqueta: "Etiquetas" },
  { href: "/inventario/importar", etiqueta: "Importar" },
];

function tabCls(activo: boolean) {
  return `label-cayla -mb-px shrink-0 border-b-2 px-3 pb-2.5 pt-1 text-[11px] transition-colors ${
    activo ? "border-rojo text-tinta" : "border-transparent text-tinta/65 hover:text-rojo"
  }`;
}

export function InventarioNav() {
  const pathname = usePathname();
  const enOperacion = OPERACION.some((s) => pathname === s.href || pathname.startsWith(s.href + "/"));
  const nivel1 = enOperacion ? "operacion" : "catalogo";

  return (
    <div className="space-y-3">
      <div className="flex gap-6 border-b border-tinta/10">
        <Link href="/inventario" className={tabCls(nivel1 === "catalogo")}>
          Catálogo
        </Link>
        <Link href="/inventario/proveedores" className={tabCls(nivel1 === "operacion")}>
          Operación
        </Link>
      </div>

      {nivel1 === "catalogo" ? (
        <div className="flex flex-wrap gap-2">
          {SUBTEMAS_CATALOGO.map((s) => {
            const activo = s.href === "/inventario" ? pathname === s.href : pathname.startsWith(s.href);
            return (
              <Link
                key={s.href}
                href={s.href}
                className={`label-cayla rounded-lg border px-3.5 py-2 text-[11px] transition-colors ${
                  activo
                    ? "border-tinta bg-tinta text-crema"
                    : "border-tinta/15 bg-papel text-tinta/70 hover:border-rojo hover:text-rojo"
                }`}
              >
                {s.etiqueta}
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="flex gap-1 overflow-x-auto">
          {OPERACION.map((s) => {
            const activo = pathname === s.href || pathname.startsWith(s.href + "/");
            return (
              <Link key={s.href} href={s.href} className={tabCls(activo)}>
                {s.etiqueta}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
