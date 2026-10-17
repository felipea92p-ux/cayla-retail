import { leerEnvio, lineaDeRegistro, TOPE_DEL_ENVIO } from "@/lib/medicion";

// POST /api/medicion — lo que la tienda tardó en el aparato de un cliente (ADR-0447; lo manda `components/Medicion.tsx`). Escribe UNA línea
// en el registro de Vercel y nada más: ni base, ni sesión, ni cookies (`proxy.ts` no pasa por aquí). El registro del plan Pro guarda un
// día; `pnpm --filter tienda medicion:leer` lo baja y lo resume. Lo que no calza con `leerEnvio` (otra métrica, una página que no es de la
// tienda, un número fuera de rango, un cuerpo enorme) se rechaza sin escribir nada. Nadie espera la respuesta: el navegador la descarta.
export async function POST(request: Request) {
  const sinCuerpo = (status: number) => new Response(null, { status, headers: { "cache-control": "no-store" } });
  if (Number(request.headers.get("content-length") ?? 0) > TOPE_DEL_ENVIO) return sinCuerpo(413);
  let cuerpo: unknown;
  try {
    const texto = await request.text();
    if (texto.length > TOPE_DEL_ENVIO) return sinCuerpo(413);
    cuerpo = JSON.parse(texto);
  } catch {
    return sinCuerpo(400);
  }
  const envio = leerEnvio(cuerpo);
  if (!envio) return sinCuerpo(400);
  console.log(lineaDeRegistro(envio, Date.now()));
  return sinCuerpo(204);
}
