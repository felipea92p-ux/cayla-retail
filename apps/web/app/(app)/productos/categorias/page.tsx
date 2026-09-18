import Link from "next/link";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { Ayuda } from "@/components/Ayuda";
import { CategoriasLista } from "@/components/CategoriasLista";
import { getEjesPorCategoria } from "@/lib/catalogo-v2";
import type { Familia } from "@cayla-retail/shared";

// Portado de `trix/catalogo-vocabulario` (V1) tras ADR-0095: familia+prefijo
// ya viven en `retail.categorias`, esta es la pantalla que le faltaba.
export default async function CategoriasPage() {
  const persona = await requirePersonaActualV2();
  const supabase = await createClient();

  // Trae activas E inactivas: las inactivas no se agrupan por familia (una
  // sección aparte, al fondo, con "Reactivar" — mismo patrón que
  // ProveedoresPanel), pero tienen que llegar a la pantalla para poder
  // reactivarlas. Antes de esta pantalla de edición solo se leían las
  // activas porque no había forma de volver de un desactivado.
  const [res, resFamilias, resTallas, resTejidos, resPatrones, ejesPorCategoria] = await Promise.all([
    supabase
      .from("categorias")
      .select("id, familia, nombre, prefijo, activo, categoria_padre_id, notas")
      .order("familia")
      .order("nombre"),
    // Solo activas: una familia con categorías activas colgando no se puede
    // desactivar (fn_familias_desactivar_candado), así que el selector de
    // familia nunca necesita ofrecer una inactiva.
    supabase.from("familias").select("codigo, nombre").eq("activo", true).order("orden"),
    supabase.from("tallas").select("id, valor").eq("activo", true).eq("estado", "aprobado").order("valor"),
    supabase.from("tejidos").select("id, nombre").eq("activo", true).eq("estado", "aprobado").order("nombre"),
    supabase.from("patrones").select("id, nombre").eq("activo", true).eq("estado", "aprobado").order("nombre"),
    getEjesPorCategoria(),
  ]);
  const filas = exigir(res, "las categorías del catálogo");
  const familias = exigir(resFamilias, "las familias del catálogo");
  // El universo completo de valores aprobados, para ofrecer en el selector
  // de "qué tallas/tejidos/patrones ofrece esta categoría" — distinto de
  // `ejesPorCategoria`, que es lo YA elegido por cada categoría.
  const universo = {
    tallas: exigir(resTallas, "las tallas aprobadas").map((t) => ({ id: t.id, texto: t.valor })),
    tejidos: exigir(resTejidos, "los tejidos aprobados").map((t) => ({ id: t.id, texto: t.nombre })),
    patrones: exigir(resPatrones, "los patrones aprobados").map((t) => ({ id: t.id, texto: t.nombre })),
  };

  type CategoriaFila = {
    id: string;
    nombre: string;
    prefijo: string | null;
    familia: Familia | null;
    activo: boolean;
    categoriaPadreId: string | null;
    notas: string | null;
  };
  const categorias: CategoriaFila[] = filas.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    prefijo: c.prefijo,
    // Categorías creadas antes del vocabulario cerrado pueden no tener
    // familia asignada todavía (0014: familia se agregó con ALTER, sin
    // backfill de lo que no calzaba con las 37 de CAYLA). Si tiene una, es
    // válida por construcción: `categorias_familia_fk` (20260918010000) no
    // deja guardar un código que no exista en retail.familias.
    familia: (c.familia as Familia | null) ?? null,
    activo: c.activo,
    categoriaPadreId: c.categoria_padre_id,
    notas: c.notas,
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Productos · Catálogo</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">
          Categorías
          <Ayuda titulo="Categorías">
            Las familias del negocio (Indumentaria, Calzado...) se administran en{" "}
            <Link href="/productos/familias" className="underline">Productos · Familias</Link>; dentro de cada una, las
            categorías (con su prefijo de 3 letras, como BLU de Blusas) sí crecen. El prefijo es lo que hace que el
            código de una prenda se pueda leer de un vistazo. Una categoría puede, opcionalmente,
            tener subcategorías (un solo nivel, ej. &ldquo;Vestidos largos&rdquo; bajo &ldquo;Vestidos&rdquo;) — la mayoría
            no las necesita y se sigue viendo igual que siempre. Al editar una categoría también
            se elige qué tallas/tejidos/patrones ofrece: una subcategoría tiene su propia lista,
            no hereda la del padre.
          </Ayuda>
        </h1>
      </div>

      <CategoriasLista
        categoriasIniciales={categorias}
        puedeEditar={persona.rol === "lider"}
        familias={familias}
        universo={universo}
        ejesPorCategoria={ejesPorCategoria}
      />
    </div>
  );
}
