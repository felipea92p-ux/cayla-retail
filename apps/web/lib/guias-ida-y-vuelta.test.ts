import { describe, expect, it } from "vitest";
// La lógica pura de `guias:recorrer -- --ida-y-vuelta` (ADR-0389): el recorredor anota las tres pasadas en un navegador y esto
// dice qué no coincide. Aquí se prueba sin navegador.
import { clavesDePasada, compararIdaYVuelta, fraseDeDiferencia, frasesDeDiferencias, mismoLugar } from "../guias/ida-y-vuelta.mjs";

type Paso = { titulo: string; nota: string | null; hojas: number; numero: number; ultimo: boolean };

/** Una pasada de pasos con su número de tarjeta (el primero es el 1) y el último marcado. */
function pasos(titulos: string[], desde = 1, cambios: Record<number, Partial<Paso>> = {}): Paso[] {
  return titulos.map((titulo, i) => ({ titulo, nota: null, hojas: 0, numero: desde + i, ultimo: false, ...cambios[i] }));
}
/** La ida, la vuelta y la segunda ida de una guía que se ve igual en las tres. */
function igual(titulos: string[]) {
  const ida = pasos(titulos);
  ida[ida.length - 1]!.ultimo = true;
  return { ida, vuelta: [...ida.slice(0, -1)].reverse(), ida2: ida.slice(1) };
}

describe("clavesDePasada", () => {
  it("dos pasos que se llaman igual llevan cuántas veces salió el título antes", () => {
    expect(clavesDePasada(pasos(["Inicio", "Cada prenda", "Filtros", "Cada prenda", "Listo"]))).toEqual([
      "Inicio#0",
      "Cada prenda#0",
      "Filtros#0",
      "Cada prenda#1",
      "Listo#0",
    ]);
  });
});

describe("mismoLugar", () => {
  it("la tecla no llegó si la tarjeta sigue en el mismo título y el mismo número", () => {
    expect(mismoLugar({ titulo: "Filtros", numero: 3 }, { titulo: "Filtros", numero: 3 })).toBe(true);
    expect(mismoLugar({ titulo: "Filtros", numero: 3 }, { titulo: "Filtros", numero: 2 })).toBe(false);
    expect(mismoLugar({ titulo: "Filtros", numero: 3 }, { titulo: "Ticket", numero: 3 })).toBe(false);
    expect(mismoLugar(null, { titulo: "Filtros", numero: 3 })).toBe(false);
  });
});

describe("compararIdaYVuelta", () => {
  it("una guía que se ve igual en las tres pasadas no tiene diferencias", () => {
    expect(compararIdaYVuelta(igual(["Inicio", "Buscador", "Cada prenda", "Ticket", "Listo"]))).toEqual([]);
  });

  it("dice qué paso se salta al volver", () => {
    const { ida, ida2 } = igual(["Inicio", "Buscador", "Cada prenda", "Ticket", "Listo"]);
    // Desde «Listo», ← cae en «Ticket» y otra ← en «Buscador»: «Cada prenda» vivía en una hoja que ya se cerró.
    const vuelta = [ida[3]!, { ...ida[1]!, numero: 2 }, ida[0]!];
    expect(compararIdaYVuelta({ ida, vuelta, ida2 })).toEqual([{ pasada: "vuelta", titulo: "Cada prenda", paso: 3, motivo: "se-salta", falla: true }]);
  });

  it("dice qué paso se salta en la segunda ida", () => {
    const { ida, vuelta } = igual(["Inicio", "Buscador", "Cada prenda", "Ticket", "Listo"]);
    const ida2 = [ida[1]!, ida[3]!, ida[4]!];
    expect(compararIdaYVuelta({ ida, vuelta, ida2 })).toEqual([{ pasada: "ida2", titulo: "Cada prenda", paso: 3, motivo: "se-salta", falla: true }]);
  });

  it("con dos pasos del mismo nombre, el que falta es el que no volvió a salir", () => {
    const { ida, ida2 } = igual(["Inicio", "Cada prenda", "Filtros", "Cada prenda", "Listo"]);
    // Al volver se ve una sola «Cada prenda»: falta una de las dos (la segunda, por la cuenta).
    const vuelta = [ida[2]!, ida[1]!, ida[0]!];
    const diferencias = compararIdaYVuelta({ ida, vuelta, ida2 });
    expect(diferencias).toEqual([{ pasada: "vuelta", titulo: "Cada prenda", paso: 4, motivo: "se-salta", falla: true }]);
  });

  it("falla si al volver aparece una nota que en la ida no estaba, y no si es la misma", () => {
    const { ida, vuelta, ida2 } = igual(["Inicio", "Buscador", "Cada prenda", "Listo"]);
    const nota = "Esta parte no está a la vista ahora (depende de cómo esté la pantalla). Te contamos qué hace igual.";
    vuelta[0] = { ...vuelta[0]!, nota };
    expect(compararIdaYVuelta({ ida, vuelta, ida2 })).toEqual([{ pasada: "vuelta", titulo: "Cada prenda", paso: 3, motivo: "nota", falla: true, nota, notaIda: null }]);
    // Si la ida ya la decía, el recorrido normal ya la marcó: la ida y vuelta no la repite.
    ida[2] = { ...ida[2]!, nota };
    ida2[1] = { ...ida2[1]!, nota };
    expect(compararIdaYVuelta({ ida, vuelta, ida2 })).toEqual([]);
  });

  it("falla si cambia cuántas hojas hay abiertas", () => {
    const { ida, vuelta, ida2 } = igual(["Inicio", "Abre la hoja", "Dentro de la hoja", "Listo"]);
    ida[2] = { ...ida[2]!, hojas: 1 };
    vuelta[0] = { ...vuelta[0]!, hojas: 1 };
    ida2[1] = { ...ida2[1]!, hojas: 0 };
    expect(compararIdaYVuelta({ ida, vuelta, ida2 })).toEqual([{ pasada: "ida2", titulo: "Dentro de la hoja", paso: 3, motivo: "hojas", falla: true, hojas: 0, hojasIda: 1 }]);
  });

  it("un paso que la ida no mostró solo avisa", () => {
    const { ida, vuelta, ida2 } = igual(["Inicio", "Buscador", "Listo"]);
    const conDeMas = [vuelta[0]!, { titulo: "Solo para el líder", nota: null, hojas: 0, numero: 2, ultimo: false }, vuelta[1]!];
    expect(compararIdaYVuelta({ ida, vuelta: conDeMas, ida2 })).toEqual([{ pasada: "vuelta", titulo: "Solo para el líder", paso: null, motivo: "de-mas", falla: false }]);
  });

  it("el paso donde una pasada empieza no se compara dos veces", () => {
    const { ida, vuelta, ida2 } = igual(["Inicio", "Buscador", "Listo"]);
    // La vuelta termina en el primer paso con una hoja abierta: lo dice la vuelta, no también la segunda ida, que arranca ahí.
    vuelta[vuelta.length - 1] = { ...vuelta.at(-1)!, hojas: 1 };
    expect(compararIdaYVuelta({ ida, vuelta, ida2 }).map((d) => d.pasada)).toEqual(["vuelta"]);
  });

  it("una pasada que no se hizo no se compara, y una guía de un paso no tiene vuelta", () => {
    const { ida, vuelta } = igual(["Inicio", "Buscador", "Listo"]);
    expect(compararIdaYVuelta({ ida, vuelta, ida2: null })).toEqual([]);
    expect(compararIdaYVuelta({ ida: pasos(["Solo"]), vuelta: [], ida2: [] })).toEqual([]);
  });
});

describe("fraseDeDiferencia", () => {
  it("dice qué paso y en qué pasada", () => {
    expect(fraseDeDiferencia({ pasada: "vuelta", titulo: "Cada prenda", paso: 3, motivo: "se-salta", falla: true })).toBe("al volver se salta el paso 3 «Cada prenda»");
    expect(fraseDeDiferencia({ pasada: "ida2", titulo: "Dentro de la hoja", paso: 3, motivo: "hojas", falla: true, hojas: 0, hojasIda: 1 })).toBe(
      "en la segunda ida, el paso 3 «Dentro de la hoja» tiene 0 hojas abiertas (en la ida, 1)",
    );
    expect(fraseDeDiferencia({ pasada: "vuelta", titulo: "Cada prenda", paso: 3, motivo: "nota", falla: true, nota: "No pudo hacer este paso.", notaIda: null })).toBe(
      "al volver, el paso 3 «Cada prenda» dice «No pudo hacer este paso.» (en la ida no)",
    );
    expect(fraseDeDiferencia({ pasada: "vuelta", titulo: "Solo para el líder", paso: null, motivo: "de-mas", falla: false })).toBe("al volver aparece «Solo para el líder», que la ida no mostró");
  });
});

describe("frasesDeDiferencias", () => {
  it("los pasos seguidos que se saltan en la misma pasada van en una sola frase", () => {
    const { ida, ida2 } = igual(["Inicio", "Vista", "Cada prenda", "Precio", "Colores", "Buscar", "Listo"]);
    // Al volver, desde «Buscar» se cae en «Vista»: un tramo de tres. En la segunda ida falta solo «Colores».
    const vuelta = [ida[5]!, ida[1]!, ida[0]!];
    const sinColores = ida2.filter((p) => p.titulo !== "Colores");
    expect(frasesDeDiferencias(compararIdaYVuelta({ ida, vuelta, ida2: sinColores }))).toEqual({
      fallas: ["al volver se salta del paso 3 «Cada prenda» al 5 «Colores» (3 pasos)", "en la segunda ida se salta el paso 5 «Colores»"],
      avisos: [],
    });
  });

  it("un tramo se corta en un paso que no se saltó, y lo que avisa va aparte", () => {
    const { ida, ida2 } = igual(["Inicio", "A", "B", "C", "D", "Listo"]);
    const vuelta = [ida[3]!, { titulo: "Solo para el líder", nota: null, hojas: 0, numero: 3, ultimo: false }, ida[0]!];
    expect(frasesDeDiferencias(compararIdaYVuelta({ ida, vuelta, ida2 }))).toEqual({
      fallas: ["al volver se salta del paso 2 «A» al 3 «B» (2 pasos)", "al volver se salta el paso 5 «D»"],
      avisos: ["al volver aparece «Solo para el líder», que la ida no mostró"],
    });
  });
});
