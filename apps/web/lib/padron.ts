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

export type TipoConsulta = "dni" | "ruc";

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
  | { ok: true; datos: DatosPadron }
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
const cache = new Map<string, { datos: DatosPadron; vence: number }>();

function leerCache(clave: string): DatosPadron | null {
  const hit = cache.get(clave);
  if (!hit) return null;
  if (Date.now() > hit.vence) {
    cache.delete(clave);
    return null;
  }
  return hit.datos;
}

function guardarCache(clave: string, datos: DatosPadron, ttl: number) {
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(clave, { datos, vence: Date.now() + ttl });
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
  url: (tipo: TipoConsulta, numero: string) => string;
  /** Algunos envuelven la respuesta en `{ data: {...} }`. */
  cuerpo: (json: Record<string, unknown>) => Record<string, unknown> | null;
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
  // https://apis.net.pe
  apisnetpe: {
    url: (tipo, n) =>
      tipo === "dni"
        ? `https://api.apis.net.pe/v2/reniec/dni?numero=${n}`
        : `https://api.apis.net.pe/v2/sunat/ruc?numero=${n}`,
    cuerpo: (json) => json,
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

export async function consultarPadron(tipo: TipoConsulta, numero: string): Promise<ResultadoPadron> {
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

  const clave = `${tipo}:${numero}`;
  const enCache = leerCache(clave);
  if (enCache) return { ok: true, datos: enCache };

  let respuesta: Response;
  try {
    // 5 segundos y se corta. Quien atiende no puede quedarse mirando un spinner
    // porque la API de un tercero está lenta: se degrada a escribir el nombre
    // a mano y la venta sigue (principio 9).
    respuesta = await fetch(proveedor.url(tipo, numero), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
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

  guardarCache(clave, datos, tipo === "dni" ? TTL_DNI_MS : TTL_RUC_MS);
  return { ok: true, datos };
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
    avisos.push(`SUNAT marca este RUC como "${datos.condicion}". La clienta no podría usar la factura como crédito fiscal.`);
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
  advertencias: string[];
  /** Solo cuando fuente = "ninguna": por qué no se pudo. */
  motivo: string | null;
};
