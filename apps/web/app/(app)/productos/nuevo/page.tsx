import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { ProductosNav } from "@/components/ProductosNav";
import { ProductoForm } from "@/components/ProductoForm";

// Alta de producto (V2) — la pantalla que el comentario de
// app/(app)/productos/page.tsx dejaba para "Fase 2". `fn_es_lider()` ya
// exige Líder para escribir en `productos`/`variantes` (0004_rls.sql); acá
// se corta antes por cortesía, con el mismo mensaje que ya usan
// /productos/categorias y /productos/colores para el mismo candado.
export default async function NuevoProductoPage() {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") redirect("/productos");

  const supabase = await createClient();
  const [categorias, colores] = await Promise.all([
    exigir(
      await supabase.from("categorias").select("id, nombre, prefijo").eq("activo", true).order("familia").order("nombre"),
      "las categorías del catálogo"
    ),
    exigir(await supabase.from("colores").select("codigo, nombre, hex").eq("activo", true).order("orden").order("nombre"), "los colores del vocabulario"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">
          <Link href="/productos" className="hover:text-rojo">
            Productos
          </Link>{" "}
          · Nuevo
        </p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Nuevo producto</h1>
      </div>

      <ProductosNav />

      <ProductoForm categorias={categorias} colores={colores} />
    </div>
  );
}
