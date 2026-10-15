import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// El vocabulario de Producción, vigilado (ADR-0400, «Pantallas» punto 8; actividad 8): una orden es un LOTE (nunca una «corrida»), la fase la hace el Taller o sale AFUERA con un servicio (nunca «maquila externa»), la tela
// se USA y se DEVUELVE (nunca «insumos descontados»), la orden PASA AL STOCK (nunca «se cierra al inventario»). Lo que lee la colaboradora del Taller tiene que sonar a Taller, no a sistema.
//
// Qué mira: el código de las pantallas y las reglas de Producción SIN sus comentarios (un comentario puede nombrar la palabra vieja para explicar por qué ya no se usa). Un archivo nuevo de Producción entra
// a la lista de abajo; una palabra nueva que hay que vigilar, a `PROHIBIDAS`. Una línea legítima se exime con `// vocabulario-fijo: <por qué>` (diez caracteres como mínimo).

const RAIZ = join(__dirname, "..");

const CARPETAS = ["components/orden-pagina", "components/ordenes-lista", "components/orden-produccion", "components/produccion-resumen", "components/proveedores-produccion"];
const ARCHIVOS = [
  "components/NuevaOrdenProduccionForm.tsx",
  "components/OrdenCierre.tsx",
  "components/OrdenInsumos.tsx",
  "components/OrdenModales.tsx",
  "components/OrdenPanel.tsx",
  "components/OrdenTarjeta.tsx",
  "components/MatrizOrden.tsx",
  "components/ResumenProduccionPanel.tsx",
  "components/InsumosPanel.tsx",
  "components/InsumoModales.tsx",
  "components/ProveedoresProduccionPanel.tsx",
  "components/ComprobantesProduccionPanel.tsx",
  "components/RecibirProduccionPanel.tsx",
  "components/PorPagarProduccionPanel.tsx",
  "components/EficienciaTallerPanel.tsx",
  "components/CotizacionesMaquilaPanel.tsx",
  "lib/guias/pantallas/produccion.ts",
  "lib/produccion-reglas.ts",
  "lib/produccion-decisiones.ts",
  "lib/insumos-reglas.ts",
  "lib/eficiencia-reglas.ts",
  "lib/tarifas-servicios-reglas.ts",
  "lib/tarifas-servicios-guia.ts",
];

/** Lo que no se le dice a quien trabaja en el Taller, y lo que se dice en su lugar. */
const PROHIBIDAS: { patron: RegExp; en_su_lugar: string }[] = [
  { patron: /\bcorridas?\b/i, en_su_lugar: "«lote» o «orden»" },
  { patron: /maquila externa/i, en_su_lugar: "«afuera con [servicio]»" },
  { patron: /insumos? descontados?/i, en_su_lugar: "«tela usada» y «tela devuelta»" },
  { patron: /(cerrar|cierre|cerrada|cerrarla)\s+(la\s+orden\s+)?al\s+inventario/i, en_su_lugar: "«pasar al stock»" },
  { patron: /enviar a maquila/i, en_su_lugar: "«mandar a un servicio» (la Salida)" },
  { patron: /maquila \(real\)/i, en_su_lugar: "los servicios salen de lo devengado, no se teclean" },
];

function archivosDe(carpeta: string): string[] {
  const dir = join(RAIZ, carpeta);
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    return statSync(ruta).isDirectory() ? archivosDe(relative(RAIZ, ruta)) : /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [relative(RAIZ, ruta)] : [];
  });
}

/** El texto sin comentarios de línea ni de bloque (se conserva el salto de línea para contar líneas). Una `//` dentro de una cadena («https://») no es un comentario. */
function sinComentarios(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((l) => l.replace(/(^|[^:"'`])\/\/.*$/, "$1"))
    .join("\n");
}

const TODOS = [...new Set([...CARPETAS.flatMap(archivosDe), ...ARCHIVOS])].sort();

describe("el vocabulario de Producción", () => {
  it("la lista de archivos existe: ninguno se mudó sin avisar", () => {
    for (const a of ARCHIVOS) expect(() => readFileSync(join(RAIZ, a), "utf8"), a).not.toThrow();
  });

  it("ninguna pantalla ni regla de Producción dice «corrida», «maquila externa», «insumos descontados», «cerrar al inventario»…", () => {
    const infracciones: string[] = [];
    for (const archivo of TODOS) {
      const lineas = sinComentarios(readFileSync(join(RAIZ, archivo), "utf8")).split("\n");
      const originales = readFileSync(join(RAIZ, archivo), "utf8").split("\n");
      lineas.forEach((l, i) => {
        if (/vocabulario-fijo:\s*\S{10,}/.test(originales[i] ?? "")) return;
        for (const { patron, en_su_lugar } of PROHIBIDAS) if (patron.test(l)) infracciones.push(`${archivo}:${i + 1} · «${patron.exec(l)?.[0]}» → di ${en_su_lugar}`);
      });
    }
    expect(infracciones, `Palabras que Producción ya no usa:\n${infracciones.join("\n")}`).toEqual([]);
  });

  it("el escáner entiende los comentarios y lo que se eximió: una palabra vieja en un comentario no cuenta", () => {
    expect(sinComentarios("// una corrida\nconst x = 1; // maquila externa\n/* insumos descontados */")).not.toMatch(/corrida|maquila externa|insumos descontados/);
    expect(sinComentarios('const url = "https://x.pe/corrida";')).toMatch(/corrida/);
    expect(sinComentarios('const t = "Costo de la corrida";')).toMatch(/corrida/);
  });
});
