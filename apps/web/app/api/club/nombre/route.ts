import { NextResponse } from "next/server";
import { consultarNombre } from "@/app/actions/club-registro";

// «¿Eres Lucía P. S.?» de la página pública del club (ADR-0288 act. g, G-3): la página la llama cuando ella completa los 8
// dígitos de su DNI. Es la misma `consultarNombre` de la acción de servidor (límite de intentos, padrón y nombre a medias),
// servida como POST propio por UNA razón: una acción de servidor siempre abre el loader a pantalla completa (`Next-Action`
// es «guardado» en `lib/espera-reglas.ts`), y esto es una lectura que corre mientras ella escribe. Desde aquí la página la pide
// con `x-espera: no` (ADR-0149). El DNI viaja en el cuerpo, nunca en la dirección: así no queda en los registros de acceso.
// `proxy.ts` la deja pasar sin sesión (`lib/rutas-publicas.ts`); no confía en nada de lo que llega.
export async function POST(request: Request) {
  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ estado: "invalido" }, { status: 400 });
  }
  const { ubicacionId, numero } = (cuerpo ?? {}) as { ubicacionId?: unknown; numero?: unknown };
  if (typeof ubicacionId !== "string" || typeof numero !== "string") return NextResponse.json({ estado: "invalido" }, { status: 400 });
  const respuesta = await consultarNombre(ubicacionId, numero);
  return NextResponse.json(respuesta, { headers: { "cache-control": "no-store" } });
}
