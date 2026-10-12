/**
 * Lo que se lee al pasar el cursor por una fila de «Dónde está cada grupo» (Plan del piso ▸ Propuesta, la mancuerna): las etiquetas con el valor de cada marca,
 * puestas arriba o abajo de la pista para que no se pisen, y la lectura en palabras con las cuatro cifras del grupo. Felipe, 2026-10-11: «cuando voy con el
 * mouse, visualizar mejor cada dato». Lógica pura y sin React: lo que se dibuja no puede decir otra cosa que lo que dicen las cifras de `armarPropuesta`.
 */
import { lecturaDeGrupo, type FilaDelRiel, type LecturaDeGrupo } from "./mix-piso";
import { cifraEs, pctEs, posicionEnEscala, prendasEs } from "./mix-piso-visual";

export type TipoMarca = "hoy" | "partida" | "ventas" | "propuesta";

/** El orden en que se leen las cuatro marcas: de lo que pasa hoy a lo que se propone. */
export const TIPOS_DE_MARCA: readonly TipoMarca[] = ["hoy", "partida", "ventas", "propuesta"];

/** Cómo se llama cada marca en pantalla (los mismos nombres que la tabla y el panel «¿Por qué?»). */
export const NOMBRE_DE_MARCA: Readonly<Record<TipoMarca, string>> = { hoy: "Hoy", partida: "Punto de partida", ventas: "Tus ventas", propuesta: "Propuesta" };

export type ValoresDeFila = Readonly<Partial<Record<TipoMarca, number | null>>>;

/** Una etiqueta sobre la pista: puede juntar varias marcas que caen casi en el mismo punto (así ninguna etiqueta tapa a otra). */
export type EtiquetaEnPista = {
  /** Dónde cae, de 0 a 100 % del eje. */
  pos: number;
  /** Encima o debajo de la pista: se alternan para que dos etiquetas vecinas no se encimen. */
  carril: "arriba" | "abajo";
  partes: { tipo: TipoMarca; texto: string }[];
};

/** Cuántos puntos del eje (de 100) tienen que separar dos etiquetas para que no se encimen: una etiqueta mide unos 44 px y la pista, unos 340 a 800. */
export const SEPARACION_MINIMA = 9;

/**
 * Las etiquetas de una fila. Las marcas que caen a menos de `separacion` puntos se juntan en UNA etiqueta («47.6 · 48»); las demás se reparten en dos
 * carriles, uno arriba y otro abajo, de modo que dos etiquetas del mismo carril nunca quedan a menos de dos separaciones. Una marca sin valor no tiene etiqueta.
 */
export function etiquetasDeFila(valores: ValoresDeFila, maximo: number, separacion: number = SEPARACION_MINIMA): EtiquetaEnPista[] {
  const marcas = TIPOS_DE_MARCA.flatMap((tipo) => {
    const v = valores[tipo];
    return typeof v === "number" && Number.isFinite(v) ? [{ tipo, valor: v, pos: posicionEnEscala(v, maximo) }] : [];
  }).sort((a, b) => a.pos - b.pos || TIPOS_DE_MARCA.indexOf(a.tipo) - TIPOS_DE_MARCA.indexOf(b.tipo));

  const grupos: { marcas: typeof marcas }[] = [];
  for (const m of marcas) {
    const ultimo = grupos[grupos.length - 1];
    const ultimaPos = ultimo ? ultimo.marcas[ultimo.marcas.length - 1]!.pos : null;
    if (ultimo && ultimaPos !== null && m.pos - ultimaPos < separacion) ultimo.marcas.push(m);
    else grupos.push({ marcas: [m] });
  }
  return grupos.map((g, i) => ({
    pos: g.marcas.reduce((s, m) => s + m.pos, 0) / g.marcas.length,
    carril: i % 2 === 0 ? "arriba" : "abajo",
    partes: g.marcas.map((m) => ({ tipo: m.tipo, texto: cifraEs(m.valor) })),
  }));
}

export type CifraDeLectura = {
  tipo: TipoMarca;
  titulo: string;
  /** La cifra grande: «47.6 %», o «—» si no se puede calcular (un 0 inventado diría «no se vende» sin saberlo). */
  valor: string;
  /** Lo que la respalda, en palabras: «150 prendas», «entre 57.1 y 72.2 · 226 ventas». */
  detalle: string | null;
};

export type LecturaDeFila = { nombre: string; cifras: CifraDeLectura[]; frase: LecturaDeGrupo | null };

/**
 * La lectura de un grupo: sus cuatro cifras, cada una con lo que la respalda, y la frase que ya decía la tabla («Faltan 88: cuelga más de este grupo»,
 * «Por cuadrar: …»). Mientras la sede no cuadró su piso, «Hoy» lo dice: es lo que el sistema cree.
 */
export function lecturaDeFila(f: FilaDelRiel, p: { cuadrado: boolean; capacidad: number | null }): LecturaDeFila {
  const hoy: CifraDeLectura = {
    tipo: "hoy",
    titulo: NOMBRE_DE_MARCA.hoy,
    valor: f.hoyPct === null ? "—" : pctEs(f.hoyPct),
    detalle: `${prendasEs(f.colgadas)}${p.cuadrado ? "" : " según el sistema"}`,
  };
  const partida: CifraDeLectura = {
    tipo: "partida",
    titulo: NOMBRE_DE_MARCA.partida,
    valor: f.partidaPct === null ? "—" : pctEs(f.partidaPct),
    detalle: f.partidaPct === null ? "esta sede no tiene punto de partida" : p.capacidad === null ? null : `unas ${prendasEs(Math.round((f.partidaPct / 100) * p.capacidad))}`,
  };
  const ventas: CifraDeLectura = {
    tipo: "ventas",
    titulo: NOMBRE_DE_MARCA.ventas,
    valor: f.ventaPct === null ? "—" : pctEs(f.ventaPct),
    detalle:
      f.ventaPct === null
        ? "todavía sin ventas confirmadas"
        : `${f.rangoDeVenta ? `entre ${cifraEs(f.rangoDeVenta.desde)} y ${cifraEs(f.rangoDeVenta.hasta)} · ` : ""}${cifraEs(f.ventasConfirmadas)} ${f.ventasConfirmadas === 1 ? "venta" : "ventas"}`,
  };
  const propuesta: CifraDeLectura = {
    tipo: "propuesta",
    titulo: NOMBRE_DE_MARCA.propuesta,
    valor: f.propuestaPct === null ? "—" : pctEs(f.propuestaPct),
    detalle: f.propuestaPct === null ? "sin propuesta" : f.propuestaPrendas === null ? null : prendasEs(f.propuestaPrendas),
  };
  return { nombre: f.grupo.nombre, cifras: [hoy, partida, ventas, propuesta], frase: lecturaDeGrupo(f, p) };
}

/** Lo que oye quien usa lector de pantalla de una fila: las mismas cuatro cifras, en una frase. */
export function resumenDeFila(l: LecturaDeFila): string {
  return `${l.nombre}: ${l.cifras.map((c) => `${c.titulo.toLowerCase()} ${c.valor}${c.detalle ? ` (${c.detalle})` : ""}`).join("; ")}.${l.frase ? ` ${l.frase.texto}` : ""}`;
}
