import { z } from "zod";

// El Libro de Reclamaciones de la tienda (ADR-0679, Felipe 2026-11-18): la lógica pura de la hoja. Las MISMAS reglas que la base
// (`retail.tienda_registrar_hoja_reclamacion`, 20261118145000), para que el formulario diga «Revisa» en el campo antes de enviar; la
// base las vuelve a revisar y es la que manda. Si una cambia aquí, cambia allá (lo vigila `libro-reclamaciones.test.ts` caso por caso).

export type TipoHoja = "reclamo" | "queja";
export type TipoBien = "producto" | "servicio";
export type TipoDocumentoHoja = "dni" | "ce" | "pasaporte";

/** Los largos de la base, letra por letra (después de limpiar). */
export const LARGOS = {
  nombre: [3, 120],
  domicilio: [5, 200],
  apoderado: [3, 120],
  bienDescripcion: [3, 300],
  detalle: [10, 3000],
  pedido: [3, 1000],
} as const;
export const MONTO_MAXIMO = 1_000_000;

/** Lo que la persona va escribiendo. */
export type BorradorHoja = {
  tipo: TipoHoja | null;
  nombre: string;
  tipoDocumento: TipoDocumentoHoja;
  documento: string;
  domicilio: string;
  telefono: string;
  correo: string;
  menor: boolean;
  apoderado: string;
  /** Si reclama un menor: los datos de su padre, madre o representante (Anexo I; informe legal 2026-11-18). */
  apoderadoTipoDocumento: TipoDocumentoHoja;
  apoderadoDocumento: string;
  apoderadoDomicilio: string;
  apoderadoTelefono: string;
  apoderadoCorreo: string;
  bienTipo: TipoBien | null;
  /** null: la tienda online. */
  ubicacionId: string | null;
  monto: string;
  bienDescripcion: string;
  detalle: string;
  pedido: string;
  /** «Declaro que lo que escribí es correcto»: la firma del libro virtual. */
  conforme: boolean;
};

export const BORRADOR_VACIO: BorradorHoja = {
  tipo: null,
  nombre: "",
  tipoDocumento: "dni",
  documento: "",
  domicilio: "",
  telefono: "",
  correo: "",
  menor: false,
  apoderado: "",
  apoderadoTipoDocumento: "dni",
  apoderadoDocumento: "",
  apoderadoDomicilio: "",
  apoderadoTelefono: "",
  apoderadoCorreo: "",
  bienTipo: null,
  ubicacionId: null,
  monto: "",
  bienDescripcion: "",
  detalle: "",
  pedido: "",
  conforme: false,
};

/** Los campos, en el orden en que se llenan (la guía enciende el primero que falta). Son los `campo` que devuelve la base. */
export const CAMPOS = [
  "nombre",
  "documento",
  "domicilio",
  "telefono",
  "correo",
  "apoderado",
  "apoderado_documento",
  "apoderado_domicilio",
  "apoderado_telefono",
  "apoderado_correo",
  "bien_tipo",
  "monto",
  "bien_descripcion",
  "tipo",
  "detalle",
  "pedido",
  "conforme",
] as const;
export type CampoHoja = (typeof CAMPOS)[number] | "ubicacion";

export const ETIQUETA: Record<CampoHoja, string> = {
  nombre: "Nombre completo",
  documento: "Documento",
  domicilio: "Domicilio",
  telefono: "Teléfono",
  correo: "Correo",
  apoderado: "Nombre del padre, la madre o quien te representa",
  apoderado_documento: "Su documento",
  apoderado_domicilio: "Su domicilio",
  apoderado_telefono: "Su teléfono",
  apoderado_correo: "Su correo",
  bien_tipo: "¿Fue un producto o un servicio?",
  ubicacion: "¿En qué tienda?",
  monto: "Monto reclamado",
  bien_descripcion: "¿Qué compraste o contrataste?",
  tipo: "¿Es un reclamo o una queja?",
  detalle: "¿Qué pasó?",
  pedido: "¿Qué pides?",
  conforme: "Lo que escribí es correcto",
};

export const NOMBRE_DOCUMENTO: Record<TipoDocumentoHoja, string> = { dni: "DNI", ce: "Carné de extranjería", pasaporte: "Pasaporte" };

/** Lo que es cada uno, con las palabras del reglamento (DS 011-2011-PCM), dicho para el cliente. */
export const QUE_ES: Record<TipoHoja, string> = {
  reclamo: "No estás conforme con el producto o el servicio.",
  queja: "No estás conforme con la atención, pero no es sobre el producto o el servicio.",
};

/** «Reclamo (no estás conforme con el producto o el servicio)»: el tipo con lo que significa, en la constancia y en el correo. */
export const tipoConSuSentido = (tipo: TipoHoja) =>
  `${tipo === "reclamo" ? "Reclamo" : "Queja"} (${QUE_ES[tipo].replace(/\.$/, "").replace(/^./, (l) => l.toLowerCase())})`;

/** El texto como lo guarda la base: sin invisibles, espacios seguidos en uno, sin espacios en las puntas. */
export function limpiar(texto: string, unaLinea = false): string {
  const t = texto
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F­​-‏‪-‮⁠-⁤⁦-⁩﻿]/g, "")
    .replace(/[\t   - 　]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return unaLinea ? t.replace(/\n/g, " ").replace(/ {2,}/g, " ") : t;
}

const largo = (t: string) => [...t].length;
const entre = (t: string, [min, max]: readonly [number, number]) => largo(t) >= min && largo(t) <= max;

export const documentoLimpio = (d: string) => d.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
export const telefonoLimpio = (t: string) => t.replace(/[^0-9+]/g, "");
export const correoLimpio = (c: string) => c.trim().toLowerCase();

export function documentoValido(tipo: TipoDocumentoHoja, documento: string): boolean {
  const d = documentoLimpio(documento);
  return tipo === "dni" ? /^[0-9]{8}$/.test(d) : /^[A-Z0-9]{6,12}$/.test(d);
}
export const telefonoValido = (t: string) => /^\+?[0-9]{6,15}$/.test(telefonoLimpio(t));
export const correoValido = (c: string) => correoLimpio(c).length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correoLimpio(c));
/** Vacío vale (es opcional); si se escribe: hasta 7 cifras, punto y 2 decimales, sin pasar el tope. */
export function montoValido(m: string): boolean {
  const t = m.trim();
  if (t === "") return true;
  return /^[0-9]{1,7}([.][0-9]{1,2})?$/.test(t) && Number(t) <= MONTO_MAXIMO;
}

/** El estado de un campo: listo, mal escrito, vacío (falta) u opcional (se puede dejar). */
export type EstadoCampoHoja = "ok" | "mal" | "vacio" | "opcional";

export function estadoDeLaHoja(b: BorradorHoja): Record<CampoHoja, EstadoCampoHoja> {
  const texto = (t: string, rango: readonly [number, number], unaLinea = false): EstadoCampoHoja => {
    const l = limpiar(t, unaLinea);
    if (l === "") return "vacio";
    return entre(l, rango) ? "ok" : "mal";
  };
  return {
    nombre: texto(b.nombre, LARGOS.nombre, true),
    documento: b.documento.trim() === "" ? "vacio" : documentoValido(b.tipoDocumento, b.documento) ? "ok" : "mal",
    domicilio: texto(b.domicilio, LARGOS.domicilio, true),
    telefono: b.telefono.trim() === "" ? "vacio" : telefonoValido(b.telefono) ? "ok" : "mal",
    correo: b.correo.trim() === "" ? "vacio" : correoValido(b.correo) ? "ok" : "mal",
    apoderado: b.menor ? texto(b.apoderado, LARGOS.apoderado, true) : "opcional",
    apoderado_documento: !b.menor
      ? "opcional"
      : b.apoderadoDocumento.trim() === ""
        ? "vacio"
        : documentoValido(b.apoderadoTipoDocumento, b.apoderadoDocumento)
          ? "ok"
          : "mal",
    apoderado_domicilio: b.menor ? texto(b.apoderadoDomicilio, LARGOS.domicilio, true) : "opcional",
    apoderado_telefono: !b.menor ? "opcional" : b.apoderadoTelefono.trim() === "" ? "vacio" : telefonoValido(b.apoderadoTelefono) ? "ok" : "mal",
    apoderado_correo: !b.menor ? "opcional" : b.apoderadoCorreo.trim() === "" ? "vacio" : correoValido(b.apoderadoCorreo) ? "ok" : "mal",
    bien_tipo: b.bienTipo ? "ok" : "vacio",
    ubicacion: "opcional",
    monto: b.monto.trim() === "" ? "opcional" : montoValido(b.monto) ? "ok" : "mal",
    bien_descripcion: texto(b.bienDescripcion, LARGOS.bienDescripcion),
    tipo: b.tipo ? "ok" : "vacio",
    detalle: texto(b.detalle, LARGOS.detalle),
    pedido: texto(b.pedido, LARGOS.pedido),
    conforme: b.conforme ? "ok" : "vacio",
  };
}

/** Lo que todavía no deja enviar, en el orden del formulario. Lo opcional nunca está aquí. */
export function faltanEnLaHoja(estado: Record<CampoHoja, EstadoCampoHoja>): CampoHoja[] {
  return CAMPOS.filter((c) => estado[c] === "vacio" || estado[c] === "mal");
}

/** Lo que dice el campo debajo cuando está mal escrito (vacío no se regaña: la guía dice qué sigue). */
export function problemaDelCampo(campo: CampoHoja, b: BorradorHoja): string | null {
  const e = estadoDeLaHoja(b)[campo];
  if (e !== "mal") return null;
  switch (campo) {
    case "nombre":
    case "apoderado":
      return "Escribe el nombre completo.";
    case "documento":
      return b.tipoDocumento === "dni" ? "El DNI tiene 8 números." : "Escribe el número tal cual está en tu documento (6 a 12 letras o números).";
    case "apoderado_documento":
      return b.apoderadoTipoDocumento === "dni" ? "El DNI tiene 8 números." : "Tal cual está en su documento (6 a 12 letras o números).";
    case "apoderado_domicilio":
      return "Escribe la dirección completa.";
    case "apoderado_telefono":
      return "Escribe un número de 6 a 15 cifras.";
    case "apoderado_correo":
      return "Revisa el correo: algo como nombre@correo.com.";
    case "domicilio":
      return "Escribe la dirección completa.";
    case "telefono":
      return "Escribe un número de 6 a 15 cifras.";
    case "correo":
      return "Revisa el correo: algo como nombre@correo.com.";
    case "monto":
      return "Escribe solo el número, con punto para los céntimos (89.90).";
    case "bien_descripcion":
      return largo(limpiar(b.bienDescripcion)) > LARGOS.bienDescripcion[1] ? "Acórtalo un poco." : "Cuéntanos un poco más.";
    case "detalle":
      return largo(limpiar(b.detalle)) > LARGOS.detalle[1] ? "Acórtalo un poco para poder enviarlo." : `Escribe al menos ${LARGOS.detalle[0]} letras.`;
    case "pedido":
      return largo(limpiar(b.pedido)) > LARGOS.pedido[1] ? "Acórtalo un poco." : "Cuéntanos qué te gustaría que hagamos.";
    default:
      return null;
  }
}

/** Lo que viaja a la base (`p_datos`), con los nombres de la base. Sin el carácter nulo (U+0000, sale al pegar de algunos PDF):
 *  la base no lo acepta en un texto y la hoja no se podría enviar nunca (/chaos 2026-11-18). */
export function datosParaLaBase(b: BorradorHoja): Record<string, string | boolean> {
  const d = datosCrudos(b);
  for (const k of Object.keys(d)) {
    const v = d[k];
    if (typeof v === "string") d[k] = v.replace(/\u0000/g, "");
  }
  return d;
}

function datosCrudos(b: BorradorHoja): Record<string, string | boolean> {
  return {
    tipo: b.tipo ?? "",
    nombre: b.nombre,
    tipo_documento: b.tipoDocumento,
    documento: b.documento,
    domicilio: b.domicilio,
    telefono: b.telefono,
    correo: b.correo,
    menor_de_edad: b.menor,
    apoderado: b.menor ? b.apoderado : "",
    apoderado_tipo_documento: b.menor ? b.apoderadoTipoDocumento : "",
    apoderado_documento: b.menor ? b.apoderadoDocumento : "",
    apoderado_domicilio: b.menor ? b.apoderadoDomicilio : "",
    apoderado_telefono: b.menor ? b.apoderadoTelefono : "",
    apoderado_correo: b.menor ? b.apoderadoCorreo : "",
    bien_tipo: b.bienTipo ?? "",
    monto: b.monto.trim(),
    bien_descripcion: b.bienDescripcion,
    detalle: b.detalle,
    pedido: b.pedido,
    ubicacion_id: b.ubicacionId ?? "",
    conforme: b.conforme,
  };
}

/** Lo mismo que hace que dos envíos sean la misma hoja: si cambia algo, es otro borrador (y otra marca). */
export const claveDelBorrador = (b: BorradorHoja) => JSON.stringify(datosParaLaBase(b));

// ---------- Lo que contesta la base ----------

export type ResultadoHoja =
  | { estado: "registrada"; id: string; codigo: string }
  | { estado: "invalido"; campo: CampoHoja | null }
  | { estado: "limite" }
  | { estado: "sin_respuesta" };

const esquemaRegistro = z.discriminatedUnion("estado", [
  z.object({ estado: z.literal("registrada"), id: z.string().uuid(), codigo: z.string().regex(/^[0-9]{6}-[0-9]{4}$/) }),
  z.object({ estado: z.literal("invalido"), campo: z.string().nullish() }),
  z.object({ estado: z.literal("limite") }),
]);

/** La respuesta de `tienda_registrar_hoja_reclamacion`. Una forma que no se entiende es «sin respuesta» (nunca se finge que se guardó). */
export function leerRegistro(dato: unknown): ResultadoHoja {
  const r = esquemaRegistro.safeParse(dato);
  if (!r.success) return { estado: "sin_respuesta" };
  if (r.data.estado === "invalido") {
    const campo = [...CAMPOS, "ubicacion"].includes(r.data.campo ?? "") ? (r.data.campo as CampoHoja) : null;
    return { estado: "invalido", campo };
  }
  return r.data;
}

export const MENSAJE_SIN_RED = "No pudimos enviar tu hoja: revisa tu conexión y vuelve a intentarlo. Lo que escribiste sigue aquí.";

export function mensajeDelEnvio(r: Exclude<ResultadoHoja, { estado: "registrada" }>): string {
  switch (r.estado) {
    case "invalido":
      return r.campo
        ? `Revisa «${ETIQUETA[r.campo]}»: algo no está bien escrito.`
        : "Algo de la hoja no está bien escrito. Revísala y vuelve a intentarlo.";
    case "limite":
      return "Desde esta conexión ya se enviaron varias hojas en la última hora. Espera un rato y vuelve a intentarlo, o escríbenos al WhatsApp de una tienda.";
    case "sin_respuesta":
      return "No pudimos guardar tu hoja ahora. Vuelve a intentarlo en unos minutos: lo que escribiste sigue aquí.";
  }
}

// ---------- La constancia ----------

const esquemaHoja = z.object({
  id: z.string().uuid(),
  codigo: z.string(),
  /** El código del libro (PARTE 5, 20261118170000). Sin el dato, el de la tienda online. */
  libro_codigo: z.string().optional().default("LR-WEB-01"),
  creada_en: z.string(),
  proveedor: z.object({ razon_social: z.string(), ruc: z.string(), domicilio: z.string() }),
  tienda: z.object({ nombre: z.string(), direccion: z.string().nullable() }).nullable(),
  consumidor: z.object({
    nombre: z.string(),
    tipo_documento: z.enum(["dni", "ce", "pasaporte"]),
    documento: z.string(),
    domicilio: z.string(),
    telefono: z.string(),
    correo: z.string(),
    menor_de_edad: z.boolean(),
    apoderado: z.string().nullable(),
    apoderado_datos: z
      .object({
        tipo_documento: z.enum(["dni", "ce", "pasaporte"]).nullable(),
        documento: z.string().nullable(),
        domicilio: z.string().nullable(),
        telefono: z.string().nullable(),
        correo: z.string().nullable(),
      })
      .nullable()
      .optional()
      .default(null),
  }),
  bien: z.object({ tipo: z.enum(["producto", "servicio"]), monto: z.union([z.number(), z.string()]).nullable(), descripcion: z.string() }),
  tipo: z.enum(["reclamo", "queja"]),
  detalle: z.string(),
  pedido: z.string(),
  /** Si la copia ya salió al correo (PARTE 2, 20261118150000). Sin el dato, como si no. */
  copia_enviada: z.boolean().optional().default(false),
  /** La respuesta de CAYLA y cuándo (PARTE 4, 20261118152000). Sin el dato, todavía sin responder. */
  respuesta: z.string().nullable().optional().default(null),
  respondida_en: z.string().nullable().optional().default(null),
});
export type Hoja = z.infer<typeof esquemaHoja>;

/** La hoja de `tienda_ver_hoja_reclamacion`, o null (no existe, la marca no coincide o la forma no se entiende). */
export function leerHoja(dato: unknown): Hoja | null {
  const r = esquemaHoja.safeParse(dato);
  return r.success ? r.data : null;
}

/** «S/ 89.90», o null sin monto. */
export function montoEnSoles(monto: number | string | null): string | null {
  if (monto === null || monto === "") return null;
  const n = Number(monto);
  if (!Number.isFinite(n)) return null;
  return `S/ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** «18 de noviembre de 2026, 9:45 a. m.», en hora de Lima. */
export function fechaDeLaHoja(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Los datos de CAYLA que se muestran antes de llenar; los de respaldo son los mismos de la base (`tienda_libro_reclamaciones_datos`). */
export type DatosProveedor = { razonSocial: string; ruc: string; domicilio: string };
export const PROVEEDOR_DE_RESPALDO: DatosProveedor = {
  razonSocial: "CAYLA S.A.C.",
  ruc: "20605964550",
  domicilio: "Mz. Q Lt. 26, Urb. San Andrés V Etapa, Víctor Larco Herrera, Trujillo, La Libertad",
};
export function leerProveedor(dato: unknown): DatosProveedor {
  const r = z.object({ razon_social: z.string().min(1), ruc: z.string().min(1), domicilio: z.string().min(1) }).safeParse(dato);
  return r.success ? { razonSocial: r.data.razon_social, ruc: r.data.ruc, domicilio: r.data.domicilio } : PROVEEDOR_DE_RESPALDO;
}

// ---------- La copia al correo (PARTE 2) ----------

/** Una copia por mandar, como la entrega `tienda_libro_copias_reclamar`: la hoja y la marca (para el enlace a su constancia). */
export type CopiaPorMandar = { hoja: Hoja; marca: string; intentos: number };

/** Las copias de `tienda_libro_copias_reclamar` (o las respuestas de `tienda_libro_respuestas_reclamar`, con `lista: "respuestas"`), o
 *  null si la forma no se entiende. Una rara se salta (no tumba a las demás). */
export function leerCopias(dato: unknown, lista: "copias" | "respuestas" = "copias"): CopiaPorMandar[] | null {
  const r = z.object({ [lista]: z.array(z.unknown()) }).safeParse(dato);
  if (!r.success) return null;
  return (r.data[lista] as unknown[]).flatMap((c) => {
    const x = z.object({ marca: z.string().uuid(), intentos: z.number(), hoja: z.unknown() }).safeParse(c);
    const hoja = x.success ? leerHoja(x.data.hoja) : null;
    return x.success && hoja ? [{ hoja, marca: x.data.marca, intentos: x.data.intentos }] : [];
  });
}

/** El enlace a la constancia: la dirección de la tienda, el id y la marca. */
export const enlaceDeLaHoja = (origen: string, id: string, marca: string) =>
  `${origen.replace(/\/+$/, "")}/libro-de-reclamaciones/hoja/${id}?m=${marca}`;

const escapar = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Si reclama un menor: quién lo representa, con sus datos. */
export function filasDelApoderado(h: Hoja): [string, string][] {
  if (!h.consumidor.menor_de_edad) return [];
  const a = h.consumidor.apoderado_datos;
  return [
    ["Padre, madre o apoderado", h.consumidor.apoderado ?? ""],
    ...(a?.documento ? [[`Su ${NOMBRE_DOCUMENTO[a.tipo_documento ?? "dni"]}`, a.documento] as [string, string]] : []),
    ...(a?.domicilio ? [["Su domicilio", a.domicilio] as [string, string]] : []),
    ...(a?.telefono ? [["Su teléfono", a.telefono] as [string, string]] : []),
    ...(a?.correo ? [["Su correo", a.correo] as [string, string]] : []),
  ];
}

/** Las filas de la hoja, en el orden de la constancia: [título, valor]. Una sola definición para el texto y el HTML del correo. */
function filasDeLaHoja(h: Hoja): [string, [string, string][]][] {
  return [
    [
      "Proveedor",
      [
        ["Razón social", h.proveedor.razon_social],
        ["RUC", h.proveedor.ruc],
        ["Domicilio", h.proveedor.domicilio],
        ["Tienda", h.tienda ? `${h.tienda.nombre}${h.tienda.direccion ? ` · ${h.tienda.direccion}` : ""}` : "Tienda online"],
      ],
    ],
    [
      "1. Identificación del consumidor",
      [
        ["Nombre", h.consumidor.nombre],
        [NOMBRE_DOCUMENTO[h.consumidor.tipo_documento], h.consumidor.documento],
        ["Domicilio", h.consumidor.domicilio],
        ["Teléfono", h.consumidor.telefono],
        ["Correo", h.consumidor.correo],
        ...filasDelApoderado(h),
      ],
    ],
    [
      "2. Identificación del bien contratado",
      [
        ["Tipo", h.bien.tipo === "producto" ? "Producto" : "Servicio"],
        ["Monto reclamado", montoEnSoles(h.bien.monto) ?? "—"],
        ["Descripción", h.bien.descripcion],
      ],
    ],
    [
      "3. Detalle de la reclamación",
      [
        ["Tipo", tipoConSuSentido(h.tipo)],
        ["Detalle", h.detalle],
        ["Pedido", h.pedido],
      ],
    ],
  ];
}

export const NOTA_LEGAL =
  "La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el Indecopi. El proveedor debe dar respuesta en un plazo no mayor a quince (15) días hábiles.";

/** El correo con la copia de la hoja: asunto, texto plano y HTML (todo lo que escribió la persona va escapado en el HTML). */
export function correoDeLaHoja(h: Hoja, enlace: string): { asunto: string; texto: string; html: string } {
  const asunto = `Tu hoja de reclamación N.° ${h.codigo} · CAYLA`;
  const libro = `Libro de Reclamaciones ${h.libro_codigo}`;
  const intro = `El ${fechaDeLaHoja(h.creada_en)} recibimos tu ${h.tipo}. Esta es la copia de tu hoja del Libro de Reclamaciones. CAYLA te responde a este correo en un plazo máximo de 15 días hábiles.`;
  const filas = filasDeLaHoja(h);
  const texto = [
    `Hoja de reclamación N.° ${h.codigo} · ${libro}`,
    "",
    intro,
    "",
    ...filas.flatMap(([titulo, datos]) => [titulo.toUpperCase(), ...datos.map(([t, v]) => `${t}: ${v}`), ""]),
    `Ver o imprimir tu hoja: ${enlace}`,
    "",
    NOTA_LEGAL,
  ].join("\n");
  const html = [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1c1a17;max-width:640px">`, // tema-fijo: un correo no lee los tokens de la tienda
    `<p style="margin:0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#7a6e63">Hoja de reclamación</p>`, // tema-fijo: un correo no lee los tokens de la tienda
    `<h1 style="margin:4px 0 12px;font-size:24px">N.° ${escapar(h.codigo)}</h1>`,
    `<p style="margin:0 0 12px;font-size:12px">${escapar(libro)}</p>`,
    `<p>${escapar(intro)}</p>`,
    ...filas.map(
      ([titulo, datos]) =>
        `<h2 style="margin:20px 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase">${escapar(titulo)}</h2><table style="border-collapse:collapse;width:100%">${datos
          .map(
            ([t, v]) =>
              `<tr><td style="padding:3px 12px 3px 0;color:#7a6e63;vertical-align:top;white-space:nowrap">${escapar(t)}</td><td style="padding:3px 0;white-space:pre-line">${escapar(v)}</td></tr>`, // tema-fijo: un correo no lee los tokens de la tienda
          )
          .join("")}</table>`,
    ),
    `<p style="margin-top:20px"><a href="${escapar(enlace)}">Ver o imprimir tu hoja</a></p>`,
    `<p style="margin-top:20px;font-size:12px;color:#7a6e63">${escapar(NOTA_LEGAL)}</p>`, // tema-fijo: un correo no lee los tokens de la tienda
    `</div>`,
  ].join("");
  return { asunto, texto, html };
}

/** El correo con la respuesta de CAYLA a una hoja: la respuesta primero y, debajo, lo que el cliente reclamó (todo escapado en el HTML). */
export function correoDeLaRespuesta(h: Hoja, enlace: string): { asunto: string; texto: string; html: string } {
  const asunto = `Respuesta a tu hoja de reclamación N.° ${h.codigo} · CAYLA`;
  const intro = `Hola, ${h.consumidor.nombre}. Esta es la respuesta de CAYLA a tu ${h.tipo} del ${fechaDeLaHoja(h.creada_en)} (hoja N.° ${h.codigo}).`;
  const respuesta = h.respuesta ?? "";
  const texto = [
    intro,
    "",
    "RESPUESTA DE CAYLA",
    respuesta,
    "",
    "LO QUE RECLAMASTE",
    `Detalle: ${h.detalle}`,
    `Pedido: ${h.pedido}`,
    "",
    `Ver tu hoja completa: ${enlace}`,
    "",
    "Si no estás conforme con la respuesta, puedes acudir al Indecopi.",
  ].join("\n");
  const html = [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1c1a17;max-width:640px">`, // tema-fijo: un correo no lee los tokens de la tienda
    `<p>${escapar(intro)}</p>`,
    `<h2 style="margin:20px 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase">Respuesta de CAYLA</h2>`,
    `<p style="white-space:pre-line">${escapar(respuesta)}</p>`,
    `<h2 style="margin:20px 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase">Lo que reclamaste</h2>`,
    `<p style="white-space:pre-line;color:#7a6e63">${escapar(h.detalle)}<br>${escapar(h.pedido)}</p>`, // tema-fijo: un correo no lee los tokens de la tienda
    `<p style="margin-top:20px"><a href="${escapar(enlace)}">Ver tu hoja completa</a></p>`,
    `<p style="margin-top:20px;font-size:12px;color:#7a6e63">Si no estás conforme con la respuesta, puedes acudir al Indecopi.</p>`, // tema-fijo: un correo no lee los tokens de la tienda
    `</div>`,
  ].join("");
  return { asunto, texto, html };
}

/** La línea de privacidad de la hoja (informe legal 2026-11-18: el libro trata datos por obligación legal y hay que decirlo). */
export const LINEA_PRIVACIDAD = "Usamos tus datos solo para atender tu reclamo y los guardamos 2 años, como pide la ley.";
