import "server-only";
import { crearClienteAdmin } from "@/lib/supabase-admin";
import { esFuncionAusente } from "@/lib/compras-reglas";

// La lectura del padrón, anotada en la base (Felipe 2026-10-15, migración 20261015133000). El nombre de una ficha con DNI tiene que
// salir del padrón, y la base lo comprueba por su cuenta: solo acepta un nombre que un SERVIDOR anotó como lectura del padrón en la
// última hora (`fn_anotar_lectura_padron`, que solo ejecuta la llave de servicio). Lo llaman `GET /api/padron?para=ficha` (Vender,
// Clientes, «Editar» de la ficha), justo después de que el padrón contestó (la página del cartel del Club, que también lo llamaba, se
// retiró el 2026-10-16).
//
// Principio 9: si la base todavía no tiene la regla (la función no existe: la web se publica ANTES de pegar la migración), no hay nada
// que anotar y el registro sigue como hoy. Cualquier otro fallo (sin llave, la base no responde) dice «no anotada»: la pantalla lo
// trata como que el padrón no respondió, y se puede volver a intentar. Nunca se guarda un nombre que la base rechazaría.

/** ¿Quedó anotada la lectura? (O la base todavía no tiene esa regla, y entonces no hace falta.) */
export async function anotarLecturaPadron(tipo: "dni" | "ruc", numero: string, nombre: string): Promise<boolean> {
  try {
    const { error } = await crearClienteAdmin().rpc("fn_anotar_lectura_padron", { p_tipo: tipo, p_numero: numero, p_nombre: nombre });
    if (!error || esFuncionAusente(error)) return true;
    // Sin el número ni el nombre en el registro del servidor: solo que falló.
    console.error("[padron] no se pudo anotar la lectura", error.code, error.hint);
    return false;
  } catch (e) {
    console.error("[padron] no se pudo anotar la lectura", e instanceof Error ? e.message : e);
    return false;
  }
}
