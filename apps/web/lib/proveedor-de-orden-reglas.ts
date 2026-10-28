// «Registrar proveedor» desde Nueva orden de compra (Felipe 2026-10-21; informe `docs/pantallas/compras-ordenes-nueva.md`, tarea #7):
// la compradora, en Gamarra, se encuentra con un proveedor que nunca registraron y no puede pedirle nada. Se registra con LO BÁSICO:
// nombre y RUC (o «No tiene RUC»), y el WhatsApp si lo tiene. Lo demás (banco, cuenta, CCI, rubros) lo completa después quien administra
// proveedores; mientras tanto la ficha sale en Proveedores como «Sin datos de pago». Lógica pura: sin I/O ni React; la pantalla es
// `components/ordenes-compra/RegistrarProveedorOrden.tsx` y la regla de verdad vive en la función `registrar_proveedor_de_orden`
// (20261021202000), de la que esto es espejo (una prueba de base vigila la función; aquí, lo que se le dice a quien escribe).

import { soloDigitos, validarDocumento } from "@cayla-retail/shared";
import type { CampoDeGuia } from "./guia-campos";
import { esFalloDeRed, traducirError, type ErrorEscritura } from "./error-escritura";
import { normalizarCelular } from "./proveedores-reglas";

/** Lo que se escribe en la hoja. El RUC y el celular, tal cual se tipean (con espacios o guiones). */
export type BorradorProveedor = { nombre: string; ruc: string; sinRuc: boolean; celular: string };

export const BORRADOR_PROVEEDOR_VACIO: BorradorProveedor = { nombre: "", ruc: "", sinRuc: false, celular: "" };

/** Lo mismo que el candado `proveedores_textos_con_tope` de la base. */
export const TOPE_NOMBRE_PROVEEDOR = 120;

/** Lo que se le manda a la función. Con «No tiene RUC» el RUC va en `null`; el celular, con sus 9 dígitos o `null`. */
export type ArgsRegistrarProveedor = { p_nombre: string; p_ruc: string | null; p_sin_ruc: boolean; p_celular: string | null };

export function problemaDelNombre(nombre: string): string | null {
  const limpio = nombre.trim();
  if (!limpio) return "Escribe el nombre del proveedor.";
  if (limpio.length > TOPE_NOMBRE_PROVEEDOR) return `El nombre va hasta ${TOPE_NOMBRE_PROVEEDOR} letras.`;
  return null;
}

/** El RUC, con su dígito verificador (el mismo que valida `ConsultaDocumento`). Con «No tiene RUC» no hay nada que juzgar. */
export function problemaDelRuc(ruc: string, sinRuc: boolean): string | null {
  if (sinRuc) return null;
  if (soloDigitos(ruc).length === 0) return "Escribe el RUC o marca «No tiene RUC».";
  const v = validarDocumento("ruc", ruc);
  return v.valido ? null : v.motivo;
}

/** Opcional: vacío es válido; escrito, 9 dígitos que empiezan con 9 (acepta «+51» y espacios). */
export function problemaDelCelular(celular: string): string | null {
  if (!celular.trim()) return null;
  return /^9\d{8}$/.test(normalizarCelular(celular)) ? null : "El celular tiene 9 dígitos y empieza con 9.";
}

/**
 * La guía de la hoja (ADR-0284, regla 5: sale de lo que la validación real ya bloquea, y nada más). Con RUC, el RUC y la razón social son UN
 * solo campo (`ConsultaDocumento` los pinta juntos: el padrón trae el nombre al escribir el RUC); con «No tiene RUC», solo el nombre. El
 * celular es opcional y solo bloquea si se escribió mal. `rucYaRegistrado`: ese RUC ya es de otro proveedor de la lista (se elige a ese, no
 * se registra otro). `preguntaPendiente`: hay un «¿no será uno que ya tienes?» sin contestar.
 */
export function camposDeProveedorNuevo(
  b: BorradorProveedor,
  { rucYaRegistrado = false, preguntaPendiente = false }: { rucYaRegistrado?: boolean; preguntaPendiente?: boolean } = {},
): CampoDeGuia[] {
  const campos: CampoDeGuia[] = [];
  const problemaNombre = problemaDelNombre(b.nombre);
  if (b.sinRuc) {
    campos.push({ id: "nombre", nombre: "Nombre", requerido: true, hecho: problemaNombre === null && !preguntaPendiente, pendiente: problemaNombre ?? (preguntaPendiente ? "Contesta si es uno que ya tienes." : "") });
  } else {
    const problemaRuc = problemaDelRuc(b.ruc, false);
    const problema = problemaRuc ?? (rucYaRegistrado ? "Ese RUC ya está registrado: elige a ese proveedor." : null) ?? problemaNombre ?? (preguntaPendiente ? "Contesta si es uno que ya tienes." : null);
    campos.push({ id: "ruc", nombre: "RUC y nombre", requerido: true, hecho: problema === null, pendiente: problema ?? "" });
  }
  const problemaCelular = problemaDelCelular(b.celular);
  campos.push({ id: "celular", nombre: "WhatsApp", requerido: b.celular.trim() !== "", hecho: b.celular.trim() !== "" && problemaCelular === null, pendiente: problemaCelular ?? "" });
  return campos;
}

/** El pedido a la base: el nombre sin espacios de más, el RUC solo con dígitos y el celular normalizado. */
export function argsRegistrarProveedor(b: BorradorProveedor): ArgsRegistrarProveedor {
  return {
    p_nombre: b.nombre.trim().replace(/\s+/g, " "),
    p_ruc: b.sinRuc ? null : soloDigitos(b.ruc),
    p_sin_ruc: b.sinRuc,
    p_celular: b.celular.trim() ? normalizarCelular(b.celular) : null,
  };
}

/** Lo que devuelve la función: el proveedor (nuevo o el que ya estaba). `null` si la respuesta no tiene esa forma. */
export type ProveedorRegistrado = { id: string; nombre: string; ruc: string | null; yaExistia: boolean };

export function leerProveedorRegistrado(data: unknown): ProveedorRegistrado | null {
  const fila = Array.isArray(data) ? data[0] : data;
  if (!fila || typeof fila !== "object") return null;
  const r = fila as Record<string, unknown>;
  if (typeof r.proveedor_id !== "string" || typeof r.proveedor_nombre !== "string") return null;
  return { id: r.proveedor_id, nombre: r.proveedor_nombre, ruc: typeof r.proveedor_ruc === "string" ? r.proveedor_ruc : null, yaExistia: r.ya_existia === true };
}

/**
 * Qué se le dice a quien intentó registrar y no pudo. Los rechazos de la función ya traen su frase (y ninguna repite el nombre ni el
 * RUC escritos: el repo es público y un RUC 10… contiene un DNI); aquí solo se arma lo que la función no puede decir.
 */
export function mensajeDeRegistroProveedor(error: ErrorEscritura | undefined): string {
  const hint = error?.hint ?? "";
  // La web publicada antes que la migración: la función todavía no existe en esa base.
  if (error?.code === "PGRST202" || error?.code === "42883") {
    return "Registrar un proveedor desde la orden todavía no está disponible. Pídele a tu líder que lo registre en Compras ▸ Proveedores.";
  }
  if (hint === "ordenes_compra_sin_modulo") return "Tu rol no puede registrar proveedores desde una orden. Pídeselo a tu líder.";
  // Una terminal sin quién la usa (la base no deja registrar sin una persona, como en las demás acciones de la orden).
  if (hint === "responsable_requerido") return "Elige quién hace la orden (al final del formulario) y vuelve a registrar el proveedor.";
  if (hint.startsWith("proveedor_") && error?.message) return error.message;
  if (esFalloDeRed(error ?? null)) return "No llegó la señal. Vuelve a intentarlo: si el proveedor ya se había registrado, no se duplica.";
  return traducirError(error ?? null, "registrar el proveedor");
}

/**
 * Lo que se dice al terminar. Si el proveedor ya estaba, se dice que se eligió ese; y si lo escrito traía un RUC que esa ficha no tiene,
 * se dice también (no se descarta en silencio: la ficha que ya existía puede estar sin RUC).
 */
export function avisoDelRegistro(res: ProveedorRegistrado, escrito: BorradorProveedor): { titulo: string; detalle?: string } {
  if (!res.yaExistia) {
    return { titulo: `«${res.nombre}» registrado`, detalle: "Quedó con lo básico: quien administra proveedores completa después sus datos de pago." };
  }
  const rucEscrito = escrito.sinRuc ? "" : soloDigitos(escrito.ruc);
  const sinElRuc = rucEscrito !== "" && res.ruc !== rucEscrito;
  return {
    titulo: `«${res.nombre}» ya estaba registrado: lo elegí`,
    detalle: sinElRuc ? "Esa ficha no tiene ese RUC cargado. Pídele a quien administra proveedores que se lo ponga." : undefined,
  };
}

/**
 * El nombre que queda cuando cambia el RUC. Un RUC COMPLETO trae (o se acompaña de) la razón social de ESA empresa: si se corrige a otro
 * RUC, el nombre de antes es de la empresa anterior y se vacía, para que no se registre el RUC nuevo con el nombre de otra empresa (el
 * padrón vuelve a llenarlo, o se escribe). Mientras el RUC viejo estaba a medias (se está tipeando), el nombre es lo que la persona
 * escribió y se respeta. Lo encontró la revisión independiente del 2026-10-21.
 */
export function nombreTrasCambiarRuc(rucAnterior: string, rucNuevo: string, nombre: string): string {
  const antes = soloDigitos(rucAnterior);
  const ahora = soloDigitos(rucNuevo);
  return antes.length === 11 && antes !== ahora ? "" : nombre;
}

/** Si lo tipeado en el combo parece un RUC (11 dígitos), la hoja abre con el RUC puesto; si no, con el nombre. */
export function borradorDesdeLoTipeado(tipeado: string): BorradorProveedor {
  const texto = tipeado.trim();
  if (/^\d{11}$/.test(soloDigitos(texto)) && soloDigitos(texto) === texto.replace(/\s+/g, "")) return { ...BORRADOR_PROVEEDOR_VACIO, ruc: soloDigitos(texto) };
  return { ...BORRADOR_PROVEEDOR_VACIO, nombre: texto };
}
