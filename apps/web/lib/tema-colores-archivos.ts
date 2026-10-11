// Los archivos que tienen colores escritos A MANO (un hex, un `rgb()`, `bg-white`…) y por qué (ADR-0336). Lo lee
// `lib/tema-colores.test.ts`, que falla si aparece un color suelto en un archivo que no está aquí o si el número no coincide.
//
// La interfaz usa SOLO tokens (`bg-papel`, `text-tinta`, `var(--color-…)`): un color escrito a mano no cambia con el tema, y la
// pantalla que lo usa se queda clara dentro del modo oscuro. Dos clases de entrada:
//
//   · PERMANENTE (sin `deuda`): el color no es de la interfaz, y el tema no debe tocarlo —papel físico que se imprime, una
//     ilustración o un color de DATO (el tejido, la prenda), la marca—. Lleva su motivo.
//   · DEUDA (`deuda: "actividad N"`): es de la interfaz y se pasa a tokens cuando se audita su módulo. SOLO baja: `cuenta` es
//     exacta, así que quitar un color obliga a bajar el número, y agregar uno hace fallar la prueba. Una pantalla NUEVA no puede
//     nacer aquí: o usa tokens o es papel/dato y lo dice.
//
// Para una sola línea legítima sin tocar este archivo: `// tema-fijo: <por qué>` en la MISMA línea (10 caracteres mínimo).

export type ColoresAMano = { cuenta: number; motivo: string; deuda?: string };

const PAPEL_A4 = "Documento A4 que se imprime: papel blanco con tinta negra. Se ve así en pantalla porque así sale; no sigue el tema.";
const MASCARA = "Máscaras: solo cuenta el canal alfa, el color que se escribe no se ve.";

export const COLORES_A_MANO: Record<string, ColoresAMano> = {
  // ---------- Permanentes: papel físico ----------
  "app/globals.css": { cuenta: 26, motivo: "Papel físico (etiqueta de precio, recibo térmico, hoja de impresión: #000/#fff a propósito, la térmica no imprime otro color), máscaras y el valor inicial de una propiedad registrada." },
  "components/BoletaA4.tsx": { cuenta: 23, motivo: PAPEL_A4 },
  "components/ProformaA4.tsx": { cuenta: 22, motivo: PAPEL_A4 },
  "components/ProformasPanel.tsx": { cuenta: 1, motivo: "El papel blanco de la vista previa de la proforma A4 (ver ProformaA4)." },
  "components/EtiquetaPrecio.tsx": { cuenta: 1, motivo: "Etiqueta de precio que se imprime en la térmica: solo negro sobre blanco." },
  "app/estilos/rotulo.css": { cuenta: 4, motivo: "Rótulo de anaquel que se imprime en la térmica (ADR-0366): #000/#fff a propósito, la térmica no imprime otro color." },
  "components/IconoEtiquetaPapel.tsx": { cuenta: 2, motivo: "Dibujo del papel de la etiqueta (negro y blanco literales): representa el papel, no la pantalla." },

  // ---------- Permanentes: color de DATO o ilustración ----------
  "components/MuestraTejido.tsx": { cuenta: 138, motivo: "Ilustra tejidos: el color de cada hilo ES el dato que se dibuja, no la interfaz." },
  "lib/dibujo-generado.ts": { cuenta: 30, motivo: "Dibujo generado de una prenda: los colores son el dato." },
  "components/MuestraEtiqueta.tsx": { cuenta: 11, motivo: "Ilustra una etiqueta de la prenda: sus colores son el dato." },
  "components/MuestraPatron.tsx": { cuenta: 5, motivo: "Ilustra un patrón de tela: sus colores son el dato." },
  "components/ExistenciasTarjetas.tsx": { cuenta: 6, motivo: "Degradado cónico de «varios colores»: una prenda con varios colores no tiene UN color, es un dato." },
  "components/ui/MuestraColor.tsx": { cuenta: 7, motivo: "El degradado cónico de «varios colores» (VARIOS_COLORES) y el filo blanco con que se redondea una muestra de tela: son datos, no color de la interfaz." },
  "components/BilleteRapido.tsx": { cuenta: 4, motivo: "Ilustra un billete de sol: su color es el de la moneda, no el de la interfaz." },
  "components/SelectorColor.tsx": { cuenta: 3, motivo: "Valor por omisión del selector de color y ejemplo del FORMATO #hex: son datos, no interfaz." },
  "lib/productos-vista.ts": { cuenta: 1, motivo: "Color de reserva de una prenda sin hex: es un dato que se pinta como muestra." },
  "lib/muestra-atributo.ts": { cuenta: 1, motivo: "Lienzo de una imagen que se genera: el blanco es el fondo de la muestra, no un color de pantalla." },
  "lib/preparar-foto.ts": { cuenta: 1, motivo: "Lienzo de la foto que se sube: el blanco es el papel de la foto, no un color de pantalla." },

  // ---------- Permanentes: marca y máscaras ----------
  "components/ui/IsotipoCayla.tsx": { cuenta: 1, motivo: "El rojo de la MARCA (muestreado del propio logo): no cambia con el tema." },
  "app/estilos/inicio-almacen.css": { cuenta: 6, motivo: MASCARA },
  "app/estilos/observatorio.css": { cuenta: 6, motivo: MASCARA },
  "app/global-error.tsx": { cuenta: 6, motivo: "Pantalla de error global: se dibuja sin globals.css (el layout raíz reventó), así que lleva su propia paleta en dos juegos de variables, claro y oscuro, con los valores de tema.css." },

  // ---------- Deuda: se paga en la actividad de su módulo (ADR-0336) ----------
};

/** La deuda que queda por pagar: la suma de `cuenta` de las entradas con `deuda`. Solo baja. */
export const DEUDA_DE_COLORES_HOY = Object.values(COLORES_A_MANO)
  .filter((e) => e.deuda)
  .reduce((suma, e) => suma + e.cuenta, 0);
