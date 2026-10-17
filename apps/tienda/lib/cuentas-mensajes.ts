// Las palabras de la cuenta de la tienda online (ADR-0408): lo que la página de registro, Entrar, «Olvidé mi contraseña» y Mi perfil
// le dicen al cliente. Solo textos, sin zod ni nada más (2026-10-17): el aviso de la dirección (`AvisoDeLaUrl`) vive en el layout de
// TODA página y antes, por un solo texto, cargaba `lib/cuentas.ts` entero con zod en el navegador (~26 KB comprimidos en cada primera
// visita). Las reglas que usan estas palabras siguen en `lib/cuentas.ts`.

export const MENSAJES = {
  correoAyuda: "Escríbelo bien: si olvidas tu contraseña, te llega un enlace a este correo.",
  correoMal: "A este correo le falta algo: revisa lo que va después de la @.",
  correoRepetido: "Ya hay una cuenta con este correo.",
  // Un correo es de una sola persona (Felipe 2026-10-14): es el correo de contacto de otra ficha del Club. Nunca se dice de quién.
  correoDeOtraPersona: "Este correo ya está registrado en CAYLA con otros datos. Usa otro correo o, si es tuyo, acércate a una tienda CAYLA y lo revisamos.",
  claveAyuda: "8 caracteres o más. Solo tú la sabes.",
  claveLarga: "Tu contraseña puede tener hasta 72 caracteres.",
  dniAyuda: "Buscamos tu nombre solo, para tu boleta. Cada DNI tiene una sola cuenta.",
  // Carné de extranjería o pasaporte (Felipe 2026-10-15): el nombre se escribe tal cual está en el documento.
  documentoAyuda: "Como está en tu documento. Cada documento tiene una sola cuenta.",
  documentoRevisando: "Revisando tu documento…",
  nombresAyuda: "Tal cual están en tu documento, sin números.",
  apellidosAyuda: "Tal cual están en tu documento, sin números.",
  nombreConNumeros: "Tu nombre no lleva números: escríbelo tal cual está en tu documento.",
  documentoLibre: "Ahora escribe tus nombres y tus apellidos, tal cual están en tu documento.",
  dniBuscando: "Buscando tu nombre…",
  dniRepetido: "Ya hay una cuenta con este DNI.",
  // Desde 20261016154000 un documento sin cuenta la crea quien lo escriba (Felipe 2026-10-16): si no fue la persona, la tienda se
  // la devuelve con «Restablecer acceso» (la ficha del cliente en el ERP). Va detrás de «Ya hay una cuenta con este …».
  cuentaNoEsTuya: "Si no la creaste tú, acércate a cualquier tienda CAYLA y la recuperas.",
  dniArchivada: "Para crear tu cuenta necesitamos revisar tus datos en tienda: acércate a cualquier tienda CAYLA.",
  // El nombre sale del padrón y no se escribe (Felipe 2026-10-15): sin él no se crea la cuenta. Cada uno va con «Volver a intentar».
  dniDelPadron: "Del padrón: así sale en tu boleta.",
  dniNoEncontrado: "No encontramos tu nombre con ese DNI. Revisa el número: sin tu nombre del padrón no podemos crear tu cuenta.",
  dniSinPadron: "No pudimos buscar tu nombre ahora. Sin él no podemos crear tu cuenta: vuelve a intentar en un momento.",
  dniLimite: "Hiciste muchas búsquedas seguidas. Espera un rato y vuelve a intentar.",
  celAyuda: "Por aquí te escribe la tienda por tus pedidos.",
  celMal: "El celular empieza en 9.",
  cumpleAyuda: "Día y mes; el año es opcional. Es para tu descuento de cumpleaños.",
  cumpleMal: "Revisa el día, el mes (del 1 al 12) y el año.",
  cumpleMenor: "El Club CAYLA es para mayores de 18 años.",
  mayor: "Soy mayor de 18 años.",
  mayorFalta: "Para crear tu cuenta, confirma que eres mayor de 18 años.",
  aceptaFalta: "Para crear tu cuenta, acepta la política de privacidad y los términos del club.",
  avisosTitulo: "Avisos del Club por WhatsApp",
  avisosAyuda: "Te llegan al celular de arriba.",
  avisosCambio: "El texto de los avisos cambió. Léelo y vuelve a marcarlo si quieres recibirlos.",
  avisosSinActivar: "Tus avisos por WhatsApp quedaron sin activar: en la tienda tenemos anotado otro celular tuyo. Para cambiarlo, acércate a una tienda CAYLA.",
  noDisponible: "No pudimos crear tu cuenta ahora. Intenta de nuevo en unos minutos.",
  limite: "Hiciste muchos intentos seguidos. Espera un rato y vuelve a intentarlo.",
  codigoAyuda: "Son 6 números. Si no lo ves, revisa también tu carpeta de spam.",
  // El código bajo el correo (Felipe 2026-10-15): «Obtener código» al lado, la caja debajo y, con el bueno, «Correo confirmado».
  codigoObtener: "Obtener código",
  codigoAntes: "Toca «Obtener código»: te llega un código de 6 números a este correo.",
  correoConfirmado: "Correo confirmado",
  codigoSinConfirmar: "Primero confirma tu correo: toca «Obtener código» y escribe los 6 números que te llegan.",
  // El correo lo acaba de confirmar otro aparato y todavía puede estar creando su cuenta: no se le manda otro código por un rato.
  correoOcupado: "Este correo se está confirmando en otro aparato. Termina ahí, o espera unos minutos y vuelve a intentar.",
  // El último código sigue sirviendo (se pidió hace menos de un minuto, desde aquí o desde otro aparato).
  codigoReciente: "Ya te mandamos un código hace poco: revisa tu correo.",
  codigoIncompleto: "Escribe los 6 números del código.",
  codigoVencido: "Ese código ya no sirve. Pide uno nuevo.",
  codigoSinPedir: "Pide un código nuevo para confirmar tu correo.",
  codigoNuevo: "Te mandamos un código nuevo. Usa el último que te llegó.",
  codigoNoEnviado: "No pudimos mandarte el código ahora. Intenta de nuevo en un minuto.",
  codigoNoProbado: "No pudimos revisar tu código ahora. Intenta de nuevo en un minuto.",
  entrarMal: "El correo o la contraseña no coinciden. Revísalos o recupera tu contraseña.",
  entrarLimite: "Hiciste muchos intentos seguidos. Espera unos minutos y vuelve a intentarlo.",
  entrarNoDisponible: "No pudimos entrar ahora. Intenta de nuevo en unos minutos.",
  // «Entrar» ya no espera con el botón apagado: al tocarlo dice qué falta, bajo su caja (lib/entrada.ts, `problemaAlEntrar`).
  entrarSinCorreo: "Escribe el correo con el que creaste tu cuenta.",
  entrarSinClave: "Escribe tu contraseña.",
  entrarClaveCorta: "Tu contraseña tiene 8 caracteres o más: revísala.",
  // Su ficha se anonimizó (3 años sin comprar ni entrar, o lo pidió: en tienda o con «Eliminar mi cuenta») y la cuenta se cerró:
  // Términos del Club, 7; Privacidad, 6.
  cuentaCerrada:
    "Tu cuenta se cerró y borramos tus datos: pasaron 3 años sin compras ni entradas a tu cuenta, o pediste eliminarla (desde tu cuenta o en una tienda CAYLA). Si quieres volver, crea una cuenta nueva.",
  olvideNoDisponible: "No pudimos mandarte el enlace ahora. Intenta de nuevo en unos minutos.",
  enlaceVencido: "El enlace venció o ya se usó. Pide otro: te llega en un momento.",
  claveIgual: "Esa ya era tu contraseña: entraste con ella.",
  claveNoDisponible: "No pudimos guardar tu contraseña ahora. Intenta de nuevo en unos minutos.",
} as const;
