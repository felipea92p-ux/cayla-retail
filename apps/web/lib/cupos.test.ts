import { describe, expect, it } from "vitest";
import { crearCupos } from "./cupos";

/** Una tarea que se queda abierta hasta que la prueba la termina, y anota cuántas corren a la vez. */
function tablero() {
  let corriendo = 0;
  let maximo = 0;
  const empezadas: string[] = [];
  const abiertas = new Map<string, { ok: (v: string) => void; mal: (e: Error) => void }>();
  const tarea = (nombre: string) => () =>
    new Promise<string>((ok, mal) => {
      corriendo++;
      maximo = Math.max(maximo, corriendo);
      empezadas.push(nombre);
      abiertas.set(nombre, {
        ok: (v) => {
          corriendo--;
          ok(v);
        },
        mal: (e) => {
          corriendo--;
          mal(e);
        },
      });
    });
  const pausa = () => new Promise((r) => setTimeout(r, 0));
  return { tarea, empezadas, abiertas, pausa, maximo: () => maximo };
}

describe("crearCupos", () => {
  it("nunca corren más tareas que el cupo, y las que esperan entran en el orden en que se pidieron", async () => {
    const t = tablero();
    const cupo = crearCupos(2);
    const promesas = ["a", "b", "c", "d", "e"].map((n) => cupo(t.tarea(n)));
    await t.pausa();
    expect(t.empezadas).toEqual(["a", "b"]);
    t.abiertas.get("b")!.ok("B");
    await t.pausa();
    expect(t.empezadas).toEqual(["a", "b", "c"]);
    t.abiertas.get("a")!.ok("A");
    await t.pausa();
    expect(t.empezadas).toEqual(["a", "b", "c", "d"]);
    for (const n of ["c", "d"]) t.abiertas.get(n)!.ok(n.toUpperCase());
    await t.pausa();
    t.abiertas.get("e")!.ok("E");
    expect(await Promise.all(promesas)).toEqual(["A", "B", "C", "D", "E"]);
    expect(t.maximo()).toBe(2);
  });

  it("una tarea que falla devuelve su error y libera su cupo: la que esperaba entra igual", async () => {
    const t = tablero();
    const cupo = crearCupos(1);
    const a = cupo(t.tarea("a"));
    const b = cupo(t.tarea("b"));
    await t.pausa();
    expect(t.empezadas).toEqual(["a"]);
    t.abiertas.get("a")!.mal(new Error("se cayó la base"));
    await expect(a).rejects.toThrow("se cayó la base");
    await t.pausa();
    expect(t.empezadas).toEqual(["a", "b"]);
    t.abiertas.get("b")!.ok("B");
    expect(await b).toBe("B");
  });

  it("con cupo de sobra todas arrancan de una vez, y un cupo inválido se rechaza al crearlo", async () => {
    const t = tablero();
    const cupo = crearCupos(10);
    const promesas = ["a", "b", "c"].map((n) => cupo(t.tarea(n)));
    await t.pausa();
    expect(t.empezadas).toEqual(["a", "b", "c"]);
    for (const n of ["a", "b", "c"]) t.abiertas.get(n)!.ok(n);
    await Promise.all(promesas);
    expect(() => crearCupos(0)).toThrow(/mayor que 0/);
    expect(() => crearCupos(1.5)).toThrow(/entero/);
  });
});
