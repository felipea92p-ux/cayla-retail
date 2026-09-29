import { NextResponse, type NextRequest } from "next/server";
import { cambiarUbicacionActiva } from "@/app/actions/ubicacion";
import { VALOR_VISTA_GLOBAL } from "@/lib/vista-global";

// CAYLA Global (ADR-0275): entrar a la vista por un enlace (/global estando parado en una sede). Una página no puede
// escribir la cookie mientras se dibuja; esta ruta sí. La escribe la MISMA acción del selector (una sola puerta a la
// cookie), que le pregunta a la base si la cuenta ve el módulo: si no, no escribe nada y /global manda a «Sin acceso».
export async function GET(request: NextRequest) {
  const entro = await cambiarUbicacionActiva(VALOR_VISTA_GLOBAL);
  return NextResponse.redirect(new URL(entro ? "/global" : "/sin-acceso?modulo=cayla_global", request.url));
}
