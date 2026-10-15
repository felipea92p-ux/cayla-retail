// La guía de foco de las hojas de Vitrina web ▸ Looks (ADR-0284, ADR-0408 actividad 11). No agrega reglas: «falta» es exactamente lo
// que `vitrina_guardar_look` y `vitrina_mostrar_look` rechazarían —el nombre (hasta 60 letras), de 2 a 4 prendas, que cada prenda se vea
// en la web si el look se va a mostrar, y quién lo hace—. La frase es opcional; el lugar y «Mostrar en la web» ya vienen elegidos.

import type { CampoDeGuia } from "./guia-campos";
import { listaDeNombres, MAX_NOMBRE_LOOK, MAX_PRENDAS_LOOK, MIN_PRENDAS_LOOK, nombreLimpio } from "./vitrina-looks-reglas";

type Responsable = { responsableListo: boolean; responsableMotivo: string | null };

const responsable = (h: Responsable): CampoDeGuia => ({
  id: "responsable",
  nombre: "Quién lo cambia",
  requerido: true,
  hecho: h.responsableListo,
  pendiente: h.responsableMotivo ?? "Elige quién hace el cambio.",
});

/** Lo que pide la hoja de un look. `noSeVen`: los nombres de las prendas elegidas que hoy no se ven en la web (solo cuentan si se va a
 *  mostrar: oculto, el look se puede guardar igual). */
export function camposDeLook(
  h: { nombre: string; frase: string; prendas: number; publicado: boolean; noSeVen: readonly string[] } & Responsable,
): CampoDeGuia[] {
  const nombre = nombreLimpio(h.nombre);
  const faltanPrendas = Math.max(0, MIN_PRENDAS_LOOK - h.prendas);
  const campos: CampoDeGuia[] = [
    {
      id: "nombre",
      nombre: "Nombre del look",
      requerido: true,
      hecho: nombre !== "" && nombre.length <= MAX_NOMBRE_LOOK,
      pendiente: nombre.length > MAX_NOMBRE_LOOK ? `El nombre va en ${MAX_NOMBRE_LOOK} letras como mucho.` : "Ponle un nombre que diga para qué es.",
    },
    { id: "frase", nombre: "Frase", requerido: false, hecho: nombreLimpio(h.frase) !== "", pendiente: "" },
    {
      id: "prendas",
      nombre: "Prendas",
      requerido: true,
      hecho: h.prendas >= MIN_PRENDAS_LOOK && h.prendas <= MAX_PRENDAS_LOOK,
      pendiente:
        h.prendas === 0
          ? `Agrega de ${MIN_PRENDAS_LOOK} a ${MAX_PRENDAS_LOOK} prendas que se vean bien juntas.`
          : faltanPrendas === 1
            ? "Agrega una prenda más: un look lleva al menos dos."
            : `Un look lleva de ${MIN_PRENDAS_LOOK} a ${MAX_PRENDAS_LOOK} prendas.`,
    },
  ];
  if (h.publicado && h.noSeVen.length > 0) {
    campos.push({
      id: "mostrar",
      nombre: "Lo que se ve en la web",
      requerido: true,
      hecho: false,
      pendiente: `${listaDeNombres(h.noSeVen)} ${h.noSeVen.length === 1 ? "no se ve" : "no se ven"} en la web: cámbiala o deja el look oculto.`,
    });
  }
  campos.push(responsable(h));
  return campos;
}

/** Mostrar u ocultar desde la lista: solo quién lo hace (lo demás ya está elegido). */
export function camposDeMostrarLook(h: Responsable): CampoDeGuia[] {
  return [responsable(h)];
}
