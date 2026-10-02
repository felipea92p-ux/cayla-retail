"use client";

import { useState } from "react";
import Image from "next/image";
import { vistaDeFotos, type FotoLocal } from "@/lib/fotos-por-color-reglas";
import { compararTallas } from "@/lib/tallas";
import type { FilaFicha } from "@/lib/variantes-ficha-reglas";
import { AjusteDeStock } from "./AjusteDeStock";
import { PuntoColor, type ContextoFicha } from "./piezas";

// Panel del taller (2026-10-02): la columna derecha que usa el ancho que ADR-0257 dejó libre al quitar el panel de
// guardado. A diferencia de ese panel viejo, este NO guarda nada — es un espejo de solo lectura (identidad, foto por
// color, stock por talla) salvo el lápiz de «Ajustar stock», que es el MISMO `AjusteDeStock` que ya vive en la lista de
// variantes de abajo (mismo `AjustarInventarioModal`, mismo motivo/sede/responsable: no se reinventa el ajuste).
// Decidido con Felipe tras 3 maquetas (docs/maquetas/producto-editar-rediseno-2026-10/): la B, «Panel del taller».
//
// «Cambiar foto» no duplica el subidor de `FotosPorColor` (esa pieza ya sabe subir, reemplazar y quitar fotos por
// color) — solo lleva la vista hasta la sección «Fotos», con el mismo scroll que ya usa la guía de foco (`#fotos`).

export function PanelDelTaller({
  identidad,
  ctx,
  filas,
  fotosVista,
  nombreColor,
  nombreTalla,
}: {
  identidad: {
    codigo: string | null;
    nombre: string;
    categoria: string | null;
    marca: string | null;
    tejido: string | null;
  };
  ctx: ContextoFicha;
  filas: readonly FilaFicha[];
  fotosVista: readonly FotoLocal[];
  nombreColor: (codigo: string | null) => string;
  nombreTalla: (id: string | null) => string;
}) {
  // Los colores con alguna variante activa, en el orden en que aparecen en la ficha (igual que `coloresConVariantesActivas`,
  // pero acá basta el orden de aparición: no hace falta traer esa regla solo para esto).
  const colores = [...new Set(filas.filter((f) => f.activo).map((f) => f.colorCodigo))];
  const [colorElegido, setColorElegido] = useState<string | null>(colores[0] ?? null);
  const colorActivo = colores.includes(colorElegido) ? colorElegido : (colores[0] ?? null);

  const vista = vistaDeFotos(colores, fotosVista as FotoLocal[]);
  const tarjetaDelColor = vista.tarjetas.find((t) => t.codigo === colorActivo);
  const fotoPrincipal = tarjetaDelColor?.fotos[0] ?? vista.general.fotos[0] ?? null;

  const filasDelColor = filas
    .filter((f) => f.activo && f.colorCodigo === colorActivo)
    .slice()
    .sort((a, b) => compararTallas(nombreTalla(a.tallaId), nombreTalla(b.tallaId)));

  const activas = filas.filter((f) => f.activo);
  const precios = activas.map((f) => Number(f.precio)).filter((n) => n > 0);
  const precioMin = precios.length ? Math.min(...precios) : null;
  const precioMax = precios.length ? Math.max(...precios) : null;

  function irAFotos() {
    const el = document.getElementById("fotos");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.animate(
      [{ backgroundColor: "var(--color-hueso)" }, { backgroundColor: "var(--color-papel)" }],
      { duration: 900, easing: "cubic-bezier(.32,.72,.24,1)" },
    );
  }

  return (
    <aside aria-label="Panel del taller" className="hidden space-y-3 lg:sticky lg:top-6 lg:block">
      <div className="card-cayla overflow-hidden">
        <div className="relative aspect-[4/3] bg-hueso">
          {fotoPrincipal ? (
            <Image src={fotoPrincipal.url} alt="" fill sizes="340px" className="object-cover" unoptimized />
          ) : (
            <div className="grid h-full place-items-center px-6 text-center text-[12.5px] text-ambar-profundo">
              {colorActivo ? `Sin foto de ${nombreColor(colorActivo)} todavía` : "Sin fotos todavía"}
            </div>
          )}
          <button
            type="button"
            onClick={irAFotos}
            className="absolute bottom-2.5 right-2.5 rounded-full bg-tinta/80 px-3 py-1.5 text-[11.5px] font-semibold text-crema backdrop-blur transition-colors hover:bg-tinta"
          >
            {fotoPrincipal ? "Cambiar foto" : "+ Agregar foto"}
          </button>
        </div>
        {colores.length > 0 && (
          <div className="flex flex-wrap gap-2 p-3">
            {colores.map((c) => (
              <button
                key={c ?? "sin-color"}
                type="button"
                onClick={() => setColorElegido(c)}
                aria-pressed={c === colorActivo}
                aria-label={nombreColor(c)}
                title={nombreColor(c)}
                className={`rounded-full p-0.5 transition-shadow ${c === colorActivo ? "shadow-[0_0_0_2px_var(--color-tinta)]" : "shadow-[0_0_0_1.5px_var(--color-sand)] hover:shadow-[0_0_0_1.5px_var(--color-taupe)]"}`}
              >
                <PuntoColor codigo={c} colores={ctx.colores} />
              </button>
            ))}
          </div>
        )}
        <div className="border-t border-sand px-4 py-3.5">
          {identidad.codigo && <p className="font-mono text-[12px] text-taupe">{identidad.codigo}</p>}
          <p className="font-display mt-0.5 text-xl leading-tight text-tinta">{identidad.nombre || "Sin nombre"}</p>
          <p className="text-[12.5px] text-taupe">
            {identidad.categoria ?? "Sin categoría"}
            {identidad.marca && ` · ${identidad.marca}`}
            {identidad.tejido && ` · ${identidad.tejido}`}
          </p>
        </div>
      </div>

      {colorActivo && filasDelColor.length > 0 && (
        <div className="card-cayla space-y-2.5 p-4">
          <p className="label-cayla flex items-center justify-between text-[11px] text-tinta/65">
            <span>Stock por talla</span>
            <span>{nombreColor(colorActivo)}</span>
          </p>
          <ul className="space-y-1.5">
            {filasDelColor.map((f) => {
              const e = f.id && ctx.estado ? ctx.estado[f.id] : undefined;
              const stock = e ? e.stock : f.guardada ? 0 : null;
              const tallaTxt = nombreTalla(f.tallaId) || "Sin talla";
              return (
                <li key={f.clave} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="font-medium text-tinta">{tallaTxt}</span>
                  <span className="flex items-center tabular-nums text-tinta">
                    {stock === null ? "—" : `${stock} u.`}
                    {f.guardada && (
                      <AjusteDeStock
                        ajuste={ctx.ajusteStock}
                        colorNombre={nombreColor(colorActivo)}
                        forma="lapiz"
                        descripcion={`${nombreColor(colorActivo)} · ${tallaTxt}`}
                      />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {precioMin !== null && (
        <div className="card-cayla flex items-center justify-between p-4">
          <span className="label-cayla text-[11px] text-tinta/65">Precio de la prenda</span>
          <span className="font-display text-lg text-tinta">
            {precioMax !== null && precioMax !== precioMin ? `S/ ${precioMin.toFixed(0)} – ${precioMax.toFixed(0)}` : `S/ ${precioMin.toFixed(2)}`}
          </span>
        </div>
      )}
    </aside>
  );
}
