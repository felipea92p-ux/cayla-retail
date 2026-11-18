import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { medirBytesDelRecorte } from "./medida-del-recorte";
import type { MedidaDelRecorte } from "./union-prendas";
import {
  cajasDeLaFigura,
  CUERPO_CREIBLE_MAXIMO_CM,
  CUERPO_CREIBLE_MINIMO_CM,
  cuerpoDibujadoCm,
  huecoDeLaUnion,
  type PerfilDePixeles,
  perfilDePixeles,
  type PrendaParaAuditar,
} from "./union-auditoria-pixeles";

// La auditoría de TODO el catálogo publicado (ADR-0449, act. 2026-11-17): cada blusa contra cada pantalón o falda, con las fotos reales, midiendo en
// píxeles cuánto aire queda entre el bajo de arriba y la pretina de abajo. No corre en el CI (necesita las fotos): se corre a mano con
//   pnpm --filter tienda union:auditar -- <carpeta>
// donde la carpeta trae `catalogo.json` (lo que `scripts/union-auditar.mjs` baja de la tienda) y `recortes/` (las fotos). Sin carpeta, se omite.

const CARPETA = process.env.TIENDA_UNION_AUDITAR_CARPETA ?? "";
// 3 px sostenidos en 4 columnas: lo que el ojo empieza a notar en una figura de 420 px.
const TOLERANCIA_PX = Number(process.env.TIENDA_UNION_AUDITAR_TOLERANCIA ?? 3);

type Foto = { color: string; url: string; prop: number };
type Prenda = PrendaParaAuditar & { codigo: string; nombre: string; zona: "arriba" | "abajo"; fotos: Foto[] };

describe.skipIf(!CARPETA || !existsSync(join(CARPETA, "catalogo.json")))("auditoría del catálogo real: ninguna unión deja aire", () => {
  it("cada blusa con cada pantalón, en píxeles", async () => {
    const catalogo = JSON.parse(readFileSync(join(CARPETA, "catalogo.json"), "utf8")) as Prenda[];
    const medidas = new Map<string, MedidaDelRecorte>();
    const perfiles = new Map<string, PerfilDePixeles>();
    for (const p of catalogo) {
      for (const f of p.fotos) {
        const archivo = f.url.slice(f.url.lastIndexOf("/") + 1);
        if (medidas.has(archivo)) continue;
        const ruta = join(CARPETA, "recortes", archivo);
        if (!existsSync(ruta)) continue;
        const bytes = readFileSync(ruta);
        medidas.set(archivo, await medirBytesDelRecorte(bytes));
        const { data, info } = await sharp(bytes).resize({ width: 512, withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        perfiles.set(archivo, perfilDePixeles(data, info.width, info.height));
      }
    }
    const nombre = (f: Foto) => f.url.slice(f.url.lastIndexOf("/") + 1);
    const arribas = catalogo.filter((p) => p.zona === "arriba" && !p.metida);
    const abajos = catalogo.filter((p) => p.zona === "abajo");
    const malas: { par: string; maxHueco: number; columnas: number }[] = [];
    let pares = 0;
    let peor = 0;
    for (const a of arribas) {
      for (const fa of a.fotos) {
        for (const b of abajos) {
          for (const fb of b.fotos) {
            const ma = medidas.get(nombre(fa));
            const mb = medidas.get(nombre(fb));
            const pa = perfiles.get(nombre(fa));
            const pb = perfiles.get(nombre(fb));
            if (!ma || !mb || !pa || !pb) continue;
            const antes = process.env.TIENDA_UNION_AUDITAR_ESTIMACION === "1";
            const cajas = cajasDeLaFigura({ ...a, proporcion: fa.prop }, antes ? { ...ma, contorno: null } : ma, { ...b, proporcion: fb.prop }, antes ? { ...mb, contorno: null } : mb);
            if (!cajas) continue;
            pares++;
            const r = huecoDeLaUnion({ caja: cajas.arriba, perfil: pa }, { caja: cajas.abajo, perfil: pb });
            if (r.maxHueco > peor) peor = r.maxHueco;
            if (r.maxHueco > TOLERANCIA_PX) malas.push({ par: `${a.codigo}.${fa.color} + ${b.codigo}.${fb.color}`, maxHueco: r.maxHueco, columnas: r.columnasConHueco });
          }
        }
      }
    }
    malas.sort((x, y) => y.maxHueco - x.maxHueco);
    const todos = malas.map((m) => m.maxHueco);
    const porTop = new Map<string, number>();
    for (const m of malas) porTop.set(m.par.split(".")[0], (porTop.get(m.par.split(".")[0]) ?? 0) + 1);
    console.log(
      JSON.stringify(
        { pares, conHueco: malas.length, porcentaje: Math.round((1000 * malas.length) / Math.max(1, pares)) / 10, peorPx: peor, hueco_mediano_de_las_malas: todos[todos.length >> 1], hueco_p90: todos[Math.floor(todos.length * 0.1)], toleranciaPx: TOLERANCIA_PX, topsAfectados: porTop.size, peores: malas.slice(0, 12), topsMasAfectados: [...porTop].sort((x, y) => y[1] - x[1]).slice(0, 12) },
        null,
        1,
      ),
    );
    expect(malas.length).toBe(0);
  }, 600_000);

  it("cada blusa, polo o top se dibuja con un cuerpo de ancho creíble: ninguna a otra escala que las demás", async () => {
    const catalogo = JSON.parse(readFileSync(join(CARPETA, "catalogo.json"), "utf8")) as Prenda[];
    const fuera: { prenda: string; cuerpoCm: number }[] = [];
    let miradas = 0;
    for (const p of catalogo.filter((x) => x.zona === "arriba" && !x.metida && x.porTorso)) {
      for (const f of p.fotos) {
        const ruta = join(CARPETA, "recortes", f.url.slice(f.url.lastIndexOf("/") + 1));
        if (!existsSync(ruta)) continue;
        const cm = cuerpoDibujadoCm({ ...p, proporcion: f.prop }, await medirBytesDelRecorte(readFileSync(ruta)));
        if (cm === null) continue;
        miradas++;
        if (cm < CUERPO_CREIBLE_MINIMO_CM || cm > CUERPO_CREIBLE_MAXIMO_CM) fuera.push({ prenda: `${p.codigo}.${f.color} ${p.nombre}`, cuerpoCm: cm });
      }
    }
    console.log(JSON.stringify({ fotosDeArribaMiradas: miradas, franjaCm: [CUERPO_CREIBLE_MINIMO_CM, CUERPO_CREIBLE_MAXIMO_CM], fueraDeLaFranja: fuera }, null, 1));
    expect(fuera).toEqual([]);
  }, 600_000);
});
