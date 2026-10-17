// Pruebas del vigía del acuse de Vercel (ADR-0425). `node --test scripts/ci/vigia-vercel.test.mjs`.
// La promesa que vigilan: si Vercel no marca el último commit de `main`, se pide la publicación UNA vez y queda un aviso;
// si lo marcó (aunque sea con una falla, que ya avisa sola), no se toca nada; si el filtro se saltó producción, se avisa
// sin pedir nada. Las marcas de abajo están copiadas de commits reales del repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TITULO_AVISO, decidir, esDelProyecto, textoAviso, ultimaMarca, vigilar } from "./vigia-vercel.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "vigia-vercel.mjs");
const P = "cayla-retail";
const HOOK = "https://api.vercel.com/v1/integrations/deploy/prj_x/secreto-que-no-debe-salir";

// Marcas reales (GET /repos/…/commits/<sha>/statuses), recortadas a lo que el vigía lee.
const marca = (context, state, created_at, description, target_url) => ({ context, state, created_at, description, target_url });
const PUBLICANDO = marca("Vercel", "pending", "2026-10-15T20:10:04Z", "Vercel is deploying your app", "https://vercel.com/cayla/cayla-retail/DXTdzmwYTWcFL55mgkStqtg4jU3M");
const PUBLICADA = marca("Vercel", "success", "2026-10-15T20:13:40Z", "Deployment has completed", "https://vercel.com/cayla/cayla-retail/DXTdzmwYTWcFL55mgkStqtg4jU3M");
const RESUMEN_EQUIPO = marca("Vercel Deployments – CAYLA", "success", "2026-10-15T20:10:47Z", "No required projects to validate", "https://vercel.com/cayla/~/deployments?repo=github%2Ffelipea92p-ux%2Fcayla-retail&filterBranch=main&sha=db7ecbdd90f342005527e703d73f69073036bfe7");
const TIENDA = marca("Vercel – cayla-tienda", "success", "2026-10-15T20:53:05Z", "Deployment has completed", "https://vercel.com/cayla/cayla-tienda/8dx3dwCapEXfXzbmdu2SEugJAVCe");
const CON_DOS_PROYECTOS = marca("Vercel – cayla-retail", "success", "2026-09-11T18:01:10Z", "Deployment has completed", "https://vercel.com/cayla/cayla-retail/4u4WhBLq7z2VJZCaCD7Vvp2dQiQ9");
const OTRO_PROYECTO_FALLA = marca("Vercel – web", "failure", "2026-09-11T18:00:36Z", "Deployment has failed — run this Vercel CLI command: npx vercel inspect dpl_5mR1SBo4kNUP4fdLnL4FigvGJPfg --logs", "https://vercel.com/cayla/web/5mR1SBo4kNUP4fdLnL4FigvGJPfg");
const FILTRO = marca("Vercel", "success", "2026-10-09T18:59:41Z", "Canceled by Ignored Build Step", "https://vercel.com/cayla/cayla-retail/CPN4A1X74DJuwGaVScUa94nVmM6P");
const CANCELADA = marca("Vercel", "failure", "2026-10-01T15:20:39Z", "Canceled from the Vercel Dashboard", "https://vercel.com/cayla/cayla-retail/AQfe1kQtpeBAg34cq18GuC1C5Q4x");
const FALLO = marca("Vercel", "failure", "2026-10-12T16:41:57Z", "Deployment has failed — run this Vercel CLI command: npx vercel inspect dpl_tCi6SuB4syZKykupJ7ESiSk9ptvX --logs", "https://vercel.com/cayla/cayla-retail/tCi6SuB4syZKykupJ7ESiSk9ptvX");

test("la marca del proyecto se reconoce por su enlace, con o sin el nombre del proyecto en la marca", () => {
  assert.equal(esDelProyecto(PUBLICANDO, P), true);
  assert.equal(esDelProyecto(CON_DOS_PROYECTOS, P), true);
  assert.equal(esDelProyecto(RESUMEN_EQUIPO, P), false, "el resumen del equipo no es una publicación");
  assert.equal(esDelProyecto(TIENDA, P), false, "la marca de la tienda no dice nada del ERP");
  assert.equal(esDelProyecto(OTRO_PROYECTO_FALLA, P), false);
  assert.equal(esDelProyecto({ ...PUBLICANDO, target_url: null }, P), false);
  assert.equal(esDelProyecto({ ...PUBLICANDO, context: "ci/otra-cosa" }, P), false);
  assert.equal(esDelProyecto(TIENDA, "cayla-tienda"), true);
});

test("cuenta la marca más reciente del proyecto e ignora las de otros", () => {
  assert.equal(ultimaMarca([TIENDA, RESUMEN_EQUIPO, PUBLICANDO, PUBLICADA], P), PUBLICADA);
  assert.equal(ultimaMarca([PUBLICADA, PUBLICANDO], P), PUBLICADA, "aunque llegue en otro orden");
  assert.equal(ultimaMarca([TIENDA, RESUMEN_EQUIPO], P), null, "db7ecbdd tenía marcas, pero ninguna del ERP");
  assert.equal(ultimaMarca([], P), null);
  assert.equal(ultimaMarca(undefined, P), null);
});

test("decide: sin marca espera hasta el plazo y después pide la publicación", () => {
  assert.equal(decidir({ marca: null, edadS: 5 }).accion, "esperar");
  assert.equal(decidir({ marca: null, edadS: 179 }).accion, "esperar");
  assert.equal(decidir({ marca: null, edadS: 180 }).accion, "disparar");
  assert.equal(decidir({ marca: null, edadS: 60, plazoS: 30 }).accion, "disparar");
});

test("decide: con cualquier marca de Vercel no se toca nada, salvo el filtro que se salta producción", () => {
  for (const m of [PUBLICANDO, PUBLICADA, CON_DOS_PROYECTOS, CANCELADA, FALLO]) {
    assert.equal(decidir({ marca: m, edadS: 9999 }).accion, "listo", m.description);
  }
  assert.match(decidir({ marca: CANCELADA, edadS: 1 }).motivo, /no se repite/);
  assert.match(decidir({ marca: FALLO, edadS: 1 }).motivo, /X roja/);
  // En verde, pero producción no se publicó: el caso del 2026-10-09.
  assert.equal(decidir({ marca: FILTRO, edadS: 1 }).accion, "avisar");
});

/**
 * Un GitHub en memoria. `vercel(sha, ahora)` decide qué marcas devuelve en cada lectura: así se simula a Vercel marcando
 * (o no) el commit, antes o después del Deploy Hook.
 */
function githubFalso({ cabezas, vercel, abierto = null, fallas = 0 }) {
  const registro = { lecturas: 0, hook: 0, creados: [], comentarios: [], cerrados: [] };
  let n = 0;
  let fallasPendientes = fallas;
  const github = {
    async cabeza() {
      if (fallasPendientes-- > 0) throw new Error("GitHub respondió HTTP 502 a GET /commits/main");
      registro.lecturas++;
      return cabezas(reloj.t);
    },
    async marcas(sha) {
      return vercel(sha, reloj.t, registro);
    },
    async avisoAbierto(titulo) {
      assert.equal(titulo, TITULO_AVISO);
      return abierto;
    },
    async crearAviso(titulo, cuerpo) {
      registro.creados.push({ titulo, cuerpo });
      abierto = 600 + ++n;
      return { number: abierto };
    },
    async comentar(numero, cuerpo) {
      registro.comentarios.push({ numero, cuerpo });
    },
    async cerrar(numero) {
      registro.cerrados.push(numero);
      if (abierto === numero) abierto = null;
    },
  };
  const reloj = { t: 0 };
  return { github, registro, reloj };
}

const T0 = Date.parse("2026-10-15T19:23:17Z"); // la fusión del PR #1115
const DB7 = { sha: "db7ecbdd90f342005527e703d73f69073036bfe7", fecha: "2026-10-15T19:23:17Z", asunto: "Merge pull request #1115 from felipea92p-ux/claude/no-view-page-image-animation-972032" };

/** Corre `vigilar` con un reloj falso que arranca 20 s después de la fusión (lo que tarda en arrancar el job). */
async function correr(falso, opciones = {}) {
  const { github, registro, reloj } = falso;
  reloj.t = T0 + 20_000;
  const lineas = [];
  const r = await vigilar({
    github,
    proyecto: P,
    hook: HOOK,
    pedir: async (url) => {
      assert.equal(url, HOOK);
      registro.hook++;
      registro.horaHook = reloj.t;
      return { ok: true, codigo: 201 };
    },
    reloj: () => reloj.t,
    dormir: async (s) => {
      reloj.t += s * 1000;
    },
    registrar: (l) => lineas.push(l),
    ...opciones,
  });
  return { ...r, registro, lineas, fin: reloj.t };
}

test("simulación: un commit sin publicación — espera 3 min, pide UNA publicación y deja el aviso cerrado como registro", async () => {
  // Vercel nunca recibió el aviso de GitHub: no marca el commit hasta que llega el Deploy Hook.
  const falso = githubFalso({
    cabezas: () => DB7,
    vercel: (sha, ahora, reg) => (reg.hook ? [{ ...PUBLICANDO, created_at: new Date(reg.horaHook + 3000).toISOString() }] : [RESUMEN_EQUIPO]),
  });
  const r = await correr(falso);
  assert.equal(r.codigo, 0);
  assert.equal(r.decision.accion, "disparar");
  assert.equal(r.registro.hook, 1, "una sola publicación pedida");
  assert.ok(r.registro.horaHook >= T0 + 180_000, "no la pide antes de los 3 minutos");
  assert.ok(r.registro.horaHook < T0 + 200_000, "ni mucho después");
  assert.equal(r.registro.creados.length, 1);
  assert.equal(r.registro.creados[0].titulo, TITULO_AVISO);
  assert.match(r.registro.creados[0].cuerpo, /`db7ecbdd9` \(#1115\)/);
  assert.match(r.registro.creados[0].cuerpo, /Vercel la tomó/);
  assert.deepEqual(r.registro.cerrados, [601], "no le pide nada a nadie: se cierra en el acto");
});

test("simulación: Vercel marca el commit a los 5 s — no pide nada ni escribe avisos", async () => {
  const falso = githubFalso({
    cabezas: () => DB7,
    vercel: (sha, ahora) => (ahora >= T0 + 5000 ? [PUBLICANDO, RESUMEN_EQUIPO] : []),
  });
  const r = await correr(falso);
  assert.equal(r.codigo, 0);
  assert.equal(r.decision.accion, "listo");
  assert.equal(r.registro.hook, 0);
  assert.equal(r.registro.creados.length + r.registro.comentarios.length, 0);
  assert.equal(r.registro.lecturas, 1, "una sola mirada: el job arranca después del acuse");
});

test("simulación: sin el secreto del Deploy Hook — aviso abierto y la corrida en rojo", async () => {
  const falso = githubFalso({ cabezas: () => DB7, vercel: () => [] });
  const r = await correr(falso, { hook: null });
  assert.equal(r.codigo, 1);
  assert.equal(r.registro.hook, 0);
  assert.match(r.registro.creados[0].cuerpo, /falta el secreto `VERCEL_DEPLOY_HOOK`/);
  assert.deepEqual(r.registro.cerrados, []);
});

test("simulación: el Deploy Hook no acepta — aviso abierto con el código, nunca con la URL", async () => {
  const falso = githubFalso({ cabezas: () => DB7, vercel: () => [] });
  const r = await correr(falso, { pedir: async () => ({ ok: false, codigo: 404 }) });
  assert.equal(r.codigo, 1);
  assert.match(r.registro.creados[0].cuerpo, /HTTP 404/);
  assert.doesNotMatch(r.registro.creados[0].cuerpo, /secreto-que-no-debe-salir/);
  assert.doesNotMatch(r.lineas.join("\n"), /secreto-que-no-debe-salir/);
});

test("simulación: el Deploy Hook acepta pero Vercel no marca nada — aviso abierto tras otros 3 min", async () => {
  const falso = githubFalso({ cabezas: () => DB7, vercel: () => [] });
  const r = await correr(falso);
  assert.equal(r.codigo, 1);
  assert.equal(r.registro.hook, 1);
  assert.ok(r.fin >= r.registro.horaHook + 180_000, "esperó su plazo antes de rendirse");
  assert.match(r.registro.creados[0].cuerpo, /no veo la marca/);
  assert.deepEqual(r.registro.cerrados, []);
});

test("simulación: el filtro se saltó producción — aviso abierto, sin Deploy Hook", async () => {
  const falso = githubFalso({ cabezas: () => DB7, vercel: () => [FILTRO] });
  const r = await correr(falso);
  assert.equal(r.codigo, 1);
  assert.equal(r.registro.hook, 0);
  assert.match(r.registro.creados[0].cuerpo, /Canceled by Ignored Build Step/);
});

test("simulación: si llega otra fusión mientras espera y Vercel la marca, no pide nada (trae todo lo anterior)", async () => {
  const NUEVA = { sha: "a".repeat(40), fecha: "2026-10-15T19:24:47Z", asunto: "Merge pull request #1116 from x/y" };
  const falso = githubFalso({
    cabezas: (ahora) => (ahora >= T0 + 90_000 ? NUEVA : DB7),
    vercel: (sha) => (sha === NUEVA.sha ? [PUBLICANDO] : []),
  });
  const r = await correr(falso);
  assert.equal(r.codigo, 0);
  assert.equal(r.decision.accion, "listo");
  assert.equal(r.registro.hook, 0);
});

test("simulación: un aviso abierto se cierra cuando Vercel vuelve a marcar el último commit", async () => {
  const falso = githubFalso({ cabezas: () => DB7, vercel: () => [PUBLICADA], abierto: 612 });
  const r = await correr(falso);
  assert.equal(r.codigo, 0);
  assert.equal(r.registro.comentarios.length, 1);
  assert.match(r.registro.comentarios[0].cuerpo, /lo que quedó atrás viaja con él/);
  assert.deepEqual(r.registro.cerrados, [612]);
  assert.equal(r.registro.creados.length, 0);
});

test("simulación: con un aviso ya abierto, comenta en él en lugar de abrir otro", async () => {
  const falso = githubFalso({
    cabezas: () => DB7,
    vercel: (sha, ahora, reg) => (reg.hook ? [{ ...PUBLICANDO, created_at: new Date(reg.horaHook).toISOString() }] : []),
    abierto: 612,
  });
  const r = await correr(falso);
  assert.equal(r.registro.creados.length, 0);
  assert.equal(r.registro.comentarios[0].numero, 612);
  assert.deepEqual(r.registro.cerrados, [612]);
});

test("simulación: la prueba manual llama al Deploy Hook aunque Vercel ya tenga el commit, y no escribe avisos", async () => {
  const falso = githubFalso({
    cabezas: () => DB7,
    vercel: (sha, ahora, reg) => (reg.hook ? [PUBLICADA, { ...PUBLICANDO, created_at: new Date(reg.horaHook + 2000).toISOString() }] : [PUBLICADA]),
  });
  const r = await correr(falso, { probar: true });
  assert.equal(r.codigo, 0);
  assert.equal(r.registro.hook, 1);
  assert.equal(r.registro.creados.length + r.registro.comentarios.length + r.registro.cerrados.length, 0);
  assert.match(r.aviso.cuerpo, /Prueba manual del Deploy Hook/);
});

test("simulación: el ensayo mira y dice qué haría, sin Deploy Hook ni avisos", async () => {
  const falso = githubFalso({ cabezas: () => DB7, vercel: () => [] });
  const r = await correr(falso, { ensayo: true });
  assert.equal(r.codigo, 0);
  assert.equal(r.decision.accion, "disparar");
  assert.equal(r.registro.hook, 0);
  assert.equal(r.registro.creados.length, 0);
});

test("simulación: dos tropiezos de la API se reintentan; si GitHub no responde, no se pide nada a ciegas", async () => {
  const tropieza = githubFalso({ cabezas: () => DB7, vercel: () => [PUBLICANDO], fallas: 2 });
  assert.equal((await correr(tropieza)).codigo, 0);
  const caido = githubFalso({ cabezas: () => DB7, vercel: () => [], fallas: 99 });
  await assert.rejects(correr(caido), /HTTP 502/);
  assert.equal(caido.registro.hook, 0);
});

test("los avisos dicen el commit, su PR y la hora de Lima", () => {
  const cuerpo = textoAviso({ tipo: "cierre", cabeza: DB7, ahora: T0 });
  assert.match(cuerpo, /^\*\*15\/10\/2026, 14:23\*\* \(Lima\)/);
  assert.match(cuerpo, /`db7ecbdd9` \(#1115\)/);
  assert.throws(() => textoAviso({ tipo: "otro", cabeza: DB7, ahora: T0 }), /aviso desconocido/);
});

// De punta a punta: el script de verdad, con su `fetch`, contra un servidor local que hace de API de GitHub y de Deploy
// Hook. Lo único que se acorta es el plazo (1 s en vez de 3 min).
async function puntaAPunta({ conHook }) {
  const estado = { hook: 0, horaHook: 0, avisos: [], cerrados: [], auth: new Set() };
  const servidor = createServer((req, res) => {
    let cuerpo = "";
    req.on("data", (c) => (cuerpo += c));
    req.on("end", () => {
      estado.auth.add(req.headers.authorization);
      const json = (codigo, dato) => {
        res.writeHead(codigo, { "content-type": "application/json" });
        res.end(JSON.stringify(dato));
      };
      const { pathname } = new URL(req.url, "http://x");
      if (req.method === "POST" && pathname === "/hook/secreto-local") {
        estado.hook++;
        estado.horaHook = Date.now();
        return json(201, { job: { id: "okz", state: "PENDING", createdAt: Date.now() } });
      }
      if (pathname === "/repos/felipea92p-ux/cayla-retail/commits/main") {
        return json(200, { sha: DB7.sha, commit: { committer: { date: estado.fecha }, message: `${DB7.asunto}\n\nfeat(errores): …` } });
      }
      if (pathname === `/repos/felipea92p-ux/cayla-retail/commits/${DB7.sha}/statuses`) {
        const marcas = [RESUMEN_EQUIPO, TIENDA];
        if (estado.hook) marcas.unshift({ ...PUBLICANDO, created_at: new Date(estado.horaHook + 500).toISOString() });
        return json(200, marcas);
      }
      if (req.method === "GET" && pathname === "/repos/felipea92p-ux/cayla-retail/issues") {
        return json(200, [{ number: 1, title: "Un PR", pull_request: {} }]);
      }
      if (req.method === "POST" && pathname === "/repos/felipea92p-ux/cayla-retail/issues") {
        estado.avisos.push(JSON.parse(cuerpo));
        return json(201, { number: 700 });
      }
      if (req.method === "PATCH" && pathname === "/repos/felipea92p-ux/cayla-retail/issues/700") {
        estado.cerrados.push(JSON.parse(cuerpo));
        return json(200, {});
      }
      json(404, { message: `sin simular: ${req.method} ${pathname}` });
    });
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  estado.fecha = new Date().toISOString(); // el commit recién fusionado
  const resumen = join(mkdtempSync(join(tmpdir(), "vigia-vercel-")), "resumen.md");
  const salida = await new Promise((resolver) => {
    const hijo = spawn(process.execPath, [SCRIPT, "--plazo", "1", "--pausa", "0.2"], {
      env: {
        PATH: process.env.PATH,
        GITHUB_API_URL: base,
        GITHUB_REPOSITORY: "felipea92p-ux/cayla-retail",
        GH_TOKEN: "token-del-job",
        GITHUB_STEP_SUMMARY: resumen,
        ...(conHook ? { VERCEL_DEPLOY_HOOK: `${base}/hook/secreto-local` } : {}),
      },
    });
    let texto = "";
    hijo.stdout.on("data", (c) => (texto += c));
    hijo.stderr.on("data", (c) => (texto += c));
    hijo.on("close", (codigo) => resolver({ codigo, texto }));
  });
  servidor.close();
  return { ...salida, estado, resumen: readFileSync(resumen, "utf8") };
}

test("de punta a punta: un commit sin publicación se pide al Deploy Hook y queda el aviso", async () => {
  const r = await puntaAPunta({ conHook: true });
  assert.equal(r.codigo, 0, r.texto);
  assert.equal(r.estado.hook, 1);
  assert.equal(r.estado.avisos.length, 1);
  assert.equal(r.estado.avisos[0].title, TITULO_AVISO);
  assert.match(r.estado.avisos[0].body, /Vercel no marcó `db7ecbdd9` \(#1115\)/);
  assert.deepEqual(r.estado.cerrados, [{ state: "closed", state_reason: "completed" }]);
  assert.deepEqual([...r.estado.auth], ["Bearer token-del-job", undefined], "el token va a GitHub, nunca al Deploy Hook");
  assert.match(r.resumen, /\*\*disparar\*\*/);
  assert.doesNotMatch(r.texto + r.resumen, /secreto-local/, "la URL del Deploy Hook no sale en el registro");
});

test("de punta a punta: sin el secreto, la corrida sale en rojo y el aviso queda abierto", async () => {
  const r = await puntaAPunta({ conHook: false });
  assert.equal(r.codigo, 1, r.texto);
  assert.equal(r.estado.hook, 0);
  assert.match(r.estado.avisos[0].body, /falta el secreto/);
  assert.deepEqual(r.estado.cerrados, []);
  assert.match(r.texto, /::error::/);
});
