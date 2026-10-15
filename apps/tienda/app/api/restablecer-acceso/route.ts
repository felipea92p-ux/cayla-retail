import { leerFichaDelErp, respuestaDelEnvioAlErp } from "@/lib/mi-cuenta";
import { origenDeLaPeticion, pedirCodigoAlCorreoNuevo, restablecerEnviarEnBase } from "@/lib/mi-cuenta-servidor";

// POST /api/restablecer-acceso — el primer código de «Restablecer acceso a la tienda web» (Felipe 2026-10-15). Lo llama el SERVIDOR del
// ERP justo después de que una persona con el módulo «Clientes» pidió el restablecimiento (`restablecer_acceso_tienda_web`), con la
// ficha de un solo uso que le devolvió la base: { "ficha": "<64 cifras hexadecimales>" }.
//
// No hay clave compartida entre el ERP y la tienda: la ficha ES la llave. La base guarda solo su sha256, sirve una vez y vence a los 10
// minutos (`tienda_restablecer_enviar`), y con ella lo único que se puede hacer es MANDAR el código al correo que escribió la tienda:
// nadie entra a ninguna cuenta con ella. Si esta ruta no contesta, el pedido queda y la persona pide su código en «Restablecer mi acceso».
// La respuesta dice qué pasó, sin datos de nadie: { estado: enviado | esperar (segundos) | limite | bloqueado (minutos) | correo_tomado |
// invalido | no_disponible }.
export async function POST(request: Request) {
  const ficha = leerFichaDelErp(await request.json().catch(() => null));
  if (!ficha) return Response.json({ estado: "invalido" }, { status: 400, headers: { "cache-control": "no-store" } });

  const envio = await restablecerEnviarEnBase(ficha);
  let respuesta = respuestaDelEnvioAlErp(envio, null);
  if (envio.estado === "enviar" && envio.correoActual) {
    const resultado = await pedirCodigoAlCorreoNuevo({ correoActual: envio.correoActual }, envio.correoNuevo, `${origenDeLaPeticion(request.headers)}/restablecer-acceso`);
    respuesta = respuestaDelEnvioAlErp(envio, resultado);
  }
  return Response.json(respuesta.cuerpo, { status: respuesta.status, headers: { "cache-control": "no-store" } });
}
