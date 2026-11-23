import type { Dia } from "./cuentas";

// La casa CAYLA en la web: «Nuestra historia» y «Trabaja con nosotros» (plan «La casa CAYLA en la web», Felipe 2026-11-22). Todo lo que
// estas páginas afirman vive aquí, en UN lugar, para que una cifra no se contradiga entre páginas: 5 de los 12 referentes estudiados
// (Hermès, Mango, Inditex, UNIQLO, COS) tienen cifras distintas de sí mismos en sus propios sitios. La fuente es el Brochure Institucional
// CAYLA 2026 (V13), que Felipe entrega a quien todavía no firma. Cuando el ERP o Dynamic guarden estos datos, se leen de la base y esto se va.

/** Lo que la casa dice de sí misma, con las cifras del brochure («10+ años», «30+ integrantes», «2,200+ clientes cada mes»). */
export const CIFRAS_DE_LA_CASA = [
  { valor: "10+", texto: "años construyendo algo que importa" },
  { valor: "30+", texto: "integrantes en tres ciudades" },
  { valor: "2,200+", texto: "clientes cada mes" },
] as const;

/** Con cuánto nació CAYLA: lo cuenta la carta del fundador. Con espacio que no se parte: «S/» nunca queda solo al final de una línea. */
export const INVERSION_INICIAL = "S/\u00a06,900";

export type Hito = { titulo: string; texto: string };

/**
 * La historia en cuatro hitos, como Massimo Dutti (hecho y por qué importó): cuatro, como los pasos de `LineaDePasos`. Sin años todavía: el brochure no los trae y un año inventado es
 * peor que ninguno. Cuando Felipe los pase, cada hito suma su `anio`.
 */
export const HITOS: readonly Hito[] = [
  {
    titulo: "Trujillo, donde empezó todo",
    texto: `Una calle llena de movimiento, ${INVERSION_INICIAL} de ahorros y una moto vendida. Entre huaicos, incendios y una pandemia, la marca formó su carácter.`,
  },
  { titulo: "Arequipa, la expansión", texto: "La propuesta funcionó en un mercado nuevo sin perder su cultura." },
  { titulo: "Lima y el Taller", texto: "El centro de producción, donde las ideas se vuelven prendas." },
  { titulo: "Lo que viene", texto: "Una boutique con café, los seis rangos funcionando y nuevas ciudades." },
];

export type GrupoDeValores = { grupo: string; pregunta: string; valores: readonly string[] };

/** Los nueve valores del brochure, en sus tres grupos. Son criterios de decisión, formación y evaluación, no frases de pared. */
export const VALORES: readonly GrupoDeValores[] = [
  { grupo: "Carácter", pregunta: "Cómo me paro", valores: ["Libertad y responsabilidad", "Integridad", "Perseverancia"] },
  { grupo: "Oficio", pregunta: "Cómo trabajo", valores: ["Pasión", "Aprendizaje", "Diseño y estilo"] },
  { grupo: "Impacto", pregunta: "Qué dejo", valores: ["Liderazgo", "Innovación", "Servicio"] },
];

// ---------- Trabaja con nosotros ----------

/** Quien responde lo que no es de una tienda (Taller, almacén, oficina): el contacto de «¿Quieres construir con nosotros?» del brochure. */
export const CONTACTO_DE_SELECCION = { whatsapp: "953585537", correo: "info@cayla.pe" } as const;

/** `donde`: la ciudad, si se sabe; null mientras Felipe no lo confirme (almacén y oficina). */
export type Area = { clave: AreaClave; nombre: string; puestos: string; donde: string | null; enFrase: string };
export type AreaClave = "tiendas" | "taller" | "almacen" | "oficina";

/**
 * Las áreas que reclutan (Felipe 2026-11-22). Los puestos van con título neutro: «Asesor(a)», nunca «Asesora». Un título en femenino
 * puede leerse como requisito de sexo en un aviso de empleo (Ley 26772; RLGIT 31.3, infracción muy grave). Lo vigila `empresa.test.ts`.
 */
export const AREAS: readonly Area[] = [
  { clave: "tiendas", nombre: "Tiendas", puestos: "Asesor(a) de atención al cliente y encargado(a) de piso.", donde: "Trujillo, Arequipa y Lima", enFrase: "la tienda" },
  { clave: "taller", nombre: "Taller", puestos: "Corte, costura y acabados. Te enseñamos el oficio.", donde: "Lima", enFrase: "el Taller" },
  { clave: "almacen", nombre: "Almacén", puestos: "Recibir, contar y preparar lo que llega a cada tienda.", donde: null, enFrase: "el almacén" },
  { clave: "oficina", nombre: "Oficina", puestos: "Marketing, Desarrollo Organizacional, compras y finanzas.", donde: null, enFrase: "la oficina" },
];

/** Una remuneración con la fecha desde la que rige. */
export type Vigencia = { desde: Dia; monto: number };

/**
 * La remuneración de categoría del rango de entrada (Colibrí). 2026: S/ 1,230 (brochure). 2027: S/ 1,300 (Felipe 2026-11-22). Que rija
 * desde el 1 de enero es una suposición hasta que Felipe diga el mes. Va en orden de fecha.
 */
export const REMUNERACION_DE_ENTRADA: readonly Vigencia[] = [
  { desde: { anio: 2026, mes: 1, dia: 1 }, monto: 1230 },
  { desde: { anio: 2027, mes: 1, dia: 1 }, monto: 1300 },
];

const clave = (d: Dia) => d.anio * 10000 + d.mes * 100 + d.dia;

/** La que rige hoy y, si ya hay una fijada, la que viene. Antes de la primera, rige la primera (nunca «sin sueldo»). */
export function remuneracionVigente(hoy: Dia, tabla: readonly Vigencia[] = REMUNERACION_DE_ENTRADA): { actual: Vigencia; proxima: Vigencia | null } {
  const yaRigen = tabla.filter((v) => clave(v.desde) <= clave(hoy));
  const actual = yaRigen.at(-1) ?? tabla[0];
  const proxima = tabla.find((v) => clave(v.desde) > clave(hoy)) ?? null;
  return { actual, proxima };
}

/** «S/ 1,230» (con espacio que no se parte): los montos de la escala son enteros. */
export const soles = (monto: number) => `S/\u00a0${monto.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/** Lo que se suma a la remuneración, con las cifras del brochure. Los tres apoyos no son remuneración: no cuentan para gratificación, CTS ni aportes. */
export const BENEFICIOS = [
  { titulo: "Apoyo a estudios", texto: "Te devolvemos el 75 % de lo que pagas en estudios, tuyos o de tus hijos. En el rango de entrada, hasta S/ 90 al mes." },
  { titulo: "Movilidad", texto: "S/ 10 por cada día que vienes; S/ 12 en Lima." },
  { titulo: "Tu cumpleaños", texto: "S/ 180 el mes de tu cumpleaños." },
  { titulo: "Planilla completa", texto: "Gratificaciones, CTS, 15 días de vacaciones, EsSalud y AFP u ONP." },
  { titulo: "45 horas", texto: "Programadas a la semana, de 48 en el contrato, con un día de descanso completo. El sobretiempo se cuenta solo." },
  { titulo: "Formación", texto: "Domestika, Duolingo Premium Max y cursos internos." },
] as const;

/** El proceso, con el plazo que se promete (Felipe 2026-11-22: responden las encargadas y DO). Siempre se responde, también si es un no. */
export const PASOS_DEL_PROCESO = [
  { titulo: "Nos escribes", texto: "Por WhatsApp, desde tu celular. Sin crear cuenta." },
  { titulo: "Te respondemos", texto: "En 5 días hábiles o menos, desde el WhatsApp de la tienda o de CAYLA." },
  { titulo: "Conversamos", texto: "Una entrevista en la tienda, o una prueba práctica en el Taller." },
  { titulo: "Te decimos qué sigue", texto: "Siempre, también si esta vez no es." },
] as const;

/**
 * El mensaje ya escrito con el que se postula por WhatsApp mientras no existe el formulario (fase 1 del plan: la web no guarda nada).
 * No pide edad, sexo, foto ni documento: solo el puesto y dónde. La persona escribe lo demás a su gusto.
 */
export function mensajeParaPostular(area: Pick<Area, "enFrase">, ciudad: string | null): string {
  const donde = ciudad ? ` de ${ciudad}` : "";
  return `Hola, quiero trabajar en CAYLA, en ${area.enFrase}${donde}. Mi nombre es `;
}

/** El enlace que abre WhatsApp con el mensaje escrito. `numero`: 9 dígitos que empiezan en 9, sin +51. */
export const enlaceParaPostular = (numero: string, mensaje: string) => `https://wa.me/51${numero}?text=${encodeURIComponent(mensaje)}`;
