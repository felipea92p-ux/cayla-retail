import { createClient } from "@/lib/supabase/server";
import { firmaDeEncabezados } from "@/lib/responsable-reglas";
import {
  leerFichaDeUnUso,
  leerPedidoDeRestablecer,
  respuestaDeLaTienda,
  urlDelEnvio,
  type EnvioDesdeLaTienda,
  type ResultadoDelRestablecer,
} from "@/lib/acceso-web-reglas";

// POST /api/clientas/acceso-web — «Restablecer acceso a la tienda web» desde la ficha de un cliente (Felipe 2026-10-15, 20261015132000).
// Cuerpo: { clientaId, correo } y la firma del combo «Responsable» en los encabezados (ADR-0161/0162).
//
// CONTRATO
//   PROMETE: deja pedido el restablecimiento en la base (con su Responsable y su Actividad) y le pide a la tienda que mande el código al
//            correo nuevo. Contesta qué pasó con el código; el pedido queda aunque la tienda no conteste (el cliente pide su código desde
//            «Restablecer mi acceso»).
//   ASUME:   sesión del ERP en la cookie; la base exige el módulo «Clientes» y el Responsable.
//   NO HACE: no cambia el correo con que entra el cliente (cambia cuando escribe el código en la tienda) ni toca su contraseña.
//
// POR QUÉ ESTA RUTA EXISTE Y EL NAVEGADOR NO LLAMA A LA TIENDA DIRECTO: la base devuelve una ficha de un solo uso (10 minutos) con que se
// le pide a la tienda el primer código. Viaja de servidor a servidor y nunca llega al navegador. No hay clave compartida entre el ERP y la
// tienda (ADR-0408, decisión 2): la ficha ES la llave, la base guarda solo su sha256 y con ella solo se puede MANDAR el código al correo
// que se escribió aquí.

const NO_STORE = { "cache-control": "no-store" };

async function mandarALaTienda(token: string): Promise<EnvioDesdeLaTienda> {
  const url = urlDelEnvio(process.env.TIENDA_URL);
  if (!url) return { estado: "sin_tienda" };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ficha: token }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return respuestaDeLaTienda(r.status, await r.json().catch(() => null));
  } catch {
    // La tienda no contestó (caída, sin red o tardó más de 10 s): el pedido quedó; el cliente pide su código desde la tienda.
    console.error(JSON.stringify({ evento: "acceso_web_tienda_sin_respuesta" }));
    return { estado: "no_disponible" };
  }
}

export async function POST(request: Request) {
  const pedido = leerPedidoDeRestablecer(await request.json().catch(() => null));
  if (!pedido) return Response.json({ error: { message: "Falta el cliente o el correo nuevo." } }, { status: 400, headers: NO_STORE });

  const supabase = await createClient({ firma: firmaDeEncabezados(request.headers) });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: { message: "Tu sesión se cerró: vuelve a entrar." } }, { status: 401, headers: NO_STORE });

  // La base revisa el módulo, el Responsable, la ficha, su cuenta web y el correo (uno por persona), y deja el pedido.
  const { data, error } = await supabase.rpc("restablecer_acceso_tienda_web", { p_clienta_id: pedido.clientaId, p_correo: pedido.correo });
  if (error) {
    return Response.json(
      { error: { message: error.message, code: error.code ?? null, details: error.details ?? null, hint: error.hint ?? null } },
      { status: 400, headers: NO_STORE },
    );
  }
  const ficha = leerFichaDeUnUso(data);
  if (!ficha) {
    console.error(JSON.stringify({ evento: "acceso_web_respuesta_rara" }));
    return Response.json({ error: { message: "No se pudo restablecer su acceso ahora. Vuelve a intentar en un momento." } }, { status: 502, headers: NO_STORE });
  }

  const resultado: ResultadoDelRestablecer = { correo: ficha.correo, venceEn: ficha.venceEn, envio: await mandarALaTienda(ficha.token) };
  return Response.json(resultado, { headers: NO_STORE });
}
