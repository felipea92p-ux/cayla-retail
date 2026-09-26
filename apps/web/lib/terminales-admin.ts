import "server-only";
import { crearClienteAdmin } from "@/lib/supabase-admin";
import { normalizarNombre } from "@/lib/terminales-reglas";
import type { AdminTerminales } from "@/lib/terminales-alta";

// Las operaciones con la llave de servicio que necesita `lib/terminales-alta.ts`, y nada más. Se construyen recién
// cuando `crearTerminalCon`/`cambiarClaveTerminalCon` ya comprobaron que quien llama es líder.
// Ningún mensaje de error de aquí incluye la clave.
export function adminDeTerminales(): AdminTerminales {
  const db = crearClienteAdmin();

  return {
    async leerTienda(id) {
      const { data } = await db.from("ubicaciones").select("id, nombre, tipo, activo").eq("id", id).maybeSingle();
      return data ?? null;
    },
    async leerRol(id) {
      const { data } = await db.from("roles").select("id, nombre, clave, fijo, archivado_at").eq("id", id).maybeSingle();
      return data ? { id: data.id, nombre: data.nombre, clave: data.clave, fijo: data.fijo, archivado: data.archivado_at !== null } : null;
    },
    async nombreActivoOcupado(ubicacionId, nombre) {
      const { data } = await db.from("terminales").select("nombre").eq("ubicacion_id", ubicacionId).eq("activo", true);
      const buscado = normalizarNombre(nombre).toLowerCase();
      return (data ?? []).some((t) => normalizarNombre(t.nombre).toLowerCase() === buscado);
    },
    async crearUsuario(correo, clave) {
      const { data, error } = await db.auth.admin.createUser({ email: correo, password: clave, email_confirm: true });
      if (error || !data.user) {
        const yaExiste = error?.code === "email_exists" || error?.status === 422;
        return { error: error?.message ?? "Auth no devolvió la cuenta", yaExiste };
      }
      return { id: data.user.id };
    },
    async borrarUsuario(id) {
      // Solo se llama con una cuenta creada un instante antes que nunca inició sesión ni tiene historial.
      const { error } = await db.auth.admin.deleteUser(id);
      return !error;
    },
    async insertarTerminal(fila) {
      const { error } = await db.from("terminales").insert({ ...fila, activo: true });
      return { error: error ? { code: error.code, message: error.message } : null };
    },
    async leerTerminal(id) {
      const { data } = await db.from("terminales").select("id, nombre, auth_user_id, ubicacion_id").eq("id", id).maybeSingle();
      if (!data) return null;
      const { data: u } = await db.from("ubicaciones").select("nombre").eq("id", data.ubicacion_id).maybeSingle();
      return { id: data.id, nombre: data.nombre, auth_user_id: data.auth_user_id, ubicacion_nombre: u?.nombre ?? "" };
    },
    async correoDeUsuario(id) {
      const { data } = await db.auth.admin.getUserById(id);
      return data.user?.email ?? null;
    },
    async cambiarClave(userId, clave) {
      const { error } = await db.auth.admin.updateUserById(userId, { password: clave });
      return !error;
    },
  };
}
