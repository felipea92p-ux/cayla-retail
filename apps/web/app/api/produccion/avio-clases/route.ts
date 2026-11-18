import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
// ADR-0161: cambiar el catálogo es operación de tienda; la firma del combo «Responsable» que manda la pantalla viaja a la base en cada consulta de este cliente.
import { firmaDeEncabezados } from "@/lib/responsable-reglas";
import { traducirError } from "@/lib/error-escritura";
import { COMPORTAMIENTOS, prefijoLibre, problemaDelNombreDeClase, type ComportamientoClase } from "@/lib/avio-clases-reglas";

// POST/PATCH /api/produccion/avio-clases → las clases de avío (ADR-0580), con el mismo mecanismo y la misma forma que /api/productos/tejidos: cualquiera con sesión crea una y nace activa
// (ADR-0534, «lo cree quien lo cree»); corregirla o apagarla es del líder, y quien de verdad lo hace cumplir es la política `avio_clases_update_lider`.
//
// Lo que una clase creada aquí NO decide: su `comportamiento` nace en «otro», que no propone unidad ni pide medida. Es a propósito — la unidad de un avío se congela al primer lote, así que
// una clase recién nacida no debe proponer nada que nadie revisó. El líder le pone su comportamiento en Catálogo ▸ Atributos ▸ Avíos.

const UNIDADES = ["metro", "unidad", "kilo", "cono", "par", "docena"] as const;

type FilaClase = { id: string; nombre: string; prefijo: string; comportamiento: string; unidad_sugerida: string; pide_color: boolean; orden: number; activo: boolean; nota: string | null };

const COLUMNAS = "id, nombre, prefijo, comportamiento, unidad_sugerida, pide_color, orden, activo, nota";

/** La tabla es nueva y no está en los tipos generados: se tipa el cliente, no el resultado (igual que `materiales` en `lib/insumos.ts`). */
type ClienteSinTipos = {
  from: (t: string) => {
    select: (c: string) => { order: (c: string) => PromiseLike<{ data: FilaClase[] | null; error: { message: string; code?: string } | null }> };
    insert: (v: Record<string, unknown>) => { select: (c: string) => { single: () => PromiseLike<{ data: FilaClase | null; error: { message: string; code?: string } | null }> } };
    update: (v: Record<string, unknown>) => {
      eq: (col: string, v: string) => { select: (c: string) => { single: () => PromiseLike<{ data: FilaClase | null; error: { message: string; code?: string } | null }> } };
    };
  };
};

export async function POST(request: Request) {
  await requirePersonaActualV2();

  const cuerpo = await request.json().catch(() => null);
  // No se corta lo que alguien escribió: se dice que no cabe. Cortar en silencio dejaba el nombre partido a media
  // palabra, y de la clase sale el prefijo del código de todos sus avíos (/chaos 2026-10-31).
  const nombre = typeof cuerpo?.nombre === "string" ? cuerpo.nombre.trim() : "";
  const problema = problemaDelNombreDeClase(nombre);
  if (problema) {
    return Response.json({ error: problema }, { status: 400 });
  }

  const supabase = (await createClient({ firma: firmaDeEncabezados(request.headers) })) as unknown as ClienteSinTipos;
  // El prefijo se arma solo y no puede chocar con otro: es el principio del código de cada ficha de esa clase (`BRO-01`).
  const existentes = await supabase.from("avio_clases").select(COLUMNAS).order("orden");
  if (existentes.error) {
    return Response.json({ error: traducirError(existentes.error, "leer las clases de avío", { lectura: true }) }, { status: 400 });
  }
  const prefijo = prefijoLibre(nombre, (existentes.data ?? []).map((c) => c.prefijo));
  if (!prefijo) {
    return Response.json({ error: "Ponle a la clase un nombre con al menos dos letras (de ahí sale el código de sus avíos)." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("avio_clases")
    .insert({ nombre, prefijo, comportamiento: "otro", unidad_sugerida: "unidad", pide_color: true, orden: 90 })
    .select(COLUMNAS)
    .single();

  if (error) {
    if (error.code === "23505") {
      return Response.json({ error: `Ya hay una clase de avío que se llama «${nombre}».` }, { status: 409 });
    }
    return Response.json({ error: traducirError(error, "crear la clase de avío") }, { status: 400 });
  }
  return Response.json({ clase: data });
}

// PATCH: corregir el nombre, el comportamiento (de él salen las reglas), la unidad que propone, si lleva color, el orden o desactivarla. Es del líder: la RLS lo vuelve a comprobar.
export async function PATCH(request: Request) {
  const persona = await requirePersonaActualV2();
  if (!puede(persona, "editarCatalogo")) {
    return Response.json({ error: "Corregir las clases de avío necesita el módulo Productos o Atributos en tu rol." }, { status: 403 });
  }

  const cuerpo: Record<string, unknown> = (await request.json().catch(() => null)) ?? {};
  const id = typeof cuerpo.id === "string" ? cuerpo.id : "";
  if (!id) {
    return Response.json({ error: "Falta la clase de avío a corregir." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if ("nombre" in cuerpo) {
    const nombre = typeof cuerpo.nombre === "string" ? cuerpo.nombre.trim().slice(0, 60) : "";
    if (!nombre) return Response.json({ error: "El nombre no puede quedar vacío." }, { status: 400 });
    patch.nombre = nombre;
  }
  if ("comportamiento" in cuerpo) {
    const c = cuerpo.comportamiento;
    if (typeof c !== "string" || !(c in COMPORTAMIENTOS)) {
      return Response.json({ error: "Ese comportamiento no es uno de los conocidos." }, { status: 400 });
    }
    patch.comportamiento = c as ComportamientoClase;
  }
  if ("unidadSugerida" in cuerpo) {
    const u = cuerpo.unidadSugerida;
    if (typeof u !== "string" || !UNIDADES.includes(u as (typeof UNIDADES)[number])) {
      return Response.json({ error: "Esa unidad no es una de las conocidas." }, { status: 400 });
    }
    patch.unidad_sugerida = u;
  }
  if ("pideColor" in cuerpo) patch.pide_color = cuerpo.pideColor === true;
  if ("orden" in cuerpo && typeof cuerpo.orden === "number" && Number.isFinite(cuerpo.orden)) patch.orden = Math.trunc(cuerpo.orden);
  if ("nota" in cuerpo) patch.nota = typeof cuerpo.nota === "string" && cuerpo.nota.trim() ? cuerpo.nota.trim().slice(0, 200) : null;
  if ("activo" in cuerpo) patch.activo = cuerpo.activo === true;

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "No hay cambios para guardar." }, { status: 400 });
  }

  const supabase = (await createClient({ firma: firmaDeEncabezados(request.headers) })) as unknown as ClienteSinTipos;
  const { data, error } = await supabase.from("avio_clases").update(patch).eq("id", id).select(COLUMNAS).single();
  if (error) {
    if (error.code === "PGRST116") return Response.json({ error: "No existe esa clase de avío." }, { status: 404 });
    if (error.code === "23505") return Response.json({ error: "Ya hay otra clase de avío con ese nombre." }, { status: 409 });
    return Response.json({ error: traducirError(error, "guardar la clase de avío") }, { status: 400 });
  }
  return Response.json({ clase: data });
}
