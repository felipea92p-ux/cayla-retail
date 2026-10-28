import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MOTIVOS, TITULO_AVISO, decidir, frase, preguntar, sondear, textoAviso, vigilar } from "./vigia-salud.mjs";

const respuesta = (status, cuerpo) => async () => ({ status, json: async () => (cuerpo === undefined ? Promise.reject(new Error("sin json")) : cuerpo) });
const sinRed = async () => {
  throw new Error("fetch failed https://secreto.example/api/salud");
};

describe("preguntar: una dirección, una vez", () => {
  it("200 con ok:true es sano", async () => {
    assert.deepEqual(await preguntar("u", { fetchImpl: respuesta(200, { ok: true }) }), { ok: true, estado: 200, motivo: "" });
  });

  it("un 503 con un motivo conocido lo repite tal cual", async () => {
    for (const motivo of MOTIVOS) {
      assert.deepEqual(await preguntar("u", { fetchImpl: respuesta(503, { ok: false, motivo }) }), { ok: false, estado: 503, motivo });
    }
  });

  it("un motivo que no está en la lista NO se repite (el repo es público): cae a «sin_respuesta» o «respuesta_ajena»", async () => {
    assert.equal((await preguntar("u", { fetchImpl: respuesta(503, { ok: false, motivo: "password de x" }) })).motivo, "sin_respuesta");
    assert.equal((await preguntar("u", { fetchImpl: respuesta(404, { ok: false, motivo: "hola" }) })).motivo, "respuesta_ajena");
  });

  it("sin red, un 502 de Vercel sin JSON o un HTML son «la dirección no contesta»; un 200 que no es la salud, «ajena»", async () => {
    assert.deepEqual(await preguntar("u", { fetchImpl: sinRed }), { ok: false, estado: null, motivo: "sin_respuesta" });
    assert.equal((await preguntar("u", { fetchImpl: respuesta(502) })).motivo, "sin_respuesta");
    assert.equal((await preguntar("u", { fetchImpl: respuesta(200) })).motivo, "respuesta_ajena");
    assert.equal((await preguntar("u", { fetchImpl: respuesta(200, { hola: 1 }) })).motivo, "respuesta_ajena");
  });
});

describe("sondear: solo es caída si fallan todos los intentos", () => {
  it("si el segundo intento responde, está sano y no sigue preguntando", async () => {
    let llamadas = 0;
    const fetchImpl = async () => (++llamadas === 1 ? { status: 503, json: async () => ({ ok: false, motivo: "no_responde" }) } : { status: 200, json: async () => ({ ok: true }) });
    const r = await sondear("u", { fetchImpl, dormir: async () => {} });
    assert.equal(r.ok, true);
    assert.equal(r.intentos, 2);
    assert.equal(llamadas, 2);
  });

  it("si fallan los tres, es caída y duerme solo ENTRE intentos (2 veces)", async () => {
    const pausas = [];
    const r = await sondear("u", { fetchImpl: respuesta(503, { ok: false, motivo: "no_responde" }), dormir: async (s) => pausas.push(s) });
    assert.deepEqual({ ok: r.ok, motivo: r.motivo, intentos: r.intentos }, { ok: false, motivo: "no_responde", intentos: 3 });
    assert.deepEqual(pausas, [20, 20]);
  });
});

describe("decidir: un aviso por caída, no uno por corrida", () => {
  const sano = { nombre: "ERP", ok: true };
  const caido = { nombre: "tienda", ok: false, motivo: "no_responde", intentos: 3 };

  it("todo sano: nada, o cierra el aviso que había", () => {
    assert.equal(decidir({ resultados: [sano, { ...sano, nombre: "tienda" }], avisoAbierto: null }).accion, "nada");
    assert.equal(decidir({ resultados: [sano], avisoAbierto: 12 }).accion, "cerrar");
  });

  it("alguna caída: abre el aviso la primera vez y después solo sigue (sin repetir ni dejar en rojo)", () => {
    assert.equal(decidir({ resultados: [sano, caido], avisoAbierto: null }).accion, "abrir");
    assert.equal(decidir({ resultados: [sano, caido], avisoAbierto: 12 }).accion, "seguir");
    assert.deepEqual(decidir({ resultados: [sano, caido], avisoAbierto: null }).caidos, [caido]);
  });
});

describe("el aviso es público: nada de direcciones ni de lo que respondió la dirección", () => {
  const ahora = Date.UTC(2026, 9, 17, 22, 30);
  it("cada motivo tiene su frase y ninguna lleva una dirección", () => {
    for (const motivo of [...MOTIVOS, "sin_respuesta", "respuesta_ajena"]) {
      const f = frase({ nombre: "ERP", motivo, intentos: 3 });
      assert.ok(f.length > 20, motivo);
      assert.doesNotMatch(f, /https?:|\.vercel\.app|\.supabase\.co/);
    }
  });

  it("el texto de abrir dice la hora de Lima, qué cayó y qué mirar; el de cerrar, que todo volvió", () => {
    const t = textoAviso({ tipo: "abrir", caidos: [{ nombre: "ERP", motivo: "no_responde", intentos: 3 }], ahora });
    assert.match(t, /17\/10\/2026, 17:30|17\/10\/2026 17:30/);
    assert.match(t, /El ERP responde, pero dice que la base de datos no contesta/);
    assert.match(t, /Restart project/);
    assert.match(textoAviso({ tipo: "cerrar", ahora }), /volvió a responder/);
  });
});

describe("vigilar: de punta a punta, con GitHub de mentira", () => {
  const direcciones = [
    { nombre: "ERP", url: "https://erp.example/api/salud" },
    { nombre: "tienda", url: "https://tienda.example/api/salud" },
  ];
  const github = (abierto = null) => {
    const hecho = [];
    return {
      hecho,
      avisoAbierto: async (titulo) => (titulo === TITULO_AVISO ? abierto : null),
      crearAviso: async (titulo, cuerpo) => hecho.push(["crear", titulo, cuerpo]),
      comentar: async (n, cuerpo) => hecho.push(["comentar", n, cuerpo]),
      cerrar: async (n) => hecho.push(["cerrar", n]),
    };
  };
  const sondeo = (caidas) => async (url) => (caidas.some((c) => url.includes(c)) ? { ok: false, estado: 503, motivo: "no_responde", intentos: 3 } : { ok: true, estado: 200, motivo: "", intentos: 1 });

  it("una caída sin aviso: lo abre y deja la corrida en rojo (código 1)", async () => {
    const gh = github(null);
    const r = await vigilar({ direcciones, github: gh, sondeo: sondeo(["erp"]) });
    assert.equal(r.codigo, 1);
    assert.equal(gh.hecho.length, 1);
    assert.equal(gh.hecho[0][0], "crear");
    assert.doesNotMatch(gh.hecho[0][2], /erp\.example|tienda\.example/);
  });

  it("la misma caída con el aviso ya abierto: no escribe nada y no deja en rojo (código 0)", async () => {
    const gh = github(7);
    const r = await vigilar({ direcciones, github: gh, sondeo: sondeo(["erp", "tienda"]) });
    assert.equal(r.codigo, 0);
    assert.deepEqual(gh.hecho, []);
  });

  it("todo vuelve: comenta y cierra el aviso abierto", async () => {
    const gh = github(7);
    const r = await vigilar({ direcciones, github: gh, sondeo: sondeo([]) });
    assert.equal(r.codigo, 0);
    assert.deepEqual(gh.hecho.map((h) => h[0]), ["comentar", "cerrar"]);
    assert.equal(gh.hecho[1][1], 7);
  });

  it("con --ensayo pregunta y decide, pero no escribe ningún aviso", async () => {
    const gh = github(null);
    const r = await vigilar({ direcciones, github: gh, sondeo: sondeo(["erp"]), ensayo: true });
    assert.equal(r.decision.accion, "abrir");
    assert.deepEqual(gh.hecho, []);
  });
});
