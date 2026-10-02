// Consulta al padrón oficial: RENIEC para DNI, SUNAT para RUC.
//
// CONTRATO
//   PROMETE: dado un tipo y un número ya validados, devuelve la identidad
//            oficial de ese documento, o dice con precisión por qué no pudo.
//            Nunca inventa un nombre ni devuelve datos a medias.
//   ASUME:   que el número ya pasó `validarDocumento` (formato + dígito
//            verificador). No revalida: eso es trabajo de quien llama.
//   NO HACE: no escribe en la base, no decide si se puede emitir. Informa.
//
// POR QUÉ HAY ADAPTADORES Y NO UN SOLO PROVEEDOR:
// ni RENIEC ni SUNAT publican una API REST abierta. Todo el mercado peruano
// pasa por intermediarios (Decolecta, apis.net.pe, Factiliza y varios más) que
// cobran por consulta, cambian de dominio y a veces desaparecen. Amarrar el
// código a uno solo significa que el día que ese proveedor caiga o suba el
// precio hay que tocar el formulario de facturación. Con esto, cambiar de
// proveedor es cambiar dos variables de entorno y volver a desplegar.
//
// SI NO HAY PROVEEDOR CONFIGURADO el sistema NO se rompe: devuelve
// `sin_proveedor` y el formulario sigue funcionando escribiendo el nombre a
// mano — que es exactamente como se factura hoy (principio 9).
//
// ORDEN DE FUENTES (2026-09-29, ADR-0008 «Actualización»):
//   1. caché en memoria
//   2. SUNAT público (gratis): el servicio del formulario de denuncias de SUNAT,
//      que prellena el nombre por DNI o RUC. NO es una API documentada — no
//      tiene contrato ni garantía — por eso es la PRIMERA opción y nunca la única.
//   3. proveedor de pago (PADRON_PROVEEDOR): si SUNAT no lo encontró o falló.
// Límite conocido del gratis: para RUC trae razón social y dirección, pero NO
// estado ni condición (ACTIVO / HABIDO), que `advertenciasDe` necesita.

export type TipoConsulta = "dni" | "ruc";

/** De qué fuente salió una consulta al padrón. */
export type OrigenPadron = "sunat_publico" | "proveedor";

export type DatosPadron = {
  numero: string;
  tipo: TipoConsulta;
  /** Nombre completo (DNI) o razón social (RUC), tal como lo devuelve el padrón. */
  nombre: string;
  /** Solo RUC: ACTIVO, BAJA DE OFICIO, SUSPENSION TEMPORAL… */
  estado: string | null;
  /** Solo RUC: HABIDO / NO HABIDO. */
  condicion: string | null;
  direccion: string | null;
};

export type ResultadoPadron =
  | { ok: true; datos: DatosPadron; origen: OrigenPadron }
  | { ok: false; motivo: "sin_proveedor" | "no_encontrado" | "sin_respuesta" | "cuota_agotada" | "credenciales"; detalle: string };

// ==================== caché en memoria ====================
// Best-effort, por instancia del servidor: en Vercel hay varias y se reciclan,
// así que esto NO es una garantía, es un ahorro. Sirve para el caso real y
// frecuente: la cajera tipea el RUC, se equivoca en el monto, corrige, y el
// formulario vuelve a consultar el mismo RUC treinta segundos después.
// La memoria DURABLE de clientes ya existe y es `comprobantes` — ver
// `/api/padron`, que busca ahí antes de gastar una consulta.
const TTL_DNI_MS = 24 * 60 * 60 * 1000; // el nombre de una persona no cambia
const TTL_RUC_MS = 60 * 60 * 1000; // estado/condición sí cambian: se refresca cada hora
const MAX_CACHE = 500;
const cache = new Map<string, { datos: DatosPadron; origen: OrigenPadron; vence: number }>();

function leerCache(clave: string): { datos: DatosPadron; origen: OrigenPadron } | null {
  const hit = cache.get(clave);
  if (!hit) return null;
  if (Date.now() > hit.vence) {
    cache.delete(clave);
    return null;
  }
  return { datos: hit.datos, origen: hit.origen };
}

function guardarCache(clave: string, datos: DatosPadron, origen: OrigenPadron, ttl: number) {
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(clave, { datos, origen, vence: Date.now() + ttl });
}

// ==================== adaptadores ====================
// Los nombres de campo salen de la documentación pública de cada proveedor, pero
// varían entre versiones de una misma API — por eso cada campo se lee de una
// lista de nombres posibles en vez de uno solo. Un proveedor que renombra
// `razon_social` a `razonSocial` no debe dejar el campo en blanco sin avisar.
function texto(obj: Record<string, unknown>, ...claves: string[]): string | null {
  for (const clave of claves) {
    const v = obj[clave];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

type Proveedor = {
  url: (tipo: TipoConsulta, numero: string, token: string) => string;
  /** Algunos envuelven la respuesta en `{ data: {...} }`. */
  cuerpo: (json: Record<string, unknown>) => Record<string, unknown> | null;
  /** Dónde viaja el token. Casi todos usan la cabecera `Authorization`, pero
   *  la v1 de apis.net.pe lo quiere en la query string y rechaza el Bearer. */
  auth?: "bearer" | "query";
};

const PROVEEDORES: Record<string, Proveedor> = {
  // https://decolecta.com — también es el motor detrás de apis.net.pe
  decolecta: {
    url: (tipo, n) =>
      tipo === "dni"
        ? `https://api.decolecta.com/v1/reniec/dni?numero=${n}`
        : `https://api.decolecta.com/v1/sunat/ruc?numero=${n}`,
    cuerpo: (json) => json,
  },
  // https://apis.net.pe — v2, con el token en la cabecera.
  apisnetpe: {
    url: (tipo, n) =>
      tipo === "dni"
        ? `https://api.apis.net.pe/v2/reniec/dni?numero=${n}`
        : `https://api.apis.net.pe/v2/sunat/ruc?numero=${n}`,
    cuerpo: (json) => json,
  },
  // apis.net.pe v1: mismo proveedor, otra generación de tokens. Los tokens que
  // empiezan con `sk_` son de esta versión — verificado contra la API real
  // 2026-09-05: en v2 responden "Token invalido" y aquí funcionan. El token va
  // en la query string, no como Bearer.
  apisnetpe_v1: {
    url: (tipo, n, token) => `https://api.apis.net.pe/v1/${tipo}?numero=${n}&token=${token}`,
    cuerpo: (json) => json,
    auth: "query",
  },
  // https://docs.factiliza.com — este sí envuelve en { success, data }
  factiliza: {
    url: (tipo, n) =>
      tipo === "dni" ? `https://api.factiliza.com/v1/dni/info/${n}` : `https://api.factiliza.com/v1/ruc/info/${n}`,
    cuerpo: (json) => (json.data && typeof json.data === "object" ? (json.data as Record<string, unknown>) : null),
  },
};

/** Traduce la respuesta de cualquiera de los proveedores al mismo objeto.
 *  Exportada porque es la pieza que más se rompe cuando un proveedor cambia su
 *  formato — y es la única que se puede probar sin gastar consultas reales. */
export function normalizarRespuestaPadron(tipo: TipoConsulta, numero: string, d: Record<string, unknown>): DatosPadron | null {
  // El nombre de una persona llega de dos formas según el proveedor: ya armado,
  // o en tres pedazos. Se acepta cualquiera de las dos.
  const nombrePersona =
    texto(d, "nombre_completo", "full_name", "nombreCompleto", "nombre") ??
    [
      texto(d, "nombres", "first_name"),
      texto(d, "apellido_paterno", "apellidoPaterno", "first_last_name"),
      texto(d, "apellido_materno", "apellidoMaterno", "second_last_name"),
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

  const nombre =
    tipo === "ruc" ? texto(d, "razon_social", "razonSocial", "nombre_o_razon_social", "nombre") : nombrePersona;

  if (!nombre) return null;

  return {
    numero,
    tipo,
    nombre: nombre.toUpperCase(),
    estado: tipo === "ruc" ? texto(d, "estado", "estado_del_contribuyente")?.toUpperCase() ?? null : null,
    condicion: tipo === "ruc" ? texto(d, "condicion", "condicion_de_domicilio")?.toUpperCase() ?? null : null,
    direccion: texto(d, "direccion_completa", "direccion", "address"),
  };
}

// ==================== SUNAT público (gratis, primera opción) ====================
// El servicio `itfisdenreg` es el del formulario público de denuncias de SUNAT: al
// tipear un DNI o RUC devuelve el nombre para prellenar el «denunciado». Verificado
// contra la API real 2026-09-29 (RUC de la propia SUNAT):
//   RUC  → {"message":"success","lista":[{"apenomdenunciado":"RAZÓN SOCIAL   ",
//           "direstablecimiento":"AV. … - Nro: 1472  - LIMA", …}]}   (sin estado ni condición)
//   nada → {"error":"No existen datos para los filtros seleccionados"}  (HTTP 200, no 404)
// Content-Type llega como text/plain; `respuesta.json()` no lo mira, por eso sirve.
// El DNI usa la misma estructura (`apenomdenunciado`); el caso de éxito del DNI NO se
// verificó con un número real. Por eso el lector es tolerante y, ante cualquier forma
// que no reconoce, devuelve `sin_respuesta` → la consulta cae al proveedor de pago.
// Un formato desconocido nunca produce un nombre inventado.
const URL_SUNAT_PUBLICO = "https://ww1.sunat.gob.pe/ol-ti-itfisdenreg/itfisdenreg.htm";
// Más corto que el del proveedor (5 s): si SUNAT tarda, todavía queda la segunda
// fuente, y entre las dos quien atiende espera 8 s como máximo.
const TOPE_SUNAT_PUBLICO_MS = 3000;

/** PADRON_SUNAT_PUBLICO — vacío: DNI y RUC; `solo_dni`: el RUC va directo al
 *  proveedor (que sí informa estado y condición); `no`: apagado del todo. */
function usaSunatPublico(tipo: TipoConsulta): boolean {
  const modo = (process.env.PADRON_SUNAT_PUBLICO ?? "").trim().toLowerCase();
  if (modo === "no") return false;
  if (modo === "solo_dni") return tipo === "dni";
  return true;
}

// Interruptor de circuito. Una API sin contrato puede bloquear las IP de Vercel, servir
// una página de firewall o simplemente ponerse lenta. Sin esto, cada consulta pagaría 3 s
// de espera antes de llegar al proveedor. Con 3 fallos seguidos SUNAT se salta 5 minutos;
// pasado ese tiempo la siguiente consulta la prueba (y si falla, vuelve a pausar).
// «No existe ese número» NO cuenta como fallo: es una respuesta válida.
// Es por instancia del servidor, igual que la caché: un ahorro, no un candado.
const FALLOS_PARA_PAUSAR = 3;
const PAUSA_SUNAT_MS = 5 * 60 * 1000;
let fallosSunat = 0;
let sunatPausadaHasta = 0;

function registrarFalloSunat() {
  fallosSunat += 1;
  if (fallosSunat >= FALLOS_PARA_PAUSAR) sunatPausadaHasta = Date.now() + PAUSA_SUNAT_MS;
}

function registrarRespuestaSunat() {
  fallosSunat = 0;
  sunatPausadaHasta = 0;
}

/** Solo para las pruebas: la caché y este contador viven en el módulo. */
export function reiniciarSunatPublico() {
  registrarRespuestaSunat();
}

const sinEspacios = (s: string) => s.replace(/\s+/g, " ").trim();

/** Traduce la respuesta de SUNAT público al mismo resultado que el proveedor.
 *  Exportada por lo mismo que `normalizarRespuestaPadron`: es la pieza que se rompe
 *  si SUNAT cambia el formato, y se prueba sin salir a internet. */
export function leerSunatPublico(tipo: TipoConsulta, numero: string, json: unknown): ResultadoPadron {
  const inesperado: ResultadoPadron = { ok: false, motivo: "sin_respuesta", detalle: "El padrón respondió algo inesperado" };
  if (!json || typeof json !== "object" || Array.isArray(json)) return inesperado;
  const cuerpo = json as Record<string, unknown>;

  if (typeof cuerpo.error === "string") {
    return /no existen datos/i.test(cuerpo.error)
      ? { ok: false, motivo: "no_encontrado", detalle: "El padrón no tiene registrado ese número" }
      : inesperado;
  }
  if (!Array.isArray(cuerpo.lista)) return inesperado;
  if (cuerpo.lista.length === 0) {
    return { ok: false, motivo: "no_encontrado", detalle: "El padrón no tiene registrado ese número" };
  }

  const fila = cuerpo.lista[0];
  if (!fila || typeof fila !== "object") return inesperado;
  const f = fila as Record<string, unknown>;
  // El nombre y la dirección vienen rellenados con espacios hasta un ancho fijo.
  const nombre = texto(f, "apenomdenunciado");
  const direccion = texto(f, "direstablecimiento");
  const datos = normalizarRespuestaPadron(tipo, numero, {
    ...f,
    nombre: nombre ? sinEspacios(nombre) : null,
    direccion: direccion ? sinEspacios(direccion) : null,
  });
  return datos ? { ok: true, datos, origen: "sunat_publico" } : inesperado;
}

async function consultarSunatPublico(tipo: TipoConsulta, numero: string): Promise<ResultadoPadron> {
  const url =
    tipo === "dni"
      ? `${URL_SUNAT_PUBLICO}?accion=obtenerDatosDni&numDocumento=${numero}`
      : `${URL_SUNAT_PUBLICO}?accion=obtenerDatosRuc&nroRuc=${numero}`;

  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TOPE_SUNAT_PUBLICO_MS),
      cache: "no-store",
    });
  } catch {
    registrarFalloSunat();
    return { ok: false, motivo: "sin_respuesta", detalle: "El padrón no respondió a tiempo" };
  }
  if (!respuesta.ok) {
    registrarFalloSunat();
    return { ok: false, motivo: "sin_respuesta", detalle: `El padrón respondió ${respuesta.status}` };
  }

  let json: unknown;
  try {
    json = await respuesta.json();
  } catch {
    // Típico de un firewall que devuelve su página HTML con estado 200.
    registrarFalloSunat();
    return { ok: false, motivo: "sin_respuesta", detalle: "El padrón devolvió algo que no es JSON" };
  }

  const resultado = leerSunatPublico(tipo, numero, json);
  if (resultado.ok || resultado.motivo === "no_encontrado") registrarRespuestaSunat();
  else registrarFalloSunat();
  return resultado;
}

// ==================== orden de fuentes ====================
export async function consultarPadron(tipo: TipoConsulta, numero: string): Promise<ResultadoPadron> {
  const clave = `${tipo}:${numero}`;
  const enCache = leerCache(clave);
  if (enCache) return { ok: true, ...enCache };

  const ttl = tipo === "dni" ? TTL_DNI_MS : TTL_RUC_MS;

  // 1) SUNAT público. Encontrado → listo, sin gastar una consulta pagada. No lo
  //    encuentra o falla → sigue al proveedor de pago, que es lo que se pidió.
  let publico: ResultadoPadron | null = null;
  if (usaSunatPublico(tipo)) {
    publico =
      Date.now() < sunatPausadaHasta
        ? { ok: false, motivo: "sin_respuesta", detalle: "El padrón no respondió a tiempo" }
        : await consultarSunatPublico(tipo, numero);
    if (publico.ok) {
      guardarCache(clave, publico.datos, publico.origen, ttl);
      return publico;
    }
  }

  // 2) Proveedor de pago.
  const pago = await consultarProveedorPago(tipo, numero);
  if (pago.ok) {
    guardarCache(clave, pago.datos, pago.origen, ttl);
    return pago;
  }

  // Fallaron las dos. Si el proveedor ni está configurado, decir «la consulta
  // automática no está activada» sería falso (SUNAT sí estaba activa): se informa
  // por qué falló SUNAT. Si el proveedor sí está, su motivo manda (cuota, credenciales…).
  if (pago.motivo === "sin_proveedor" && publico) return publico;
  return pago;
}

async function consultarProveedorPago(tipo: TipoConsulta, numero: string): Promise<ResultadoPadron> {
  const nombreProveedor = process.env.PADRON_PROVEEDOR;
  const token = process.env.PADRON_TOKEN;
  if (!nombreProveedor || !token) {
    return { ok: false, motivo: "sin_proveedor", detalle: "No hay proveedor de padrón configurado" };
  }
  const proveedor = PROVEEDORES[nombreProveedor];
  if (!proveedor) {
    return {
      ok: false,
      motivo: "sin_proveedor",
      detalle: `PADRON_PROVEEDOR="${nombreProveedor}" no existe. Opciones: ${Object.keys(PROVEEDORES).join(", ")}`,
    };
  }

  let respuesta: Response;
  try {
    // 5 segundos y se corta. Quien atiende no puede quedarse mirando un spinner
    // porque la API de un tercero está lenta: se degrada a escribir el nombre
    // a mano y la venta sigue (principio 9).
    respuesta = await fetch(proveedor.url(tipo, numero, token), {
      headers:
        proveedor.auth === "query"
          ? { Accept: "application/json" }
          : { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, motivo: "sin_respuesta", detalle: "El padrón no respondió a tiempo" };
  }

  if (respuesta.status === 401 || respuesta.status === 403) {
    return { ok: false, motivo: "credenciales", detalle: "El token del padrón fue rechazado" };
  }
  if (respuesta.status === 429) {
    return { ok: false, motivo: "cuota_agotada", detalle: "Se agotó la cuota de consultas del padrón" };
  }
  if (respuesta.status === 404 || respuesta.status === 422) {
    return { ok: false, motivo: "no_encontrado", detalle: "El padrón no tiene registrado ese número" };
  }
  if (!respuesta.ok) {
    return { ok: false, motivo: "sin_respuesta", detalle: `El padrón respondió ${respuesta.status}` };
  }

  let json: Record<string, unknown>;
  try {
    json = (await respuesta.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, motivo: "sin_respuesta", detalle: "El padrón devolvió algo que no es JSON" };
  }

  const cuerpo = proveedor.cuerpo(json);
  const datos = cuerpo ? normalizarRespuestaPadron(tipo, numero, cuerpo) : null;
  if (!datos) return { ok: false, motivo: "no_encontrado", detalle: "El padrón no tiene registrado ese número" };

  return { ok: true, datos, origen: "proveedor" };
}

// ==================== lectura de negocio ====================
// Un RUC dado de baja o "no habido" no es un detalle cosmético: SUNAT rechaza la
// factura emitida a ese receptor y la clienta pierde el crédito fiscal — con el
// correlativo ya consumido y sin forma de deshacerlo. Por eso la advertencia se
// calcula aquí, en el dominio, y no se deja a criterio de la pantalla.
export function advertenciasDe(datos: DatosPadron): string[] {
  const avisos: string[] = [];
  if (datos.tipo !== "ruc") return avisos;
  if (datos.estado && datos.estado !== "ACTIVO") {
    avisos.push(`Este RUC está "${datos.estado}" en SUNAT. Una factura a un RUC que no está activo es rechazada.`);
  }
  if (datos.condicion && datos.condicion !== "HABIDO") {
    avisos.push(`SUNAT marca este RUC como "${datos.condicion}". El cliente no podría usar la factura como crédito fiscal.`);
  }
  return avisos;
}

/** Lo que devuelve `GET /api/padron`. Vive aquí, con el resto del dominio, para
 *  que el formulario no tenga que importar tipos desde un route handler. */
export type RespuestaPadron = {
  tipo: TipoConsulta;
  numero: string;
  nombre: string | null;
  estado: string | null;
  condicion: string | null;
  direccion: string | null;
  /** De dónde salió el nombre: del padrón oficial, de un comprobante anterior, o de ningún lado. */
  fuente: "padron" | "historial" | "ninguna";
  /** Solo cuando fuente = "padron": qué servicio contestó. `sunat_publico` es el gratis —
   *  para RUC no informa estado ni condición—; `proveedor` es el de pago. */
  via: OrigenPadron | null;
  advertencias: string[];
  /** Solo cuando fuente = "ninguna": por qué no se pudo. */
  motivo: string | null;
};
