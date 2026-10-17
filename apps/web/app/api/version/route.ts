import { NextResponse } from "next/server";

// GET /api/version
//
// CONTRATO
//   PROMETE: decir con qué versión se armó ESTA compilación (el commit que Vercel construyó), tal cual quedó grabada
//            al compilar. Nunca depende de la base ni de la sesión del lector, y nunca se guarda en caché: lo que
//            pregunta una pestaña vieja es «¿cuál es la de ahora?», y una respuesta repetida de hace una hora la
//            engañaría.
//   ASUME:   sesión válida (el proxy responde 401 sin ella; quien pregunta lo trata como «no sé», no como aviso).
//   NO HACE: no compara nada. Quien compara es la pestaña (`components/VersionNueva.tsx`, reglas en
//            `lib/version-nueva-reglas.ts`).
//
// POR QUÉ UNA RUTA Y NO LEER LA PÁGINA: pedir una pantalla entera para averiguar un id cuesta una consulta a la base y
// armar el HTML; esto es una respuesta de unos 40 bytes. Y es una ruta propia, sin `?dpl=` ni `x-deployment-id`, porque con
// la protección de versiones de Vercel un pedido que los lleva se atiende en la versión VIEJA de la pestaña y la
// respuesta diría «estás al día» para siempre. Los pedidos de Next llevan esa marca; este `fetch` no.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ id: process.env.NEXT_PUBLIC_BUILD_ID ?? "desarrollo" }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
