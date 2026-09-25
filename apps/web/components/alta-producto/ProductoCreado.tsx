"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// La pantalla de éxito de "Nuevo producto" (ADR-0109, paso 4). Crear un
// producto casi nunca es la última tarea: falta la foto de cada color, y una
// colección son 10 prendas parecidas. Volver a la lista dejaba a la persona a
// empezar de cero en cada una y sin nadie que le recordara las fotos.
//
// Tres salidas, y solo una es la principal (fotos): sin foto, la grilla de
// Productos muestra apenas el tono del color.
//
// Las fotos elegidas en el alta ya se subieron al llegar aquí (NuevoProductoForm, después de crear el producto). Esta
// pantalla dice cuántas quedaron, cuál no subió y qué colores siguen sin foto; para agregar o cambiar, lleva a la
// galería de la edición (`/productos/{id}/editar#fotos`), que ya asigna cada foto a su color.

export type ResumenCreado = {
  id: string;
  nombre: string;
  categoria: string;
  variantes: number;
  colores: { codigo: string; nombre: string; hex: string | null }[];
  /** Resultado de subir las fotos elegidas en el alta. */
  fotos: { subidas: number; fallidas: string[]; coloresConFoto: string[] };
};

export function ProductoCreado({ creado, onOtroParecido }: { creado: ResumenCreado; onOtroParecido: () => void }) {
  const titulo = useRef<HTMLHeadingElement>(null);
  const faltanColores = creado.colores.filter((c) => !creado.fotos.coloresConFoto.includes(c.codigo));
  const completas = creado.fotos.fallidas.length === 0 && creado.fotos.subidas > 0 && faltanColores.length === 0;
  const [codigo, setCodigo] = useState<string | null>(null);

  // Lleva el foco al mensaje: quien usa lector de pantalla o teclado se entera de que se guardó.
  useEffect(() => {
    titulo.current?.focus();
    window.scrollTo({ top: 0 });
  }, []);

  // El código real lo asigna la base al guardar. Si esta lectura falla no pasa nada: el producto ya existe.
  useEffect(() => {
    let vivo = true;
    createClient()
      .from("productos")
      .select("codigo")
      .eq("id", creado.id)
      .maybeSingle()
      .then(({ data }) => {
        if (vivo && data?.codigo) setCodigo(data.codigo);
      });
    return () => {
      vivo = false;
    };
  }, [creado.id]);

  return (
    <div className="space-y-5">
      <div role="status" className="card-cayla flex items-start gap-4 p-5">
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-verde text-crema">
          ✓
        </span>
        <div>
          <h2 ref={titulo} tabIndex={-1} className="font-display text-xl text-tinta outline-none">
            Se creó {creado.nombre}
          </h2>
          <p className="mt-1 text-sm text-tinta/70">
            {creado.categoria} · {creado.variantes} variante{creado.variantes === 1 ? "" : "s"}
            {codigo && (
              <>
                {" · "}
                <span className="font-mono tabular-nums">{codigo}</span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* La salida principal: las fotos (lo que falte de ellas) */}
        <div className="card-cayla flex flex-col justify-between gap-4 border-tinta/40 p-5">
          <div className="space-y-2">
            <p className="label-cayla text-[11px] text-tinta/70">{completas ? "Listo" : "Falta"}</p>
            <h3 className="text-base font-medium text-tinta">
              {creado.fotos.subidas > 0 ? `${creado.fotos.subidas} foto${creado.fotos.subidas === 1 ? "" : "s"} guardada${creado.fotos.subidas === 1 ? "" : "s"}` : "Las fotos"}
            </h3>
            {creado.fotos.fallidas.length > 0 && (
              <p role="alert" className="text-sm text-rojo-profundo">
                {creado.fotos.fallidas.length === 1 ? "Una foto no se guardó" : `${creado.fotos.fallidas.length} fotos no se guardaron`}: {creado.fotos.fallidas.join(" · ")}. El producto sí se creó; agrégala desde el producto.
              </p>
            )}
            <p className="text-sm text-tinta/70">
              {completas
                ? "Cada color tiene su foto. Puedes cambiarlas o agregar más desde el producto."
                : faltanColores.length > 0
                  ? "Estos colores todavía no tienen foto. Mientras no haya, la grilla de Productos muestra solo el tono."
                  : "Sube las fotos del producto. Mientras no haya, la grilla de Productos muestra solo un recuadro."}
            </p>
            {faltanColores.length > 0 && (
              <ul className="flex flex-wrap gap-1.5 pt-1">
                {faltanColores.map((c) => (
                  <li key={c.codigo} className="flex items-center gap-1.5 rounded-md border border-tinta/15 px-2 py-1 text-xs text-tinta/80">
                    {c.hex && <span aria-hidden className="h-2.5 w-2.5 rounded-full border border-tinta/20" style={{ background: c.hex }} />}
                    {c.nombre}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link href={`/productos/${creado.id}/editar#fotos`} className={`btn-cayla ${completas ? "btn-secundario" : "btn-primario"}`}>
            {completas ? "Ver las fotos" : "Agregar fotos"}
          </Link>
        </div>

        <div className="card-cayla flex flex-col justify-between gap-4 p-5">
          <div className="space-y-2">
            <p className="label-cayla text-[11px] text-tinta/70">Otra prenda de la colección</p>
            <h3 className="text-base font-medium text-tinta">Crear otro parecido</h3>
            <p className="text-sm text-tinta/70">
              Empiezas con la misma categoría, marca, proveedor, tallas, tejido, patrón, precio, costo y etiquetas. Solo cambias el nombre y los colores.
            </p>
          </div>
          <button
            type="button"
            onClick={onOtroParecido}
            className="label-cayla rounded-md border border-tinta/30 px-3 py-2.5 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo"
          >
            Crear otro parecido
          </button>
        </div>

        <div className="card-cayla flex flex-col justify-between gap-4 p-5">
          <div className="space-y-2">
            <p className="label-cayla text-[11px] text-tinta/70">Terminé</p>
            <h3 className="text-base font-medium text-tinta">Ir a productos</h3>
            <p className="text-sm text-tinta/70">Vuelve a la lista. Las fotos se pueden agregar después desde el producto.</p>
          </div>
          <Link
            href="/productos"
            className="label-cayla rounded-md border border-tinta/30 px-3 py-2.5 text-center text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo"
          >
            Ir a productos
          </Link>
        </div>
      </div>
    </div>
  );
}
