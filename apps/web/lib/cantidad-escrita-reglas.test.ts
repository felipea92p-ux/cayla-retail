import { describe, expect, it } from "vitest";
import { leerCantidad } from "./alta-producto";
import { alEntrar, alEscribir, alSalir, escritoInvalido, problemaEscrito, SIN_ESCRIBIR } from "./cantidad-escrita-reglas";

/** Teclea de a una letra, como la persona: cada tecla parte de lo que dejó la anterior, y la pantalla recibe lo que le llega. */
function teclear(escrito: string, hay: string) {
  let estado = alEntrar(SIN_ESCRIBIR, "c", hay);
  let pantalla = hay;
  let celda = hay;
  const vio: string[] = [];
  const llego: string[] = [];
  // Entrar a la celda selecciona lo que hay: la primera tecla lo reemplaza.
  celda = "";
  for (const letra of escrito) {
    const r = alEscribir(estado, "c", celda + letra, pantalla);
    estado = r.estado;
    pantalla = r.paraLaPantalla;
    celda = r.estado.escribiendo?.texto ?? "";
    vio.push(celda);
    llego.push(pantalla);
  }
  return { estado, pantalla, vio, llego };
}

describe("lo que se teclea en una celda de cantidad (Felipe 2026-11-03: «2,5» quedaba en 25)", () => {
  it("«2,5» donde hay un 3: la celda muestra lo escrito, la pantalla vuelve al 3, y al salir se dice que no se guardó", () => {
    const { estado, pantalla, vio, llego } = teclear("2,5", "3");
    expect(vio).toEqual(["2", "2,", "2,5"]);
    expect(llego).toEqual(["2", "3", "3"]);
    expect(pantalla).toBe("3");
    expect(escritoInvalido(estado)).toBe(true);
    expect(problemaEscrito(estado)).toContain("«2,5» no es una cantidad");

    const fuera = alSalir(estado, "c");
    expect(fuera.escribiendo).toBeNull();
    expect(escritoInvalido(fuera)).toBe(false);
    expect(problemaEscrito(fuera)).toContain("«2,5» no se guardó");
  });

  it("«1.5», «-5» y «12345» en una celda vacía la dejan vacía: nunca 15, 5 ni 1234", () => {
    for (const malo of ["1.5", "-5", "12345", "1e3"]) {
      const { pantalla, vio } = teclear(malo, "");
      expect(pantalla, malo).toBe("");
      expect(vio.at(-1), malo).toBe(malo);
    }
  });

  it("los miles tecleados de a una llegan enteros: «1,200» es 1200 al terminar", () => {
    const { pantalla, llego, estado } = teclear("1,200", "");
    expect(llego).toEqual(["1", "", "", "", "1200"]);
    expect(pantalla).toBe("1200");
    expect(problemaEscrito(estado)).toBeNull();
  });

  it("un pegado se lee entero: «1,200» y «1 200» son 1200; «2,5» y dos celdas de una hoja de cálculo no llegan", () => {
    const pegar = (texto: string) => alEscribir(alEntrar(SIN_ESCRIBIR, "c", "7"), "c", texto, "7");
    expect(pegar("1,200").paraLaPantalla).toBe("1200");
    expect(pegar("1 200").paraLaPantalla).toBe("1200");
    for (const malo of ["2,5", "12\t8\t5", "12 8 5", "S/ 12", "12 u."]) {
      expect(pegar(malo).paraLaPantalla, malo).toBe("7");
      expect(pegar(malo).estado.escribiendo?.texto, malo).toBe(malo);
    }
  });

  it("a la pantalla nunca le llega algo que no es una cantidad, sea lo que sea que se escriba", () => {
    for (const hostil of ["2,5", "1.5", "-5", "+5", "1e3", "abc", "S/ 12", "١٢", "½", "0x10", "1,2,3", "12345", "99999", ",", ".", " ", "1,20"]) {
      for (const hay of ["", "0", "3", "9999"]) {
        const { llego } = teclear(hostil, hay);
        for (const valor of llego) expect(leerCantidad(valor), `${hostil} sobre ${hay}: ${valor}`).not.toBeNull();
      }
    }
  });

  it("volver a escribir algo que sí vale calla el aviso", () => {
    const { estado } = teclear("2,5", "3");
    const fuera = alSalir(estado, "c");
    const otra = alEntrar(fuera, "d", "");
    // Con el Tab, el aviso de la celda que se dejó sigue a la vista.
    expect(problemaEscrito(otra)).toContain("«2,5» no se guardó");
    expect(problemaEscrito(alEscribir(otra, "d", "4", "").estado)).toBeNull();
  });

  it("salir de otra celda no toca lo que se está escribiendo aquí", () => {
    const { estado } = teclear("2,5", "3");
    expect(alSalir(estado, "otra")).toBe(estado);
  });
});
