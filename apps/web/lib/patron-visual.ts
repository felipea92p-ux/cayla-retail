// Qué dibujo le toca a un patrón según su nombre.
//
// Los patrones son un vocabulario cerrado que un Líder puede ampliar
// (ADR-0095/0096), así que el nombre es el único dato estable que hay: no
// existe una columna de "muestra" como la de `colores.hex`. Esta función
// traduce el nombre a una de las familias visuales que sabemos dibujar; si
// alguien crea "Rayado" o "Tartán", cae en la misma familia que "Rayas" o
// "Cuadros" en vez de quedarse sin imagen. Un nombre que no reconoce devuelve
// `null` y la pantalla muestra una muestra neutra honesta ("sin muestra"),
// nunca un dibujo equivocado.

export type FamiliaPatron = "liso" | "rayas" | "cuadros" | "lunares" | "floral" | "animal" | "estampado";

// Sin tildes, minúsculas y sin dobles espacios: "  Animal  PRINT " y
// "animal print" son el mismo patrón, igual que en `fn_clave_texto` de la base.
function normalizar(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// El orden importa: "animal print" contiene "print", que también aparece en
// "estampado"/"print floral". Lo más específico va primero.
const REGLAS: ReadonlyArray<readonly [FamiliaPatron, RegExp]> = [
  ["animal", /\b(animal|leopardo|cebra|tigre|snake|serpiente|cocodrilo|vaca)\b/],
  ["floral", /\b(flor|flores|floral|florales|florido|rosas)\b/],
  ["lunares", /\b(lunar|lunares|puntos|polka|topos)\b/],
  ["cuadros", /\b(cuadro|cuadros|cuadrille|cuadriculado|tartan|escoces|gingham|vichy)\b/],
  ["rayas", /\b(raya|rayas|rayado|rayada|listado|listada|franja|franjas)\b/],
  ["liso", /\b(liso|lisa|solido|unicolor)\b/],
  ["estampado", /\b(estampado|estampada|print|abstracto|geometrico)\b/],
];

export function familiaDePatron(nombre: string): FamiliaPatron | null {
  const limpio = normalizar(nombre);
  for (const [familia, regla] of REGLAS) {
    if (regla.test(limpio)) return familia;
  }
  return null;
}
