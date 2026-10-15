import { cronAutorizado } from "@/lib/cron";
import { clienteAdmin } from "@/lib/sesion-servidor";
import { barrerCuentasCerradas } from "@/lib/usuarios-servidor";

// GET /api/cuentas-cerradas — el trabajo programado de Vercel (`vercel.json` → `crons`), cada madrugada a las 03:30 de Lima (08:30
// UTC), media hora después de la conservación del Club del ERP. ADR-0408 (Felipe 2026-10-14): cuando una ficha se anonimiza (3 años sin
// comprar ni entrar a la web, o porque lo pidió en tienda), la base cierra su cuenta web en la misma escritura y deja su usuario «por
// borrar»; la base no puede borrarlo porque vive en OTRO proyecto (el de inicio de sesión de los clientes). Lo borra el servidor de la
// tienda cuando la persona intenta entrar y, si nunca vuelve, esta ruta. Lo que no se pueda borrar hoy queda para mañana.
//
// Vercel manda `Authorization: Bearer $CRON_SECRET`; sin esa variable, o con otra clave, no pasa nadie. La respuesta la recibe el cron
// y nadie la lee: un fallo va al registro del servidor (sin correos ni datos de nadie, solo cuántos).

export async function GET(request: Request) {
  if (!cronAutorizado(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  const admin = clienteAdmin();
  if (!admin) {
    console.error(JSON.stringify({ evento: "tienda_cuentas_cerradas_sin_configurar" }));
    return Response.json({ error: "Sin la llave del proyecto de clientes" }, { status: 500 });
  }
  const resultado = await barrerCuentasCerradas(admin);
  if (!resultado) {
    console.error(JSON.stringify({ evento: "tienda_cuentas_cerradas_sin_base" }));
    return Response.json({ error: "La base no contestó" }, { status: 500 });
  }
  if (resultado.pendientes > 0) console.error(JSON.stringify({ evento: "tienda_cuentas_cerradas_pendientes", ...resultado }));
  return Response.json(resultado);
}
