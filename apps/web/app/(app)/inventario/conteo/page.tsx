import { redirect } from "next/navigation";
import { exigirModulo, puede, veModulo } from "@/lib/persona-actual";
import { getTrasladosPorAtender } from "@/lib/traslados";
import { getAlcanceConteo, getConteosResumen } from "@/lib/conteos";
import { LIMITE_HISTORIAL_CONTEO, sufijoVariantes } from "@/lib/conteo-inicio-reglas";
import { LIMITE_CONTEOS_FILTRABLES, diaValido, vistaDeRecientes } from "@/lib/conteo-recientes-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { idsDeParam } from "@/lib/etiqueta-precio-reglas";
import { getCatalogo } from "@/lib/catalogo-v2";
import { getSububicaciones } from "@/lib/sububicaciones";
import { createClient } from "@/lib/supabase/server";
import { exigir, opcional } from "@/lib/resultado";
import { ConteoVista } from "@/components/ConteoVista";

// El inicio de Conteo (rediseño 2026-09-29). Esta página LEE; `ConteoVista` dibuja (ahí vive el porqué de cada pieza).
//
// Lee lo mínimo para decidir «¿qué hago ahora?»: el historial de la sede —el conteo abierto, si hay, es su primera fila
// (`fn_conteos_resumen` lo pone primero y una sede tiene a lo sumo uno)—, dónde se puede contar, las categorías y cuántos
// traslados esperan, más cuántas variantes trae cada lugar y categoría (la cifra de «Abrir un conteo»; dato de apoyo: si no
// llega, la tarjeta sale sin cifras). Ya NO lee el catálogo entero para mandarlo al navegador (contar vive en
// `/inventario/conteo/[id]`, que sí lo necesita), ni la prioridad por valor, ni los costos, ni la vista previa del cierre: de las
// once consultas de antes quedan cinco, y las cinco salen en paralelo.
export default async function ConteoPage({ searchParams }: { searchParams: Promise<{ variantes?: string | string[]; dia?: string | string[] }> }) {
  // La puerta del módulo se repite aquí porque un `layout.tsx` no vuelve a correr al navegar entre sus páginas hijas.
  const persona = await exigirModulo("conteos");
  // «Contar esta prenda» desde Movimientos (ADR-0241): `?variantes=<id>,<id>` acota la lista del conteo que se cuenta.
  const params = await searchParams;
  const soloVariantes = idsDeParam(params.variantes);
  // «Conteos recientes por día» (2026-10-01): `?dia=aaaa-mm-dd` filtra por el día de apertura (Lima); una fecha que no existe se ignora.
  const dia = diaValido(params.dia);
  const supabase = await createClient();
  const [todos, sububicaciones, categorias, alcance, trasladosPorAtender] = await Promise.all([
    // Trae más de lo que se dibuja para poder llegar a una fecha vieja: la base suma las líneas de todos los conteos antes de
    // ordenar y cortar, así que pedir 300 no cuesta más que pedir 20 (`LIMITE_CONTEOS_FILTRABLES`).
    getConteosResumen(persona.ubicacionId, LIMITE_CONTEOS_FILTRABLES),
    getSububicaciones(persona.ubicacionId),
    supabase.from("categorias").select("id, nombre").eq("activo", true).order("nombre"),
    opcional(getAlcanceConteo(persona.ubicacionId), "cuántas variantes trae cada conteo"),
    // El aviso «antes de contar»: lo que LLEGA por recibir (`cache`: el layout ya lo pidió, no es otra consulta). No el
    // número del menú, que suma los pedidos que esta sede tiene que ENVIAR (ADR-0328 act. 17): esos no se «reciben
    // primero». Solo a quien ve Traslados: el aviso lleva allá.
    veModulo(persona, "traslados") ? getTrasladosPorAtender(persona.ubicacionId, puede(persona, "ajustarInventario")) : Promise.resolve(null),
  ]);

  // Lo de siempre (el abierto es el primero; «Último conteo» mira los 20 más recientes) sigue leyendo la ventana de 20.
  const conteos = todos.slice(0, LIMITE_HISTORIAL_CONTEO);
  const recientes = vistaDeRecientes(todos, hoyLima(), dia, LIMITE_HISTORIAL_CONTEO);
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
      recientes={recientes}
      sububicaciones={sububicaciones}
      categorias={exigir(categorias, "las categorías").map((c) => ({ id: c.id, nombre: c.nombre }))}
      alcance={alcance}
      trasladosPorAtender={trasladosPorAtender}
      soloPrendas={soloPrendas}
      variantes={soloVariantes}
    />
  );
}
