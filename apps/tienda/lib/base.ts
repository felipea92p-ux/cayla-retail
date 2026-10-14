import "server-only";
import postgres from "postgres";
import { interpretarPortada, PORTADA_SIN_DATOS, type Portada } from "./portada";

// La puerta angosta (ADR-0408): la tienda habla con la base del ERP SOLO por funciones `retail.tienda_*`, con un usuario
// que hereda el rol `tienda_web`. Ese rol no tiene permiso sobre ninguna tabla y nunca es la llave de servicio del ERP.
// `prepare: false` porque en producción la conexión pasa por el pooler de Supabase en modo transacción.
let conexion: postgres.Sql | null = null;

function base() {
  const url = process.env.TIENDA_DB_URL;
  if (!url) throw new Error("Falta TIENDA_DB_URL: la conexión de la tienda a la base (usuario del rol tienda_web).");
  conexion ??= postgres(url, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 5, connection: { application_name: "cayla-tienda" } });
  return conexion;
}

export async function leerPortada(): Promise<Portada> {
  try {
    const [fila] = await base()`select retail.tienda_portada() as portada`;
    return interpretarPortada(fila?.portada);
  } catch (error) {
    // La portada se muestra igual, sin campaña ni tiendas: un cliente nunca ve una página caída por la base.
    console.error(JSON.stringify({ evento: "tienda_portada_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    return PORTADA_SIN_DATOS;
  }
}
