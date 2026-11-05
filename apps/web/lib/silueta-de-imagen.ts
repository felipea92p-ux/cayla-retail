// Pasar la imagen propia de una insignia a SILUETA (Catálogo ▸ Insignias, ADR-0490 act. b): la imagen se usa solo por su forma y se pinta con el color
// del lugar donde se dibuja (tinta en claro, crema en oscuro), como los 21 dibujos de la lista. Lógica pura sobre los píxeles: lo que toca el navegador
// (leer el archivo, dibujarlo, comprimirlo) vive en `imagen-de-insignia.ts`.
//
// CONTRATO
//   PROMETE: devolver los píxeles de la silueta —BLANCOS, con la forma como transparencia— y decir de dónde salió la forma: del fondo transparente de la
//            imagen (`"transparencia"`) o, si no lo tiene, de lo OSCURO de la imagen sobre un fondo claro (`"oscuro"`). Que los píxeles fuera de la caja donde
//            se dibujó la imagen sigan transparentes. Que nunca modifique el arreglo que recibe.
//   ASUME:   un arreglo RGBA de `ancho × alto` píxeles, ya con la imagen dibujada dentro del cuadrado (`caja`).
//   NO HACE: adivinar si el logo era claro sobre fondo oscuro (saldría al revés: la persona lo ve en la vista previa y sube otro) ni conservar colores:
//            una silueta es de UN color, el del lugar.

export type CajaDeImagen = { x: number; y: number; ancho: number; alto: number };
export type ModoDeSilueta = "transparencia" | "oscuro";

/** Cuánto del área de la imagen tiene que ser transparente para decir «tiene fondo transparente»: una esquina redondeada no cuenta, un fondo sí. */
const FRACCION_TRANSPARENTE = 0.01;
const ALFA_TRANSPARENTE = 128;

/** Lo claro se vuelve transparente y lo oscuro opaco, con una rampa entre los dos para que los bordes suaves y el ruido de un JPG no dejen una mancha. */
const OSCURIDAD_DESDE = 0.12;
const OSCURIDAD_HASTA = 0.55;

function luminosidad(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** ¿La imagen que se dibujó en la caja trae un fondo transparente (un PNG recortado)? Solo mira la caja: el margen que deja una imagen apaisada no cuenta. */
export function tieneFondoTransparente(datos: ArrayLike<number>, ancho: number, caja: CajaDeImagen): boolean {
  let transparentes = 0;
  for (let y = caja.y; y < caja.y + caja.alto; y++) {
    for (let x = caja.x; x < caja.x + caja.ancho; x++) {
      if (datos[(y * ancho + x) * 4 + 3] < ALFA_TRANSPARENTE) transparentes++;
    }
  }
  const area = Math.max(1, caja.ancho * caja.alto);
  return transparentes / area >= FRACCION_TRANSPARENTE;
}

/** La silueta de la imagen: píxeles blancos con la forma como transparencia. No toca el arreglo de entrada. */
export function aSilueta(datos: ArrayLike<number>, ancho: number, alto: number, caja: CajaDeImagen): { datos: Uint8ClampedArray<ArrayBuffer>; modo: ModoDeSilueta } {
  const modo: ModoDeSilueta = tieneFondoTransparente(datos, ancho, caja) ? "transparencia" : "oscuro";
  const salida = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4;
      const dentro = x >= caja.x && x < caja.x + caja.ancho && y >= caja.y && y < caja.y + caja.alto;
      let alfa = 0;
      if (dentro) {
        const a = datos[i + 3];
        if (modo === "transparencia") {
          alfa = a;
        } else {
          const oscuridad = 1 - luminosidad(datos[i], datos[i + 1], datos[i + 2]);
          const rampa = Math.min(1, Math.max(0, (oscuridad - OSCURIDAD_DESDE) / (OSCURIDAD_HASTA - OSCURIDAD_DESDE)));
          alfa = Math.round(255 * rampa * (a / 255));
        }
      }
      salida[i] = 255;
      salida[i + 1] = 255;
      salida[i + 2] = 255;
      salida[i + 3] = alfa;
    }
  }
  return { datos: salida, modo };
}

/** Lo que se le dice a la persona de dónde salió la forma, en una frase de tienda. */
export function textoDeModoDeSilueta(modo: ModoDeSilueta): string {
  return modo === "transparencia"
    ? "Usamos la forma de tu imagen (su fondo transparente) y la pintamos del color del sello."
    : "Tu imagen no tiene fondo transparente: usamos lo oscuro sobre el fondo claro. Si sale al revés, sube una con fondo transparente.";
}
