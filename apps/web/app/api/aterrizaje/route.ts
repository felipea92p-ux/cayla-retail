import { aterrizajeDe } from "@/lib/menu";
import { requirePersonaActualV2 } from "@/lib/persona-actual";

// GET /api/aterrizaje → a qué pantalla entra la cuenta que acaba de iniciar sesión: `{ destino: "/inventario" }`.
//
// EL PROBLEMA (Felipe 2026-10-13: «al iniciar sesión hay un parpadeo muy breve y se ve el inicio»). El login navegaba a `/` y el
// Inicio, ya en el servidor, redirigía a la pantalla de la cuenta (su pantalla principal, el mostrador de una terminal, el tablero
// en CAYLA Global). Una redirección desde una página no evita el paso: Next pinta primero `/` —la app con «Inicio» marcado en el
// menú— y recién después pide el destino. Ahora el login pregunta aquí a dónde va y navega UNA vez, directo.
//
// PROMETE: solo lectura; la misma regla que el Inicio (`aterrizajeDe`), con la misma persona (`requirePersonaActualV2`): no hay
// dos copias que puedan separarse. Lo que diga es solo a dónde ir: cada pantalla vuelve a revisar el acceso al abrirse.
// SE DEGRADA: sin sesión o sin acceso, `requirePersonaActualV2` responde con su redirección al login; el login la toma como «no sé»
// y navega a `/`, el camino de siempre, que la resuelve igual (con su motivo, `?error=`). Un GET a /api no abre el loader global
// (`clasificarPeticion`): lo cubre el propio login mientras espera.
export async function GET() {
  const persona = await requirePersonaActualV2();
  const destino = aterrizajeDe({
    terminal: persona.terminal,
    modulos: persona.modulos.map((m) => m.clave),
    pantallaPrincipal: persona.pantallaPrincipal,
    esAdmin: persona.esAdmin,
    vista: persona.vista,
  });
  // Sin copias en ningún lado: depende de quién pregunta y de su rol de hoy.
  return Response.json({ destino }, { headers: { "Cache-Control": "private, no-store" } });
}
