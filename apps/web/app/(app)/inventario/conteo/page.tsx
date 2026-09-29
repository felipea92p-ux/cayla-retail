import { redirect } from "next/navigation";
import { exigirModulo, puede, veModulo } from "@/lib/persona-actual";
import { getTrasladosPorAtender } from "@/lib/traslados";
import { getConteosResumen } from "@/lib/conteos";
import { LIMITE_HISTORIAL_CONTEO, sufijoVariantes } from "@/lib/conteo-inicio-reglas";
import { idsDeParam } from "@/lib/etiqueta-precio-reglas";
import { getCatalogo } from "@/lib/catalogo-v2";
import { getSububicaciones } from "@/lib/sububicaciones";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { ConteoVista } from "@/components/ConteoVista";

// El inicio de Conteo (rediseño 2026-09-29). Esta página LEE; `ConteoVista` dibuja (ahí vive el porqué de cada pieza).
//
// Lee lo mínimo para decidir «¿qué hago ahora?»: el historial de la sede —el conteo abierto, si hay, es su primera fila
// (`fn_conteos_resumen` lo pone primero y una sede tiene a lo sumo uno)—, dónde se puede contar, las categorías y cuántos
// traslados esperan. Ya NO lee el catálogo entero para mandarlo al navegador (contar vive en `/inventario/conteo/[id]`,
// que sí lo necesita), ni la prioridad por valor, ni los costos, ni la vista previa del cierre: de las once consultas de
// antes quedan cuatro, y las cuatro salen en paralelo.
export default async function ConteoPage({ searchParams }: { searchParams: Promise<{ variantes?: string | string[] }> }) {
  // La puerta del módulo se repite aquí porque un `layout.tsx` no vuelve a correr al navegar entre sus páginas hijas.
  const persona = await exigirModulo("conteos");
  // «Contar esta prenda» desde Movimientos (ADR-0241): `?variantes=<id>,<id>` acota la lista del conteo que se cuenta.
  const soloVariantes = idsDeParam((await searchParams).variantes);
  const supabase = await createClient();
  const [conteos, sububicaciones, categorias, trasladosPorAtender] = await Promise.all([
    getConteosResumen(persona.ubicacionId, LIMITE_HISTORIAL_CONTEO),
    getSububicaciones(persona.ubicacionId),
    supabase.from("categorias").select("id, nombre").eq("activo", true).order("nombre"),
    // El aviso «antes de contar»: el mismo número del menú (`cache`: el layout ya lo pidió, no es otra consulta). Solo a
    // quien ve Traslados: el aviso lleva allá.
    veModulo(persona, "traslados") ? getTrasladosPorAtender(persona.ubicacionId, puede(persona, "ajustarInventario")) : Promise.resolve(null),
  ]);

  const abierto = conteos[0]?.estado === "abierto" ? conteos[0] : null;
  // Con un conteo abierto no hay nada que decidir aquí: «Contar esta prenda» sigue directo a contarlo, ya acotado.
  if (abierto && soloVariantes.length > 0) redirect(`/inventario/conteo/${abierto.id}${sufijoVariantes(soloVariantes)}`);

  // Cómo se llaman las prendas pedidas, para decir arriba qué se va a contar. Solo cuando vienen (el catálogo está guardado
  // por versión, así que no es una consulta nueva) y no hay conteo abierto (con uno, ya se redirigió).
  const soloPrendas =
    soloVariantes.length > 0
      ? (await getCatalogo()).filter((v) => soloVariantes.includes(v.varianteId)).map((v) => [v.referencia, v.talla, v.color].filter(Boolean).join(" · "))
      : [];

  return (
    <ConteoVista
      sede={persona.ubicacionEtiqueta}
      ubicacionId={persona.ubicacionId}
      abierto={abierto}
      conteos={conteos}
      sububicaciones={sububicaciones}
      categorias={exigir(categorias, "las categorías").map((c) => ({ id: c.id, nombre: c.nombre }))}
      trasladosPorAtender={trasladosPorAtender}
      soloPrendas={soloPrendas}
      variantes={soloVariantes}
    />
  );
}
