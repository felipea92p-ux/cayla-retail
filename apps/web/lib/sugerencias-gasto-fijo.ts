// Lo que la ficha de un gasto fijo dice y pide según la categoría elegida (ADR-0290 para los ejemplos; ADR-0452, act. 2026-10-22, para
// los títulos, las ayudas y qué campos se piden): con «Alquileres», el código se llama «N.º de contrato», no hay «recibo» sino un aviso
// de que toca pagar, y «Vence el contrato» va primero; con «Luz» y «Agua», «N.º de suministro» y sin fecha de vencimiento (el servicio no
// vence); con «Internet» y «Telefonía», el cliente o contrato y el número de la línea, y la fecha solo si el plan tiene permanencia.
// «Luz», «Agua», «Internet», «Telefonía» (cuenta 636) y «Software y suscripciones» (639) las crea la migración 20261022205000 (ADR-0477); «Servicios básicos»
// (`servicios_basicos`, que conserva su código y su nombre) queda para el baño, el gas y la vigilancia, y ya no promete luz ni teléfono.
// La fuente es la CATEGORÍA (`categorias_gasto.codigo`, nunca el nombre visible, que se renombra). Una categoría que un líder crea sin
// deploy, o ninguna elegida todavía, cae al texto neutro, que pide todo: nunca al texto de otra. Sin azar y sin red. Solo dice qué
// mostrar: lo que la persona ya cargó nunca se esconde (`pideVence`, `formasParaElegir`). Ninguna de estas ayudas pide el número de
// cuenta bancaria: la cuenta es solo de líder y admin (ADR-0452) y el código lo ve cualquiera que vea el fijo.

import type { FormaDePago } from "./gasto-fijo-ficha-reglas";

export type SugerenciaFicha = {
  /** El título de la caja del propietario o la empresa. */
  tituloBeneficiario: string;
  /** El ejemplo en gris de cada caja (ADR-0290). */
  beneficiario: string;
  codigo: string;
  recibo: string;
  /** El título y la ayuda de «código»; el título y la caja de «cómo llega el recibo». */
  tituloCodigo: string;
  ayudaCodigo: string;
  tituloRecibo: string;
  /** La fecha en que se acaba el contrato (o la póliza, o la licencia). `null` = esta categoría casi nunca la tiene y no se pide. */
  vence: { titulo: string; ayuda?: string } | null;
  /** Que la fecha de vencimiento vaya antes que el código (en un alquiler es el dato que más vale). */
  vencePrimero: boolean;
  /** Formas de pago que no calzan con la categoría y no se ofrecen. */
  formasOcultas: readonly FormaDePago[];
};

// Lo de siempre, sin ninguna promesa: es lo que ve una categoría desconocida y lo que decía la ficha antes de esta regla.
export const SUGERENCIA_NEUTRA: SugerenciaFicha = {
  tituloBeneficiario: "Propietario o empresa",
  beneficiario: "A quién se le paga",
  codigo: "N.º de contrato, cliente o suministro",
  recibo: "Cómo llega y dónde se paga",
  tituloCodigo: "Código del servicio",
  ayudaCodigo: "El que sale en el recibo: suministro, contrato o cliente.",
  tituloRecibo: "Cómo llega el recibo",
  vence: { titulo: "Vence el contrato" },
  vencePrimero: false,
  formasOcultas: [],
};

const AYUDA_VENCE = "En la lista se marca cuando faltan 60 días o menos.";

/** Una por cada categoría de gasto que trae el sistema (20260924235000, y Luz, Agua, Internet, Telefonía y Software de 20261022205000). El resto cae a la neutra. */
export const SUGERENCIAS_POR_CATEGORIA: Record<string, SugerenciaFicha> = {
  alquileres: {
    tituloBeneficiario: "Propietario",
    beneficiario: "Nombre del propietario del local",
    codigo: "El que figura en la primera hoja",
    recibo: "Mensaje del propietario o fecha fija",
    tituloCodigo: "N.º de contrato",
    ayudaCodigo: "Solo si hay contrato firmado.",
    tituloRecibo: "Cómo te avisa que toca pagar",
    vence: { titulo: "Vence el contrato", ayuda: `Para renovar o negociar a tiempo. ${AYUDA_VENCE}` },
    vencePrimero: true,
    formasOcultas: ["recibo"],
  },
  // Luz y agua: el dato que identifica al servicio es el N.º de suministro, y el servicio no tiene contrato ni fecha de vencimiento.
  luz: {
    tituloBeneficiario: "Empresa de luz",
    beneficiario: "Hidrandina, SEAL, Luz del Sur o Enel",
    codigo: "El que dice «Suministro» en el recibo",
    recibo: "Correo, app de la empresa o recibo en la puerta",
    tituloCodigo: "N.º de suministro",
    ayudaCodigo: "Sale en el recibo de la luz, con el nombre «Suministro».",
    tituloRecibo: "Cómo llega el recibo de la luz",
    vence: null,
    vencePrimero: false,
    formasOcultas: [],
  },
  agua: {
    tituloBeneficiario: "Empresa de agua",
    beneficiario: "Sedapal, Sedalib o Sedapar",
    codigo: "El que dice «Suministro» en el recibo",
    recibo: "Correo, app de la empresa o recibo en la puerta",
    tituloCodigo: "N.º de suministro",
    ayudaCodigo: "Sale en el recibo del agua, con el nombre «Suministro».",
    tituloRecibo: "Cómo llega el recibo del agua",
    vence: null,
    vencePrimero: false,
    formasOcultas: [],
  },
  // Internet y telefonía sí pueden tener contrato con permanencia: la fecha es opcional y la ayuda dice cuándo hace falta.
  internet: {
    tituloBeneficiario: "Empresa de internet",
    beneficiario: "Movistar, Claro, Entel o Bitel",
    codigo: "El que sale en el recibo",
    recibo: "Correo, app de la empresa o recibo en la puerta",
    tituloCodigo: "N.º de cliente o de contrato",
    ayudaCodigo: "El que sale en el recibo del internet o en la app de la empresa.",
    tituloRecibo: "Cómo llega el recibo",
    vence: { titulo: "Vence el contrato", ayuda: "Solo si tu plan tiene permanencia." },
    vencePrimero: false,
    formasOcultas: [],
  },
  telefonia: {
    tituloBeneficiario: "Operadora",
    beneficiario: "Claro, Movistar, Entel o Bitel",
    codigo: "El del celular o del plan que se paga",
    recibo: "Correo o app de la operadora",
    tituloCodigo: "Número de la línea",
    ayudaCodigo: "El número del celular o del plan móvil que se paga aquí. El teléfono de la operadora va en «Teléfono».",
    tituloRecibo: "Cómo llega el recibo",
    vence: { titulo: "Vence el contrato", ayuda: "Solo si tu plan tiene permanencia." },
    vencePrimero: false,
    formasOcultas: [],
  },
  // Software y suscripciones (Adobe, Google Workspace, ChatGPT, el dominio web, Shopify): se cobra a una tarjeta, llega una factura por correo y
  // lo que más sirve es saber cuándo se renueva. Nunca se pide la clave de acceso.
  software: {
    tituloBeneficiario: "Empresa del servicio",
    beneficiario: "Adobe, Google, OpenAI o Shopify",
    codigo: "El ID de la cuenta, no la clave",
    recibo: "Correo de la empresa o cargo a la tarjeta",
    tituloCodigo: "ID de la cuenta o del plan",
    ayudaCodigo: "El número de cliente o de cuenta que sale en la factura. Nunca escribas aquí la clave de acceso.",
    tituloRecibo: "Cómo llega la factura",
    vence: { titulo: "Se renueva el", ayuda: `Para saber cuándo se cobra de nuevo y cancelar a tiempo. ${AYUDA_VENCE}` },
    vencePrimero: false,
    formasOcultas: [],
  },
  // «Servicios básicos»: lo que no es luz, agua, internet ni teléfono (el baño, el gas, la vigilancia). Conserva su código.
  servicios_basicos: {
    tituloBeneficiario: "Empresa o persona",
    beneficiario: "Quien cobra el gas, la vigilancia o el baño",
    codigo: "El que te dio quien presta el servicio",
    recibo: "Recibo, boleta o pago al momento",
    tituloCodigo: "N.º de cliente o de contrato",
    ayudaCodigo: "Solo si quien presta el servicio te asignó uno.",
    tituloRecibo: "Cómo llega el cobro",
    vence: { titulo: "Vence el contrato", ayuda: "Solo si hay contrato, por ejemplo con la vigilancia." },
    vencePrimero: false,
    formasOcultas: [],
  },
  transporte: {
    tituloBeneficiario: "Quién presta el servicio",
    beneficiario: "Empresa o persona que presta el servicio",
    codigo: "El que te dio la empresa",
    recibo: "Cuenta de cobro, mensaje o pago al momento",
    tituloCodigo: "N.º de cliente o de contrato",
    ayudaCodigo: "Solo si la empresa te asignó uno.",
    tituloRecibo: "Cómo llega el cobro",
    vence: null,
    vencePrimero: false,
    formasOcultas: [],
  },
  suministros: {
    tituloBeneficiario: "Quién vende",
    beneficiario: "Proveedor de útiles o limpieza",
    codigo: "El de tu cuenta con el proveedor",
    recibo: "Factura por correo o entregada con el pedido",
    tituloCodigo: "N.º de cliente",
    ayudaCodigo: "El que usa el proveedor para tus pedidos.",
    tituloRecibo: "Cómo llega la factura",
    vence: null,
    vencePrimero: false,
    formasOcultas: [],
  },
  mantenimiento: {
    tituloBeneficiario: "Técnico o empresa",
    beneficiario: "Técnico o empresa de mantenimiento",
    codigo: "N.º de contrato o de orden",
    recibo: "Recibo por honorarios o factura del técnico",
    tituloCodigo: "N.º de contrato u orden",
    ayudaCodigo: "Del contrato o de la última orden de trabajo.",
    tituloRecibo: "Cómo llega el cobro",
    vence: { titulo: "Vence el contrato", ayuda: AYUDA_VENCE },
    vencePrimero: false,
    formasOcultas: [],
  },
  publicidad: {
    tituloBeneficiario: "Plataforma o agencia",
    beneficiario: "Plataforma o agencia de publicidad",
    codigo: "El que muestra la plataforma",
    recibo: "Correo de la plataforma o factura de la agencia",
    tituloCodigo: "ID de la cuenta publicitaria",
    ayudaCodigo: "El número de la cuenta, no una clave de acceso.",
    tituloRecibo: "Cómo llega la factura",
    vence: { titulo: "Vence el contrato", ayuda: "Solo si es una agencia con contrato." },
    vencePrimero: false,
    formasOcultas: [],
  },
  asesoria: {
    tituloBeneficiario: "Contador, abogado o estudio",
    beneficiario: "Nombre del estudio o del profesional",
    codigo: "El que figura en el contrato",
    recibo: "Correo del estudio, a fin de mes",
    tituloCodigo: "N.º de contrato",
    ayudaCodigo: "Si hay contrato de servicios con el estudio.",
    tituloRecibo: "Cómo llega el recibo por honorarios",
    vence: { titulo: "Vence el contrato", ayuda: AYUDA_VENCE },
    vencePrimero: false,
    formasOcultas: [],
  },
  // Esta categoría NO pide el número de cuenta: la cuenta es solo de líder y admin (ADR-0452), y este código lo ve cualquiera que vea el fijo.
  gastos_bancarios: {
    tituloBeneficiario: "Banco",
    beneficiario: "Banco que cobra la comisión",
    codigo: "El que te dio el banco",
    recibo: "Estado de cuenta o app del banco",
    tituloCodigo: "Código de cliente del banco",
    ayudaCodigo: "No pongas aquí el número de cuenta: lo ven más personas que las cuentas.",
    tituloRecibo: "Dónde se ve el cobro",
    vence: null,
    vencePrimero: false,
    formasOcultas: [],
  },
  tributos: {
    tituloBeneficiario: "Quién cobra",
    beneficiario: "Municipalidad o entidad que cobra",
    codigo: "El que sale en el aviso de pago",
    recibo: "Municipalidad por correo o cuponera en papel",
    tituloCodigo: "N.º de predio, contribuyente o licencia",
    ayudaCodigo: "El que sale en el aviso de pago.",
    tituloRecibo: "Cómo llega el aviso de pago",
    vence: { titulo: "Vence la licencia o el certificado", ayuda: "La licencia de funcionamiento o el certificado de Defensa Civil. Los arbitrios no vencen." },
    vencePrimero: false,
    formasOcultas: [],
  },
  seguros: {
    tituloBeneficiario: "Aseguradora",
    beneficiario: "Nombre de la aseguradora",
    codigo: "El de la primera hoja de la póliza",
    recibo: "Correo de la aseguradora o cobro automático",
    tituloCodigo: "N.º de póliza",
    ayudaCodigo: "Es el que te pide la aseguradora si hay un siniestro.",
    tituloRecibo: "Cómo llega la cuota",
    vence: { titulo: "Vence la póliza", ayuda: AYUDA_VENCE },
    vencePrimero: true,
    formasOcultas: [],
  },
};

/** Lo que dice y pide la ficha para la categoría elegida (`""` o desconocida = el neutro). */
export function sugerirFicha(categoria: string): SugerenciaFicha {
  return SUGERENCIAS_POR_CATEGORIA[categoria] ?? SUGERENCIA_NEUTRA;
}

/** ¿Se pide la fecha en que vence? Si la categoría no la tiene pero la ficha ya trae una, se muestra: nunca se esconde un dato cargado. */
export function pideVence(s: SugerenciaFicha, contratoVence: string): boolean {
  return s.vence !== null || contratoVence !== "";
}

/** Las formas de pago que se ofrecen: las de la categoría, más la que la ficha ya tiene aunque no calce. */
export function formasParaElegir(s: SugerenciaFicha, todas: readonly FormaDePago[], elegida: FormaDePago | ""): FormaDePago[] {
  return todas.filter((f) => !s.formasOcultas.includes(f) || f === elegida);
}
