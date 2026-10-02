import { requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getVentasDelMesDeSede } from "@/lib/resumen-inventario";
import { mesEnCursoDe, recortarVentasDelMes } from "@/lib/existencias-resumen";

// GET /api/existencias/ventas-del-mes[?ubicacion=<id>] → lo vendido en el MES EN CURSO (del día 1 a hoy, hora de Lima), una fila por
// talla que vendió algo, para la ventana «Resumen disponible» de Existencias.
//
// PROMETE: solo lectura; el mes lo decide el servidor (`mesEnCursoDe`) y viaja en la respuesta, así que la ventana dice «desde el 1 de
//   octubre» con el mismo día con que se contó. El día 1 de cada mes la ventana arranca ese día: el contador vuelve a cero solo.
// ASUME: que quien llama ve Existencias. La sede sale de su sesión; solo un líder puede pedir otra con `?ubicacion=` (como la página).
// SE DEGRADA: si la base no responde, devuelve 500 con un mensaje y la ventana muestra «No pudimos leer las ventas» con «Reintentar»;
//   el stock por categoría y las listas de lo que hay no dependen de esta lectura y se ven igual.
//
// Se lee al abrir la ventana y no al cargar Existencias: es una lectura de toda la sede (~1.200 tallas) para algo que se mira de vez en
// cuando, y a los 7 días que la página ya pide para el cambio del Taller no se les suma otra. Un GET a /api no abre el loader global
// (`clasificarPeticion`): mirar un resumen no debe tapar la pantalla.
export async function GET(request: Request) {
  const persona = await requirePersonaActualV2();
  if (!veModulo(persona, "existencias")) {
    return Response.json({ error: "Tu rol no ve Existencias." }, { status: 403 });
  }
  try {
    let ubicacionId = persona.ubicacionId;
    const pedida = new URL(request.url).searchParams.get("ubicacion");
    if (persona.rol === "lider" && pedida && pedida !== ubicacionId) {
      // Solo una sede que existe: un id inventado no llega a la base.
      if ((await getUbicaciones()).some((u) => u.id === pedida)) ubicacionId = pedida;
    }
    const ahora = new Date();
    const filas = await getVentasDelMesDeSede(ubicacionId, ahora);
    return Response.json({ mes: mesEnCursoDe(ahora), ventas: recortarVentasDelMes(filas) });
  } catch (e) {
    console.error("No se pudieron leer las ventas del mes para el resumen de Existencias", e);
    return Response.json({ error: "No pudimos leer las ventas del mes." }, { status: 500 });
  }
}
