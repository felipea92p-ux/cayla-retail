import "server-only";
import { leerMiCuentaEnBase, registrarCuentaSimpleEnBase, vincularCuentaGoogleEnBase } from "./cuentas-servidor";
import { TEXTOS_VERSION } from "./cuentas";
import { anotarEntradaEnBase, marcarEntradaDeHoy } from "./entrada-servidor";
import { siguienteTrasVincular, usuarioDeGoogle } from "./google";
import { clienteAdmin, clienteSesion } from "./sesion-servidor";
import { borrarSiNoTieneCuenta } from "./usuarios-servidor";

// Entrar con Google, del lado del servidor (ADR-0438). El navegador pidió el intercambio al proyecto de clientes y volvió con un
// código (`app/auth/google/route.ts`); aquí se canjea por la sesión, se comprueba que de verdad es de Google y de un correo que Google
// confirmó, y se asegura que la cuenta exista: la primera vez se crea con lo mínimo (nombre y correo, SIN código: Google ya confirmó
// el correo). Si ese correo ya era el de contacto de una ficha de CAYLA (la abrieron en caja), la cuenta se une a ESA ficha en vez de
// rechazarse (ADR-0469, con sus candados dentro de la base: el nombre de Google debe parecerse al de la ficha, una sola ficha, sin
// cuenta, sin archivar). Nunca va a un registro un correo, un nombre ni un código: solo qué pasó.

export type ResultadoGoogle =
  /** `nueva`: se creó una cuenta nueva. `vinculada`: la cuenta se unió a la ficha que ya tenía ese correo (ADR-0469). */
  | { estado: "ok"; nueva: boolean; vinculada: boolean }
  /** El código no sirvió (venció, ya se usó, o la persona canceló en Google). */
  | { estado: "sin_codigo" }
  /** Entró con Google, pero ese correo es de contacto de OTRA ficha de la tienda (un correo es de una sola persona). */
  | { estado: "correo_de_otra_persona" }
  /** Ya hay una cuenta con ese correo que no es este usuario de Google. */
  | { estado: "correo_repetido" }
  | { estado: "sin_respuesta" };

/** Canjea el código de Google por la sesión y deja la cuenta lista. Si algo falla, la sesión se cierra: nadie queda a medias. */
export async function terminarConGoogle(codigo: string): Promise<ResultadoGoogle> {
  const sesion = await clienteSesion();
  if (!sesion) return { estado: "sin_respuesta" };
  const { data, error } = await sesion.auth.exchangeCodeForSession(codigo);
  if (error || !data.user) return { estado: "sin_codigo" };

  const cerrar = async (): Promise<void> => {
    await sesion.auth.signOut({ scope: "local" }).catch(() => undefined);
  };
  const usuario = usuarioDeGoogle(data.user);
  if (!usuario) {
    await cerrar();
    return { estado: "sin_codigo" };
  }

  const lectura = await leerMiCuentaEnBase(usuario.id);
  if (lectura.estado === "sin_respuesta") {
    await cerrar();
    return { estado: "sin_respuesta" };
  }
  let nueva = false;
  let vinculada = false;
  if (lectura.estado === "sin_cuenta") {
    // Si la cuenta no se puede terminar: se cierra la sesión y se borra el usuario de Google recién creado, para que el correo no
    // quede tomado por alguien que no pudo terminar.
    const fallar = async (resultado: ResultadoGoogle): Promise<ResultadoGoogle> => {
      await cerrar();
      const admin = clienteAdmin();
      if (admin) await borrarSiNoTieneCuenta(admin, usuario.id, { respetarRecientes: false });
      return resultado;
    };
    const vinculo = await vincularCuentaGoogleEnBase({ usuarioWebId: usuario.id, correo: usuario.correo, nombre: usuario.nombre, textos: TEXTOS_VERSION });
    const siguiente = siguienteTrasVincular(vinculo.estado);
    if (siguiente === "rechazar") return fallar({ estado: "correo_de_otra_persona" });
    if (siguiente === "listo") {
      vinculada = vinculo.estado === "vinculada";
    } else {
      const registro = await registrarCuentaSimpleEnBase({ usuarioWebId: usuario.id, correo: usuario.correo, nombre: usuario.nombre, textos: TEXTOS_VERSION, via: "google" });
      if (!registro.ok && registro.hint !== "cuenta_ya_existe") {
        if (registro.hint === "cuenta_correo_de_otra_persona" || registro.hint === "correo_repetido") return fallar({ estado: "correo_de_otra_persona" });
        if (registro.hint === "cuenta_correo_repetido") return fallar({ estado: "correo_repetido" });
        return fallar({ estado: "sin_respuesta" });
      }
      nueva = registro.ok;
    }
  }

  // Entrar con Google también es entrar: se anota la entrada (la conservación del Club) y se deja la marca del día.
  if ((await anotarEntradaEnBase(usuario.id)) === "anotada") await marcarEntradaDeHoy(usuario.id);
  return { estado: "ok", nueva, vinculada };
}
