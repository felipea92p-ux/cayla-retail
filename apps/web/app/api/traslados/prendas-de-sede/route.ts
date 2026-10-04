import { requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { createClient } from "@/lib/supabase/server";
import { getEtiquetasDeVariantes } from "@/lib/traslados";
import { filasEnviables, prendasPedibles, sedesParaPedir, type FilaExistenciasDeSede } from "@/lib/pedidos-entre-sedes-reglas";

// GET /api/traslados/prendas-de-sede?sede=<id> → lo que esa TIENDA puede ENVIAR ahora, prenda por prenda, para «Pedir a otra sede»
// desde Traslados: `{ prendas: [{ varianteId, etiqueta, disponible }] }`, ordenadas por nombre.
//
// PROMETE: solo lectura. «Disponible» es lo libre de su ALMACÉN (`filasEnviables`): un traslado sale del almacén, nunca del piso,
//   así que ofrecer también lo del piso prometería más de lo que la otra tienda puede mandar y ella respondería «No la tengo».
//   Sale de `fn_existencias` (la única fórmula de «cuánto hay», ADR-0270): sin apartadas, sin cuarentena, sin tallas retiradas, sin
//   pruebas. Pedir no reserva nada en esa tienda: la base vuelve a mirar el disponible al guardar el pedido (`pedir_a_otra_sede`).
// ASUME: que quien llama ve Traslados, y que `sede` es OTRA tienda activa distinta de la suya (el Taller no: «solo se pide entre
//   tiendas»). La sede de quien pide sale de su sesión; un id inventado se rechaza antes de llegar a la base. La puerta de
//   `fn_existencias` (`fn_tiene_acceso_retail`) deja pasar también a una terminal, que no tiene persona ni colaborador (ADR-0289).
// SE DEGRADA: si la base no responde, devuelve 500 con un mensaje y el modal dice «No pudimos leer lo que tiene esa tienda» con
//   «Reintentar»; no deja una lista a medias (los nombres de las prendas se piden por tandas y, si una falla, falla todo).
//
// Una sola sede por llamada (no la red entera: `fn_stock_por_sede_json` pesa ~1,5 MB con 5 sedes). Se lee al elegir la tienda y no al
// abrir Traslados. Un GET a /api no abre el loader global (`clasificarPeticion`).
export async function GET(request: Request) {
  const persona = await requirePersonaActualV2();
  if (!veModulo(persona, "traslados")) {
    return Response.json({ error: "Tu rol no ve Traslados." }, { status: 403 });
  }
  const sede = new URL(request.url).searchParams.get("sede");
  try {
    const sedes = sedesParaPedir(await getUbicaciones(), persona.ubicacionId);
    if (!sede || !sedes.some((s) => s.id === sede)) {
      return Response.json({ error: "Esa sede no es una tienda a la que se pueda pedir." }, { status: 400 });
    }
    const supabase = await createClient();
    // `fn_existencias` todavía no está en los tipos generados: se llama con la forma de su resultado escrita aquí.
    const { data, error } = (await supabase.rpc("fn_existencias" as never, { p_ubicacion_id: sede } as never)) as unknown as {
      data: FilaExistenciasDeSede[] | null;
      error: { message: string } | null;
    };
    if (error || !data) throw new Error(error?.message ?? "sin datos");
    const filas = filasEnviables(data).filter((f) => f.cantidad > 0);
    const etiquetas = await getEtiquetasDeVariantes(filas.map((f) => f.variante_id));
    return Response.json({ prendas: prendasPedibles(filas, sede, etiquetas) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("No se pudo leer lo que ofrece la otra tienda", e);
    return Response.json({ error: "No pudimos leer lo que tiene esa tienda." }, { status: 500 });
  }
}
