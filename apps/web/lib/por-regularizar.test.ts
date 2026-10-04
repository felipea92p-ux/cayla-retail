import { beforeEach, describe, expect, it, vi } from "vitest";
import { FILAS_POR_PAGINA } from "./resultado";
import { cifrasPorRegularizar } from "./por-regularizar-reglas";
import { getPorRegularizar } from "./por-regularizar";

type FilaDb = {
  id: string;
  ubicacion_id: string;
  descripcion: string;
  precio_cobrado: number;
  vendido_por: string | null;
  vendido_en: string;
  estado: string;
  forma: string | null;
  diferencia: number | null;
  categoria: { nombre: string };
  talla: { valor: string };
  color: { nombre: string };
  ubicacion: { nombre: string };
  variante: null;
};

const base = vi.hoisted(() => ({ filas: [] as unknown[], consultas: 0, alArmarConsulta: null as null | ((n: number) => void) }));

// Un PostgREST de bolsillo: aplica los mismos filtros, el mismo orden y —lo importante— el mismo corte de 1.000 filas SIN
// error que la base real, pida lo que pida el código. Lo demás (RLS, joins) no se simula: aquí se prueba qué filas se piden.
vi.mock("./supabase/server", () => ({
  createClient: async () => ({
    from: () => consultaFalsa(),
    rpc: async (_nombre: string, { p_ids }: { p_ids: string[] }) => ({ data: p_ids.map((id) => ({ id, nombre: `Colaboradora ${id}` })), error: null }),
  }),
}));

function consultaFalsa() {
  // Gancho para simular que la base cambia ENTRE las dos lecturas (cada una arma su consulta con la base de ese instante).
  base.alArmarConsulta?.(base.consultas);
  let filas = [...(base.filas as FilaDb[])];
  const orden: { col: keyof FilaDb; asc: boolean }[] = [];
  const valor = (f: FilaDb, col: keyof FilaDb) => (col === "vendido_en" ? Date.parse(f.vendido_en) : String(f[col]));
  const q = {
    select: () => q,
    eq: (col: keyof FilaDb, v: unknown) => ((filas = filas.filter((f) => f[col] === v)), q),
    neq: (col: keyof FilaDb, v: unknown) => ((filas = filas.filter((f) => f[col] !== v)), q),
    gte: (col: keyof FilaDb, v: string) => ((filas = filas.filter((f) => Date.parse(String(f[col])) >= Date.parse(v))), q),
    order: (col: keyof FilaDb, op?: { ascending?: boolean }) => (orden.push({ col, asc: op?.ascending ?? true }), q),
    range: (desde: number, hasta: number) => {
      base.consultas++;
      const ordenadas = [...filas].sort((a, b) => {
        for (const { col, asc } of orden) {
          const [x, y] = [valor(a, col), valor(b, col)];
          if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1);
        }
        return 0;
      });
      const tope = Math.min(hasta, desde + FILAS_POR_PAGINA - 1);
      return Promise.resolve({ data: ordenadas.slice(desde, tope + 1).map((f) => ({ ...f })), error: null });
    },
  };
  return q;
}

const AHORA = new Date("2026-10-03T15:00:00-05:00");
const DIA = 86_400_000;
let contador = 0;
const fila = (estado: string, haceDias: number, extra: Partial<FilaDb> = {}): FilaDb => ({
  id: `p-${String(++contador).padStart(5, "0")}`,
  ubicacion_id: "tru",
  descripcion: "Blusa beige",
  precio_cobrado: 59,
  vendido_por: "v1",
  vendido_en: new Date(AHORA.getTime() - haceDias * DIA).toISOString(),
  estado,
  forma: null,
  diferencia: null,
  categoria: { nombre: "Blusas" },
  talla: { valor: "M" },
  color: { nombre: "Beige" },
  ubicacion: { nombre: "Tienda TRU" },
  variante: null,
  ...extra,
});
const serie = (n: number, hacer: (i: number) => FilaDb) => Array.from({ length: n }, (_, i) => hacer(i));

beforeEach(() => {
  base.filas = [];
  base.consultas = 0;
  base.alArmarConsulta = null;
  contador = 0;
});

describe("getPorRegularizar — la cola no se corta", () => {
  it("con 260 pendientes (el tope viejo era 200) llegan las 260, las más antiguas arriba", async () => {
    base.filas = serie(260, (i) => fila("pendiente", 0.1 + i * 0.4)); // de hace 2 horas a hace ~104 días
    const filas = await getPorRegularizar(null, AHORA);
    expect(filas).toHaveLength(260);
    expect(new Set(filas.map((f) => f.id)).size).toBe(260);
    const fechas = filas.map((f) => Date.parse(f.vendidoEn));
    expect(fechas).toEqual([...fechas].sort((a, b) => a - b));
    expect(filas[0].id).toBe("p-00260"); // la más vieja: justo la que el tope viejo perdía primero
  });

  it("pasadas las 1.000 filas de PostgREST sigue leyendo las páginas que faltan, sin repetir ni saltarse", async () => {
    base.filas = serie(1250, (i) => fila("pendiente", 0.01 + i * 0.05));
    const filas = await getPorRegularizar(null, AHORA);
    expect(filas).toHaveLength(1250);
    expect(new Set(filas.map((f) => f.id)).size).toBe(1250);
  });

  it("lo normal cuesta dos consultas: una por la cola y otra por lo resuelto", async () => {
    base.filas = [...serie(5, (i) => fila("pendiente", 0.5 + i)), ...serie(5, (i) => fila("regularizada", 0.5 + i, { diferencia: -10 }))];
    await getPorRegularizar(null, AHORA);
    expect(base.consultas).toBe(2);
  });
});

describe("getPorRegularizar — lo resuelto se corta por fecha, no por cantidad", () => {
  it("solo este mes y el anterior, de lo más nuevo a lo más viejo, y después de las pendientes", async () => {
    base.filas = [
      ...serie(3, (i) => fila("pendiente", 1 + i)),
      ...serie(300, (i) => fila("regularizada", 0.1 + i * 0.1, { diferencia: -5 })), // hasta hace ~30 días: septiembre y octubre
      ...serie(50, (i) => fila("regularizada", 40 + i, { diferencia: -5 })), // agosto: fuera de la ventana
      ...serie(2, (i) => fila("anulada", 5 + i)),
    ];
    const filas = await getPorRegularizar(null, AHORA);
    expect(filas.filter((f) => f.estado === "pendiente")).toHaveLength(3);
    expect(filas.filter((f) => f.estado === "regularizada")).toHaveLength(300);
    expect(filas.filter((f) => f.estado === "anulada")).toHaveLength(2);
    expect(filas.map((f) => f.estado).slice(0, 3)).toEqual(["pendiente", "pendiente", "pendiente"]);
    const resueltas = filas.slice(3).map((f) => Date.parse(f.vendidoEn));
    expect(resueltas).toEqual([...resueltas].sort((a, b) => b - a));
    expect(Math.min(...resueltas)).toBeGreaterThanOrEqual(Date.parse("2026-09-01T00:00:00-05:00"));
  });

  it("una pendiente de hace tres meses sigue saliendo: la cola de trabajo no tiene ventana", async () => {
    base.filas = [fila("pendiente", 95), fila("regularizada", 95, { diferencia: -5 })];
    const filas = await getPorRegularizar(null, AHORA);
    expect(filas.map((f) => f.estado)).toEqual(["pendiente"]);
  });
});

describe("getPorRegularizar — las cifras de la cabecera", () => {
  it("con más de 200 filas siguen siendo exactas (antes se contaban de menos y no coincidían con el inicio)", async () => {
    base.filas = [
      ...serie(190, () => fila("pendiente", 0.5)), // de hoy: no vencen
      ...serie(40, (i) => fila("pendiente", 5 + i * 0.1)), // pasaron los 2 días: vencidas
      fila("regularizada", 1, { diferencia: -20 }),
      fila("regularizada", 1.5, { diferencia: 10 }),
      fila("regularizada", 2, { diferencia: -5 }),
    ];
    const filas = await getPorRegularizar(null, AHORA);
    expect(cifrasPorRegularizar(filas, AHORA)).toEqual({ pendientes: 230, vencidas: 40, descuentoMes: 25, sobreprecioMes: 10 });
  });
});

describe("getPorRegularizar — dos lecturas, una sola fila por prenda", () => {
  it("si almacén regulariza una prenda justo entre las dos lecturas, sale una vez (resuelta) y no dos", async () => {
    base.filas = [fila("pendiente", 1), fila("pendiente", 2), fila("regularizada", 1.5, { diferencia: -5 })];
    const objetivo = base.filas[0] as FilaDb;
    // La 1.ª lectura (pendientes) ya la vio pendiente; antes de armar la 2.ª (resueltas), almacén la regulariza.
    base.alArmarConsulta = (n) => {
      if (n === 1) Object.assign(objetivo, { estado: "regularizada", forma: "ya_registrada", diferencia: -3 });
    };
    const filas = await getPorRegularizar(null, AHORA);
    const ids = filas.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(filas.find((f) => f.id === objetivo.id)?.estado).toBe("regularizada");
  });
});

describe("getPorRegularizar — por sede", () => {
  it("una colaboradora recibe solo las de su sede", async () => {
    base.filas = [fila("pendiente", 1), fila("pendiente", 2, { ubicacion_id: "aqp" }), fila("regularizada", 1, { ubicacion_id: "aqp", diferencia: 0 })];
    const filas = await getPorRegularizar("aqp", AHORA);
    expect(filas).toHaveLength(2);
    expect(base.filas.length).toBe(3);
  });
});
