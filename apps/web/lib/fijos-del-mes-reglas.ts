// Fijos del mes como cola de cierre (tarea #3 de /pantalla, Felipe 2026-10-22). La pestaña «Fijos del mes» era dos tarjetas: «Para confirmar»
// (casi siempre vacía) primero y «Faltan» segunda, sin la fecha ni los días de atraso, sin la suma de lo que falta y con lo ya registrado
// en otra columna. Ahora es una sola lista que se lee de arriba abajo: lo que ya pasó su fecha (el más atrasado primero), lo que llega este
// mes y, plegado, lo que ya está registrado. Desde ADR-0487 cada fijo habla de cuándo VENCE (lo que el recibo trae impreso) y, si se paga
// con días de anticipo, desde cuándo toca pagarlo.
//
// PROMETE: ordenar y describir lo que `fn_gastos_fijos_mes` ya devuelve (estado y fecha esperada vienen de la base, ADR-0440); no decide
// qué falta ni cuándo. Lógica pura: sin fecha de hoy propia (se la pasan) y sin red.

import { mesAntesDelCorte } from "./finanzas-arranque-reglas";
import { fechaCorta, solesRedondo, textoCuandoVence, textoMes, type GastoFijoMes } from "./gastos-reglas";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Días de calendario de `desde` a `hasta` («YYYY-MM-DD»); negativo si `hasta` es anterior. `NaN` si alguna fecha no se lee. */
function diasEntre(desde: string, hasta: string): number {
  const ms = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((ms(hasta) - ms(desde)) / 86_400_000);
}

type ColaDeFijos = {
  /** Ya pasaron su fecha y no están registrados: el más atrasado primero, y a igual fecha el de más monto. */
  faltan: GastoFijoMes[];
  /** Todavía no vencen: los que ya toca pagar primero (traen su fecha de pago cumplida) y luego el que vence antes. */
  vienen: GastoFijoMes[];
  /** Ya tienen su gasto: por fecha esperada. */
  registrados: GastoFijoMes[];
  /** Lo que queda por confirmar (los que faltan y los que vienen). */
  pendientes: number;
  /** Lo que suman con el monto de siempre; es una referencia si alguno es de monto variable (`aproximado`). */
  montoPendiente: number;
  aproximado: boolean;
  total: number;
};

const porFecha = (a: GastoFijoMes, b: GastoFijoMes) => a.fechaEsperada.localeCompare(b.fechaEsperada);
const porMontoLuegoNombre = (a: GastoFijoMes, b: GastoFijoMes) => b.monto - a.monto || a.descripcion.localeCompare(b.descripcion, "es");

export function colaDeFijos(fijos: readonly GastoFijoMes[]): ColaDeFijos {
  const faltan = fijos.filter((f) => f.estado === "falta").sort((a, b) => porFecha(a, b) || porMontoLuegoNombre(a, b));
  // «Toca pagar» (ADR-0487) sube: es la señal de que ya se puede pagar aunque el vencimiento sea más lejos que el de otro.
  const vienen = fijos
    .filter((f) => f.estado === "por_llegar")
    .sort((a, b) => Number(b.tocaPagar) - Number(a.tocaPagar) || porFecha(a, b) || porMontoLuegoNombre(a, b));
  const registrados = fijos.filter((f) => f.estado === "registrado").sort((a, b) => porFecha(a, b) || a.descripcion.localeCompare(b.descripcion, "es"));
  const pendientes = [...faltan, ...vienen];
  return {
    faltan,
    vienen,
    registrados,
    pendientes: pendientes.length,
    montoPendiente: r2(pendientes.reduce((s, f) => s + f.monto, 0)),
    aproximado: pendientes.some((f) => f.montoVariable),
    total: fijos.length,
  };
}

/** El título de la lista: «Fijos de octubre 2026». */
export function tituloDeLaCola(mes: string): string {
  return `Fijos de ${textoMes(mes)}`;
}

/** Bajo el título: lo que falta confirmar y cuánto suma, o que ya está todo. */
export function bajadaDeLaCola(c: ColaDeFijos, mes: string): string {
  if (c.total === 0) return "";
  if (c.pendientes === 0) return c.total === 1 ? `El fijo de ${textoMes(mes)} ya está registrado.` : `Los ${c.total} fijos de ${textoMes(mes)} ya están registrados.`;
  return `${c.pendientes} por confirmar (${c.aproximado ? "~" : ""}${solesRedondo(c.montoPendiente)}) · ${c.registrados.length} de ${c.total} ya registrados.`;
}

/**
 * La línea de cada fijo: cuándo venció y cuántos días lleva de atraso, o cuándo vence; y, si se paga con días de anticipo, desde cuándo.
 * «venció el 15 oct · hace 7 días» · «vence mañana» · «vence el 31 oct · en 9 días · pagar desde el 28 oct». Un fijo ya registrado dice
 * cuándo vence cada mes, como siempre («vence la quincena»).
 */
export function textoFechaDeFijo(
  f: Pick<GastoFijoMes, "estado" | "fechaEsperada" | "momento" | "diaDelMes"> & Partial<Pick<GastoFijoMes, "diasAntes" | "fechaPago">>,
  hoy: string,
): string {
  const cuandoVence = `vence ${textoCuandoVence(f.momento, f.diaDelMes)}`;
  const pagarDesde = f.diasAntes && f.fechaPago ? ` · pagar desde el ${fechaCorta(f.fechaPago)}` : "";
  if (f.estado === "registrado") return `${cuandoVence}${pagarDesde}`;
  const dias = f.estado === "falta" ? diasEntre(f.fechaEsperada, hoy) : diasEntre(hoy, f.fechaEsperada);
  if (Number.isNaN(dias)) return `${cuandoVence}${pagarDesde}`;
  const fecha = fechaCorta(f.fechaEsperada);
  // Vencido: la fecha de pago ya no informa, lo que importa es cuánto lleva de atraso.
  if (f.estado === "falta") return `venció el ${fecha} · hace ${dias} ${dias === 1 ? "día" : "días"}`;
  if (dias <= 0) return `vence hoy${pagarDesde}`;
  if (dias === 1) return `vence mañana${pagarDesde}`;
  return `vence el ${fecha} · en ${dias} días${pagarDesde}`;
}

// ---- Un gasto suelto que parece un fijo (tarea #1 de /pantalla, Felipe 2026-10-22) ---------------------------------------------
//
// Un gasto registrado con «+ Registrar gasto» no cierra el fijo que le tocaba: el fijo seguía diciendo «falta» y otra persona podía
// pagarlo por segunda vez (un fijo «sin comprobante» no tiene ningún candado contra eso). Antes de registrar, el formulario pregunta si
// es uno de los fijos pendientes; si es, el gasto lleva su `gasto_fijo_id` y lo cierra. Qué cuenta como «se parece» lo decide esta
// función (el formulario solo pregunta): misma tienda, misma categoría, el mismo mes (`gastos_fijo_mes_uq` es un gasto por fijo y por
// mes, contado por la fecha del gasto) y que el fijo siga sin registrar. El monto NO filtra, solo ordena: en un fijo de monto variable
// (el recibo de la luz) el monto de siempre es una referencia y filtrar por él dejaría pasar justo los que más duplican. El proveedor sí
// descarta cuando los dos lo tienen y son distintos (Hidrandina no es Sedalib), y sube al que coincide.
//
// El mes de un fijo es el de su fecha esperada (la base la calcula dentro del mes que se le pidió): así la pregunta funciona con los
// fijos de VARIOS meses y de todas las tiendas, no solo con los de la vista (la revisión del 22-oct encontró que con la vista de una
// tienda o de otro mes, el fijo de mayor monto no se preguntaba).

/** El mes («2026-10») al que pertenece la fila de un fijo. */
export function mesDelFijo(f: Pick<GastoFijoMes, "fechaEsperada">): string {
  return f.fechaEsperada.slice(0, 7);
}

/** Un fijo y su mes: el mismo `id` sale en cada mes que se lee, y «No, es otro gasto» se contesta por mes. */
export function claveDeFijo(f: Pick<GastoFijoMes, "id" | "fechaEsperada">): string {
  return `${f.id}|${mesDelFijo(f)}`;
}

/** Une listas de fijos de meses distintos sin repetir la fila de un mismo fijo en un mismo mes. */
export function sinRepetidos(fijos: readonly GastoFijoMes[]): GastoFijoMes[] {
  const vistos = new Set<string>();
  return fijos.filter((f) => {
    const clave = claveDeFijo(f);
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

/**
 * Los fijos pendientes que se parecen a este gasto, los más probables primero (el del mismo proveedor, luego el de monto más cercano y
 * sin monto el que se esperaba antes). `ubicacion` es la del formulario: el id de la tienda o «empresa». `descartados` son las
 * `claveDeFijo` a las que ya se contestó «No, es otro gasto»: se quitan ANTES de ordenar, para que un cuarto fijo no quede escondido.
 */
export function fijosQueSeParecen(
  fijos: readonly GastoFijoMes[],
  gasto: { ubicacion: string; categoria: string; fecha: string; monto: number | null; proveedorId?: string },
  descartados: ReadonlySet<string> = new Set(),
): GastoFijoMes[] {
  if (!gasto.categoria) return [];
  const mes = gasto.fecha.slice(0, 7);
  const proveedor = gasto.proveedorId ?? "";
  const distintoProveedor = (f: GastoFijoMes) => !!proveedor && !!f.proveedorId && f.proveedorId !== proveedor;
  const mismoProveedor = (f: GastoFijoMes) => !!proveedor && f.proveedorId === proveedor;
  const distancia = (f: GastoFijoMes) => (gasto.monto === null ? 0 : Math.abs(f.monto - gasto.monto));
  return fijos
    .filter(
      (f) =>
        f.estado !== "registrado" &&
        mesDelFijo(f) === mes &&
        f.categoria === gasto.categoria &&
        (f.ubicacionId ?? "empresa") === gasto.ubicacion &&
        !distintoProveedor(f) &&
        !descartados.has(claveDeFijo(f)),
    )
    .sort((a, b) => Number(mismoProveedor(b)) - Number(mismoProveedor(a)) || distancia(a) - distancia(b) || porFecha(a, b) || porMontoLuegoNombre(a, b));
}

// ---- Lo que impide que un gasto cierre un fijo (/chaos del 22-oct, hallazgo 1) -----------------------------------------------
//
// PROMETE: decir, con una frase lista para mostrar, por qué ESTE gasto no puede cerrar ESTE fijo, o `null` si puede: tiene que ser de la
// categoría del fijo y del mes del fijo. ASUME: que quien llama pasa lo que el formulario tiene en ese momento (una categoría vacía no
// es la del fijo). NO PROMETE: ser la única defensa. `registrar_gasto` valida que el fijo exista, esté activo y sea de la misma tienda,
// y que haya un solo gasto por fijo y mes; la categoría la guarda hoy solo la pantalla (la base la acepta: hay un borrador de migración que
// decide Felipe) y el mes no lo puede exigir la base, que lo cuenta por la fecha del gasto. Un mototaxi de S/ 12.50 enviado con el fijo del alquiler lo dejó «registrado» y nadie lo vio más como pendiente.

/** Qué dato del formulario hay que cambiar, y lo que se le dice a la persona. */
export type ChoqueConElFijo = { campo: "categoria" | "fecha"; mensaje: string };

export function choqueConElFijo(
  fijo: Pick<GastoFijoMes, "descripcion" | "fechaEsperada" | "categoria" | "categoriaNombre">,
  gasto: { categoria: string; fecha: string },
): ChoqueConElFijo | null {
  // Primero la categoría: si no es de ese fijo, corregir solo la fecha no lo dejaría cerrarlo.
  if (gasto.categoria !== fijo.categoria) {
    return { campo: "categoria", mensaje: `«${fijo.descripcion}» es de la categoría ${fijo.categoriaNombre}: un gasto de otra categoría no puede cerrarlo. Registra el gasto aparte.` };
  }
  // Un gasto cierra el fijo de UN mes (el de su fecha): con otra fecha cerraría el mes equivocado y dejaría el verdadero en «Ya vencieron».
  if (gasto.fecha.slice(0, 7) !== mesDelFijo(fijo)) {
    return { campo: "fecha", mensaje: `La fecha tiene que ser de ${textoMes(mesDelFijo(fijo))} para cerrar «${fijo.descripcion}». Cámbiala, o registra el gasto aparte.` };
  }
  return null;
}

/**
 * Los fijos que se muestran de un mes. Antes del inicio de Finanzas (`parametros_finanzas.inicio_finanzas`) no hay fijos que confirmar:
 * la base los marcaría todos «falta» y rechaza un gasto anterior a esa fecha. Sin inicio elegido, se muestran todos.
 * Lo usan la pestaña, su conteo, la bandeja y el chip de «sin contar»: una sola lista, para que no se contradigan.
 */
export function fijosDelMesVisibles(fijos: readonly GastoFijoMes[], mes: string, inicioFinanzas: string | null): GastoFijoMes[] {
  return inicioFinanzas && mesAntesDelCorte(mes, inicioFinanzas) ? [] : [...fijos];
}
