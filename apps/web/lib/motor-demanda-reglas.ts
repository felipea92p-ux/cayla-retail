// Motor de demanda, etapa 0 (ADR-0346): «¿el motor puede hablar en esta sede?». Lógica pura, sin React ni red, para probarla
// entera. Diseño: docs/investigacion/2026-10-05-algoritmo-de-inventario.md.
//
// EL PROBLEMA. Recomendar cuánto colgar, trasladar, producir o comprar sobre ventas que no dicen qué prenda fue es recomendar
// sobre ruido. El 2026-10-05 el 82 % de las unidades vendidas en el ERP eran «venta sin registrar». Zara, Target y Nextail
// coinciden en lo mismo: primero la verdad del dato, después el algoritmo. Este archivo decide, sede por sede, si el motor ya
// puede recomendar, y si no, qué le falta, en palabras de tienda.
//
// CONTRATO
//   PROMETE: tres condiciones, y el motor habla en una sede solo si se cumplen las tres:
//     1. Venta identificada: 14 días SEGUIDOS (de calendario, cerrados: hoy no cuenta porque todavía no termina) en los que
//        ningún día con venta quedó bajo el 90 % de unidades con su prenda. Un día sin ventas (tienda cerrada) no corta la
//        racha; la racha no empieza antes de la primera venta de la sede en el ERP. Umbral y días: Felipe, 2026-10-05.
//     2. Piso cuadrado: la sede tiene al menos un cuadre del piso.
//     3. Almacén contado: el almacén tuvo su conteo de arranque desde el último cuadre.
//   ASUME:   las cifras vienen de `fn_motor_demanda_preparacion` (20261005210000), que ya cuenta las unidades por día de Lima,
//            con una venta regularizada después en el día en que se cobró. Por eso un día pasado puede subir de porcentaje y la
//            racha se recalcula en cada lectura.
//   NO HACE: no recomienda nada todavía (etapas 1 a 5 del diseño) ni decide quién acepta una recomendación: eso lo dice el rol
//            de quien ve el módulo donde vive su botón (ADR-0161, ADR-0306).

export const RPC_PREPARACION = "fn_motor_demanda_preparacion";
/** Desde qué parte de lo vendido con su prenda se le cree a una sede (Felipe, 2026-10-05). */
export const UMBRAL_IDENTIFICADA = 0.9;
/** Cuántos días seguidos tiene que sostenerse (Felipe, 2026-10-05). */
export const DIAS_SOSTENIDOS = 14;
/** Cuántos días (hoy incluido) trae la lectura: `c_dias` de la migración. Más atrás no se sabe. */
export const DIAS_LEIDOS = 45;

export type DiaVenta = { dia: string; unidades: number; identificadas: number };

export type FilaPreparacion = {
  ubicacionId: string;
  nombre: string;
  /** Hoy en Lima, según la base (YYYY-MM-DD). */
  hoy: string;
  primeraVenta: string | null;
  cuadradoEn: string | null;
  almacenContado: boolean;
  /** Solo los días con venta, en orden. */
  dias: DiaVenta[];
};

export type ClaveCondicion = "venta_identificada" | "piso_cuadrado" | "almacen_contado";

export type Condicion = {
  clave: ClaveCondicion;
  titulo: string;
  cumple: boolean;
  /** Lo que se ve hoy, con su número. */
  detalle: string;
  /** Lo que falta hacer, si no se cumple. */
  falta: string | null;
};

export type Racha = {
  /** Días seguidos (cerrados) sin un día con venta bajo el umbral. */
  dias: number;
  /** El último día cerrado que quedó bajo el umbral, si lo hubo dentro de lo leído. */
  ultimoDiaBajo: string | null;
};

export type PreparacionSede = {
  ubicacionId: string;
  nombre: string;
  puedeHablar: boolean;
  condiciones: Condicion[];
  racha: Racha;
  /** Parte identificada de los últimos 14 días cerrados (0 a 1), o null si no vendió. */
  identificada14: number | null;
  /** Parte identificada de hoy, o null si hoy no vendió. */
  identificadaHoy: number | null;
};

// ---------------------------------------------------------------------------------------------------------------------
// 1. Leer lo que devuelve la base
// ---------------------------------------------------------------------------------------------------------------------

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const esFecha = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const entero = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : 0);

function leerDias(v: unknown): DiaVenta[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(esObjeto)
    .filter((d) => esFecha(d.dia))
    .map((d) => {
      const unidades = entero(d.unidades);
      return { dia: d.dia as string, unidades, identificadas: Math.min(entero(d.identificadas), unidades) };
    })
    .sort((a, b) => a.dia.localeCompare(b.dia));
}

/** Las filas de `fn_motor_demanda_preparacion`. Una fila que no calza se descarta (nunca se inventa una sede «lista»). */
export function leerPreparacion(v: unknown): FilaPreparacion[] {
  if (!Array.isArray(v)) return [];
  return v.filter(esObjeto).flatMap((f) => {
    if (typeof f.ubicacion_id !== "string" || typeof f.nombre !== "string" || !esFecha(f.hoy)) return [];
    return [
      {
        ubicacionId: f.ubicacion_id,
        nombre: f.nombre,
        hoy: f.hoy,
        primeraVenta: esFecha(f.primera_venta) ? f.primera_venta : null,
        cuadradoEn: typeof f.cuadrado_en === "string" && f.cuadrado_en !== "" ? f.cuadrado_en : null,
        almacenContado: f.almacen_contado === true,
        dias: leerDias(f.dias),
      },
    ];
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// 2. La regla
// ---------------------------------------------------------------------------------------------------------------------

/** El día `k` días antes de `fecha` (YYYY-MM-DD), en calendario puro: sin horas, así no lo mueve el huso horario. */
export function diaAntes(fecha: string, k: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - k)).toISOString().slice(0, 10);
}

const parte = (identificadas: number, unidades: number): number | null => (unidades > 0 ? identificadas / unidades : null);
const bajoElUmbral = (d: DiaVenta): boolean => d.unidades > 0 && d.identificadas / d.unidades < UMBRAL_IDENTIFICADA;

/**
 * La racha de días cerrados (de ayer hacia atrás) sin un día con venta bajo el 90 %. Corta en el primer día malo y en la primera
 * venta de la sede; un día sin ventas suma (la tienda pudo cerrar) pero no puede ser anterior a la primera venta.
 */
export function rachaIdentificada(dias: readonly DiaVenta[], hoy: string, primeraVenta: string | null): Racha {
  if (!primeraVenta || primeraVenta >= hoy) return { dias: 0, ultimoDiaBajo: null };
  const porDia = new Map(dias.map((d) => [d.dia, d]));
  // La lectura alcanza DIAS_LEIDOS días; más atrás no se sabe, así que la racha no sigue.
  const masViejo = diaAntes(hoy, DIAS_LEIDOS - 1);
  const tope = primeraVenta > masViejo ? primeraVenta : masViejo;
  let n = 0;
  for (let dia = diaAntes(hoy, 1); dia >= tope; dia = diaAntes(dia, 1)) {
    const d = porDia.get(dia);
    if (d && bajoElUmbral(d)) return { dias: n, ultimoDiaBajo: dia };
    n++;
  }
  return { dias: n, ultimoDiaBajo: null };
}

/** La parte identificada de los últimos `n` días cerrados (ayer y hacia atrás). */
export function identificadaEnVentana(dias: readonly DiaVenta[], hoy: string, n: number): number | null {
  const desde = diaAntes(hoy, n);
  const ventana = dias.filter((d) => d.dia >= desde && d.dia < hoy);
  return parte(
    ventana.reduce((s, d) => s + d.identificadas, 0),
    ventana.reduce((s, d) => s + d.unidades, 0)
  );
}

export const porciento = (p: number): string => `${Math.floor(p * 100)} %`;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function condicionVenta(f: FilaPreparacion, racha: Racha, identificada14: number | null): Condicion {
  const titulo = "Ventas con su prenda";
  if (!f.primeraVenta) {
    return {
      clave: "venta_identificada",
      titulo,
      cumple: false,
      detalle: "Todavía no hay ventas de esta tienda en el ERP.",
      falta: `Vender en el ERP registrando cada prenda; cuenta desde la primera venta.`,
    };
  }
  const cumple = racha.dias >= DIAS_SOSTENIDOS;
  const lleva = `lleva ${plural(Math.min(racha.dias, DIAS_SOSTENIDOS), "día", "días")} de ${DIAS_SOSTENIDOS}`;
  const detalle =
    identificada14 === null
      ? `Sin ventas en los últimos ${DIAS_SOSTENIDOS} días; ${lleva}.`
      : `${porciento(identificada14)} de lo vendido en los últimos ${DIAS_SOSTENIDOS} días tiene su prenda; ${lleva}.`;
  return {
    clave: "venta_identificada",
    titulo,
    cumple,
    detalle,
    falta: cumple
      ? null
      : `Que al menos 9 de cada 10 prendas vendidas se registren con su prenda, ${DIAS_SOSTENIDOS} días seguidos` +
        (racha.ultimoDiaBajo ? ` (el último día por debajo fue el ${fechaCorta(racha.ultimoDiaBajo)})` : "") +
        ".",
  };
}

/** «5 oct.»: la fecha corta que se lee en tienda. */
export function fechaCorta(dia: string): string {
  const [, m, d] = dia.split("-").map(Number);
  const meses = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "set.", "oct.", "nov.", "dic."];
  return `${d} ${meses[m - 1]}`;
}

/** El estado del motor en una sede: las tres condiciones, si puede hablar y las cifras que lo explican. */
export function preparacionDeSede(f: FilaPreparacion): PreparacionSede {
  const racha = rachaIdentificada(f.dias, f.hoy, f.primeraVenta);
  const identificada14 = identificadaEnVentana(f.dias, f.hoy, DIAS_SOSTENIDOS);
  const deHoy = f.dias.find((d) => d.dia === f.hoy);
  const condiciones: Condicion[] = [
    condicionVenta(f, racha, identificada14),
    {
      clave: "piso_cuadrado",
      titulo: "Piso cuadrado",
      cumple: f.cuadradoEn !== null,
      detalle: f.cuadradoEn ? "El piso ya se cuadró: el sistema sabe qué está colgado y qué guardado." : "El piso todavía no se cuadró.",
      falta: f.cuadradoEn ? null : "Cuadrar el piso (Existencias ▸ Cuadrar el piso).",
    },
    {
      clave: "almacen_contado",
      titulo: "Almacén contado",
      cumple: f.almacenContado,
      detalle: f.almacenContado ? "El almacén ya tuvo su conteo de arranque." : "El almacén todavía no tuvo su conteo de arranque.",
      falta: f.almacenContado ? null : "Contar el almacén entero, una vez (Inventario ▸ Conteo).",
    },
  ];
  return {
    ubicacionId: f.ubicacionId,
    nombre: f.nombre,
    puedeHablar: condiciones.every((c) => c.cumple),
    condiciones,
    racha,
    identificada14,
    identificadaHoy: deHoy ? parte(deHoy.identificadas, deHoy.unidades) : null,
  };
}

/** Lo que falta, en el orden de las condiciones (vacío si el motor puede hablar). */
export const faltasDe = (p: PreparacionSede): string[] => p.condiciones.flatMap((c) => (c.falta ? [c.falta] : []));

/**
 * Una línea para mostrar donde iría una recomendación (la columna «Sugerencias» de Tareas, ADR-0345): «Ya puedo recomendar en
 * Tienda TRU.» o «Aún no puedo recomendar en Tienda TRU. Falta: 9 días más de ventas con su prenda y cuadrar el piso.».
 */
export function fraseDelMotor(p: PreparacionSede): string {
  if (p.puedeHablar) return `Ya puedo recomendar en ${p.nombre}.`;
  const partes = p.condiciones
    .filter((c) => !c.cumple)
    .map((c) => {
      if (c.clave === "piso_cuadrado") return "cuadrar el piso";
      if (c.clave === "almacen_contado") return "contar el almacén";
      const faltan = DIAS_SOSTENIDOS - Math.min(p.racha.dias, DIAS_SOSTENIDOS);
      return `${plural(faltan, "día", "días")} más de ventas con su prenda`;
    });
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}` : partes[0];
  return `Aún no puedo recomendar en ${p.nombre}. Falta: ${lista}.`;
}
