import { describe, expect, it } from "vitest";
import {
  camposOpenAI,
  costoDeUso,
  imagenDeRespuesta,
  mensajeDeErrorOpenAI,
  mensajeParaTienda,
  pedidoDeCatalogo,
  PROMPT_CATALOGO,
  PROMPT_CON_MOLDE,
} from "./openai-imagen-reglas";
import { createHash } from "node:crypto";
import { fichaParaIA } from "./ficha-foto-ia";

describe("camposOpenAI", () => {
  it("pide 4:5, transparente y en PNG, con el modelo que se le pasa", () => {
    expect(camposOpenAI("gpt-image-2.6-sunburst")).toMatchObject({
      model: "gpt-image-2.6-sunburst",
      size: "1024x1280",
      background: "transparent",
      output_format: "png",
      n: "1",
    });
  });

  it("el tamaño es 4:5 y múltiplo de 16 (lo que aceptan los modelos 2.x)", () => {
    const [ancho, alto] = camposOpenAI("x").size.split("x").map(Number);
    expect(ancho / alto).toBeCloseTo(0.8);
    expect(ancho % 16).toBe(0);
    expect(alto % 16).toBe(0);
  });

  it("pide la prenda puesta en un maniquí invisible, sin nada más a la vista, y conservando color y estampado", () => {
    expect(PROMPT_CATALOGO).toMatch(/MANIQUÍ INVISIBLE/);
    expect(PROMPT_CATALOGO).toMatch(/No se ve ningún maniquí, persona, piel, gancho ni perchero/);
    expect(PROMPT_CATALOGO).toMatch(/No cambies el color/);
    expect(PROMPT_CATALOGO).toMatch(/Fondo transparente/);
    // El prompt de octubre que pedía «quita arrugas» y «luz pareja» hacía que redibujara las rayas y borrara las etiquetas.
    expect(PROMPT_CATALOGO).not.toMatch(/arrugas|luz pareja/i);
  });

  it("el maniquí pone la forma y la prenda sus medidas (Felipe 2026-11-14, «Nueva A»)", () => {
    expect(PROMPT_CATALOGO).toMatch(/Lo que pone el MANIQUÍ/);
    for (const regla of ["LARGO", "CORTE", "MANGAS", "BORDES", "ESTAMPADO"]) expect(PROMPT_CATALOGO).toContain(`${regla}:`);
    expect(PROMPT_CATALOGO).toMatch(/no la alargues/);
    // «Como si la llevara una persona de talla estándar» estiraba la prenda (la blusa verde, +8 %): no vuelve.
    expect(PROMPT_CATALOGO).not.toMatch(/talla estándar/);
  });

  it("sin etiquetas: ni la del cuello ni colgantes, en todos los pedidos (Felipe 2026-11-14)", () => {
    const pedidos = [PROMPT_CATALOGO, PROMPT_CON_MOLDE, pedidoDeCatalogo({ espalda: true }).prompt, pedidoDeCatalogo({ detalle: true, molde: true }).prompt];
    for (const p of pedidos) {
      expect(p).toMatch(/QUITA todas las etiquetas/);
      expect(p).not.toMatch(/etiquetas cosidas/);
    }
  });
});

describe("con molde: la misma prenda en todos los colores", () => {
  it("sin molde va el pedido de siempre; con molde, el que copia la estructura y toma solo el color", () => {
    expect(camposOpenAI("m").prompt).toBe(PROMPT_CATALOGO);
    expect(camposOpenAI("m", { conMolde: true }).prompt).toBe(PROMPT_CON_MOLDE);
    expect(PROMPT_CON_MOLDE).toMatch(/copia EXACTAMENTE la estructura/);
    expect(PROMPT_CON_MOLDE).toMatch(/toma SOLO el color, el tono y el estampado/);
    expect(PROMPT_CON_MOLDE).toMatch(/Fondo transparente/);
  });

  it("con molde no cambia el tamaño ni la transparencia", () => {
    const c = camposOpenAI("m", { conMolde: true });
    expect(c).toMatchObject({ size: "1024x1280", background: "transparent", output_format: "png" });
  });
});

describe("imagenDeRespuesta", () => {
  it("saca el base64 de la primera imagen", () => {
    expect(imagenDeRespuesta({ data: [{ b64_json: "AAAA" }] })).toBe("AAAA");
    expect(imagenDeRespuesta({ data: [] })).toBeNull();
    expect(imagenDeRespuesta({ data: [{ url: "x" }] })).toBeNull();
    expect(imagenDeRespuesta(null)).toBeNull();
  });
});

describe("costoDeUso", () => {
  it("suma imagen de entrada, texto y salida a las tarifas de los modelos 2.x", () => {
    const usage = { input_tokens: 1300, input_tokens_details: { image_tokens: 1000, text_tokens: 300 }, output_tokens: 1000 };
    // 1000×8 + 300×5 + 1000×30 = 39.500 por millón
    expect(costoDeUso({ usage })).toBeCloseTo(0.0395, 6);
  });

  it("sin detalle de entrada, la cuenta toda como imagen", () => {
    expect(costoDeUso({ usage: { input_tokens: 1000, output_tokens: 0 } })).toBeCloseTo(0.008, 6);
  });

  it("sin uso, no inventa", () => {
    expect(costoDeUso({})).toBeNull();
    expect(costoDeUso({ usage: { output_tokens: 10 } })).toBeNull();
  });
});

describe("mensajeDeErrorOpenAI", () => {
  it("traduce los casos que pueden pasar al empezar", () => {
    expect(mensajeDeErrorOpenAI(401, null)).toMatch(/llave/);
    expect(mensajeDeErrorOpenAI(403, { error: { message: "Your organization must be verified to use the model" } })).toMatch(/verificar tu organización/);
    expect(mensajeDeErrorOpenAI(429, { error: { code: "insufficient_quota", message: "x" } })).toMatch(/no tiene saldo/);
    expect(mensajeDeErrorOpenAI(429, { error: { code: "rate_limit_exceeded" } })).toMatch(/esperar/);
    expect(mensajeDeErrorOpenAI(400, { error: { message: "Invalid size" } })).toBe("OpenAI no aceptó el pedido: Invalid size");
    expect(mensajeDeErrorOpenAI(404, { error: { message: "The model x does not exist" } })).toMatch(/no encuentra el modelo/);
    expect(mensajeDeErrorOpenAI(503, null)).toMatch(/no está respondiendo/);
  });
});

describe("pedidoDeCatalogo: qué fotos van y qué se le dice a la IA", () => {
  it("solo el frente: el pedido medido de siempre", () => {
    expect(pedidoDeCatalogo({})).toEqual({ orden: ["frente"], prompt: PROMPT_CATALOGO });
  });

  it("frente y molde: el pedido con molde medido (99 % de la silueta)", () => {
    expect(pedidoDeCatalogo({ molde: true })).toEqual({ orden: ["frente", "molde"], prompt: PROMPT_CON_MOLDE });
  });

  it("el frente va siempre primero y el molde siempre último", () => {
    expect(pedidoDeCatalogo({ espalda: true, detalle: true, molde: true }).orden).toEqual(["frente", "espalda", "detalle", "molde"]);
    expect(pedidoDeCatalogo({ detalle: true }).orden).toEqual(["frente", "detalle"]);
  });

  it("nombra cada imagen por su número, en el mismo orden en que se envían", () => {
    const { prompt } = pedidoDeCatalogo({ espalda: true, detalle: true, molde: true });
    expect(prompt).toMatch(/IMAGEN 1: la foto real de la prenda de frente/);
    expect(prompt).toMatch(/IMAGEN 2: la misma prenda de espalda/);
    expect(prompt).toMatch(/IMAGEN 3: un detalle de cerca de la tela/);
    expect(prompt).toMatch(/IMAGEN 4: el MOLDE/);
    expect(prompt).toMatch(/Del MOLDE \(IMAGEN 4\) copia EXACTAMENTE la estructura/);
    expect(prompt).toMatch(/De IMAGEN 1, IMAGEN 2 y IMAGEN 3 toma SOLO el color/);
  });

  it("sin molde pide el maniquí invisible; con o sin molde, transparente y sin cambiar el color", () => {
    const sin = pedidoDeCatalogo({ espalda: true }).prompt;
    expect(sin).toMatch(/MANIQUÍ INVISIBLE/);
    expect(sin).toMatch(/Usa IMAGEN 1 y IMAGEN 2 para conservar/);
    expect(sin).toMatch(/Lo que pone la PRENDA, y no se cambia/);
    expect(sin).not.toMatch(/talla estándar/);
    for (const extras of [{ espalda: true }, { detalle: true, molde: true }]) {
      const p = pedidoDeCatalogo(extras).prompt;
      expect(p).toMatch(/No cambies el color/);
      expect(p).toMatch(/Fondo transparente/);
      expect(p).not.toMatch(/arrugas|luz pareja/i);
    }
  });
});

describe("pedidoDeCatalogo con la ficha de la prenda (lo ya elegido, 2026-11-14)", () => {
  const lino = fichaParaIA({ prefijo: "PAN", tejido: "Lino", patron: "Liso" });
  const blusa = fichaParaIA({ prefijo: "CMS", tipo: "Blusa", tejido: "Seda" });

  it("sin ficha (null), el pedido es el medido, palabra por palabra", () => {
    expect(pedidoDeCatalogo({}, null)).toEqual({ orden: ["frente"], prompt: PROMPT_CATALOGO });
    expect(pedidoDeCatalogo({ molde: true }, null)).toEqual({ orden: ["frente", "molde"], prompt: PROMPT_CON_MOLDE });
  });

  it("un pantalón (cuelga de la cintura) habla de pretina y basta, no de cuello, hombros ni pecho", () => {
    const { prompt } = pedidoDeCatalogo({}, lino);
    expect(prompt).toMatch(/interior de la pretina/);
    expect(prompt).toMatch(/de la cintura a la basta/);
    expect(prompt).toMatch(/BASTA: suelta, donde termina en la foto/);
    expect(prompt).toMatch(/PIERNA: con la misma forma que en la foto/);
    // «la del cuello» sí aparece, pero en la lista de etiquetas que se quitan (`SIN_ETIQUETAS`), que es común a toda prenda.
    expect(prompt).not.toMatch(/interior del cuello|hombros|pecho|MANGAS/);
    // Lo que no depende de la zona sigue igual.
    for (const regla of ["MANIQUÍ INVISIBLE", "No cambies el color", "Fondo transparente", "QUITA todas las etiquetas"]) expect(prompt).toContain(regla);
  });

  it("la ficha va al final de los tres pedidos: solo frente, con molde y con varias fotos", () => {
    for (const extras of [{}, { molde: true }, { espalda: true, detalle: true }, { detalle: true, molde: true }]) {
      const { prompt } = pedidoDeCatalogo(extras, lino);
      expect(prompt.endsWith(lino!.texto), JSON.stringify(extras)).toBe(true);
    }
  });

  it("con varias fotos y sin molde, un pantalón tampoco habla de cuello", () => {
    const { prompt } = pedidoDeCatalogo({ espalda: true, detalle: true }, lino);
    expect(prompt).toMatch(/interior de la pretina/);
    expect(prompt).not.toMatch(/interior del cuello/);
    // Ni el escote ni «en un gancho» («gancho» solo sí aparece: «ningún … gancho ni perchero»).
    expect(prompt).not.toMatch(/en un gancho|escote/);
    expect(prompt).toMatch(/para la pretina, los bolsillos y la caída de atrás/);
  });

  it("una blusa (cuelga de los hombros) conserva el pedido medido y solo suma su ficha", () => {
    expect(pedidoDeCatalogo({}, blusa).prompt).toBe(`${PROMPT_CATALOGO} ${blusa!.texto}`);
  });

  it("con la ficha, la prenda va PLANCHADA y con su textura, dicho en positivo: sin la palabra «arrugas» ni «luz pareja» (lo de octubre que redibujaba)", () => {
    // Felipe 2026-11-16: el pantalón de lino salía arrugado. Se pide planchada en la ficha (no medida), nunca en el cuerpo medido; y sin nombrar
    // la arruga, que el modelo dibuja si la lee. Antes la ayuda del lino le decía «Se arruga (es parte de su gracia)».
    for (const extras of [{}, { molde: true }, { espalda: true }]) {
      const { prompt } = pedidoDeCatalogo(extras, lino);
      expect(prompt, JSON.stringify(extras)).toMatch(/PLANCHADA: la prenda se ve recién planchada al vapor/);
      expect(prompt, JSON.stringify(extras)).toMatch(/con la textura de su tejido a la vista/);
      expect(prompt, JSON.stringify(extras)).not.toMatch(/arrugas|luz pareja|se arruga|gracia/i);
    }
  });
});

describe("mensajeParaTienda", () => {
  it("no habla de llaves, saldos ni modelos", () => {
    for (const [estado, cuerpo] of [
      [401, null],
      [403, { error: { message: "must be verified" } }],
      [429, { error: { code: "insufficient_quota" } }],
      [404, { error: { code: "model_not_found" } }],
    ] as const) {
      const m = mensajeParaTienda(estado, cuerpo);
      expect(m).toBe("La foto de catálogo no está disponible ahora. Avísale a tu líder.");
      expect(m).not.toMatch(/llave|saldo|modelo|OPENAI/i);
    }
  });

  it("dice qué hacer cuando es pasajero", () => {
    expect(mensajeParaTienda(429, { error: { code: "rate_limit_exceeded" } })).toMatch(/en un minuto/);
    expect(mensajeParaTienda(400, null)).toMatch(/Prueba con otra/);
    expect(mensajeParaTienda(503, null)).toMatch(/Prueba en un rato/);
  });
});

describe("fase 2 (2026-11-16): el pedido de cintura, sin empujar al buzo, y el de hombros sin tocar", () => {
  const huella = (t: string) => createHash("sha256").update(t).digest("hex").slice(0, 16);
  const blusa = fichaParaIA({ prefijo: "CMS", tipo: "Blusa", tejido: "Seda", patron: "Liso" })!;
  // Se quita la ficha (que sí cambió) para comparar solo el CUERPO del pedido; igual que cuando se tomaron las huellas.
  const sinFicha = (t: string) => t.replace(blusa.texto, "");
  const pan = fichaParaIA({ prefijo: "PAN", tejido: "Lino", patron: "Liso" })!;
  const buzo = fichaParaIA({ prefijo: "PAN", tejido: "Franela" })!;
  const jean = fichaParaIA({ prefijo: "JEA", tejido: "Denim" })!;
  const sho = fichaParaIA({ prefijo: "SHO", tejido: "Algodón" })!;
  const fal = fichaParaIA({ prefijo: "FAL", tejido: "Lino" })!;
  const CAMINOS = [{}, { molde: true }, { espalda: true, detalle: true }, { espalda: true, molde: true }];

  it("el CUERPO del pedido de hombros (lo único medido: 99 % de la silueta) no cambió ni una letra: sus huellas son las de antes de la fase 2", () => {
    // Huellas tomadas el 2026-11-16 ANTES de tocar el pedido. Si una cambia, se cambió el pedido de blusas, que es el medido: no se toca sin medirlo.
    expect({
      catalogo: huella(PROMPT_CATALOGO),
      conMolde: huella(PROMPT_CON_MOLDE),
      variasSinFicha: huella(pedidoDeCatalogo({ espalda: true, detalle: true }).prompt),
      variasConMolde: huella(pedidoDeCatalogo({ espalda: true, detalle: true, molde: true }).prompt),
      blusaUna: huella(sinFicha(pedidoDeCatalogo({}, blusa).prompt)),
      blusaMolde: huella(sinFicha(pedidoDeCatalogo({ molde: true }, blusa).prompt)),
      blusaVarias: huella(sinFicha(pedidoDeCatalogo({ espalda: true, molde: true }, blusa).prompt)),
    }).toEqual({
      catalogo: "0b994ef712336754",
      conMolde: "e4a696f0432e6544",
      variasSinFicha: "5167d4bb5b0119c2",
      variasConMolde: "d1792fdb0a444f2d",
      blusaUna: "a1975bdc81d0ccdc",
      blusaMolde: "e424d75c4f2a5556",
      blusaVarias: "8995cef80caf5e4e",
    });
  });

  it("lo que de verdad recibe una blusa de seda y un chaleco de sastre (cuerpo + ficha) queda a la vista: cambiar la ficha cambia esta huella", () => {
    // La ficha va al final de TODO pedido y NO está medida. Estas huellas no prueban que esté bien: hacen que un cambio en ella no pase sin que se vea.
    const chaleco = fichaParaIA({ prefijo: "CHA", tejido: "Sastre", patron: "Liso" });
    expect({ blusa: huella(pedidoDeCatalogo({}, blusa).prompt), chaleco: huella(pedidoDeCatalogo({}, chaleco).prompt) }).toMatchInlineSnapshot(`
      {
        "blusa": "619f8bff3da28ed9",
        "chaleco": "1f13e87ad29849d2",
      }
    `);
  });

  it("ningún pedido de cintura empuja al buzo: ni basta fruncida, ni volumen inflado, ni nombra puño, cordón, felpa o jogger", () => {
    for (const ficha of [pan, jean, sho, fal])
      for (const extras of CAMINOS) {
        const { prompt } = pedidoDeCatalogo(extras, ficha);
        expect(prompt, JSON.stringify(extras)).not.toMatch(/fruncid|volumen 3D|con volumen|puño|cordón|felpa|jogger|buzo|deportiv/i);
      }
  });

  it("ninguna pierna fija un ancho: un jean flare, globo o mom conserva su forma (no se endereza)", () => {
    for (const ficha of [pan, jean, sho, buzo])
      for (const extras of CAMINOS) {
        const { prompt } = pedidoDeCatalogo(extras, ficha);
        // Tampoco se fija dónde termina la basta: un culotte o un capri terminan a media pierna.
        expect(prompt, JSON.stringify(extras)).not.toMatch(/del mismo ancho desde la cadera|caen rectas|del mismo ancho que la pierna|abierta y recta|tobillo/);
      }
    expect(pedidoDeCatalogo({}, jean).prompt).toMatch(/PIERNA: con la misma forma que en la foto.*si se abre o se cierra hacia abajo, igual/);
  });

  it("un pantalón de tela plana: la pretina va sola, con su cierre, y la basta va SUELTA alrededor del tobillo, con el acabado de la foto", () => {
    const { prompt } = pedidoDeCatalogo({}, pan);
    expect(prompt).toMatch(/PRETINA: con su mismo ancho y su mismo cierre/);
    expect(prompt).toMatch(/la arruga es de la mano y no de la pretina/);
    expect(prompt).toMatch(/las piernas caen con el peso de la tela/);
    // La caída se dice una sola vez (en el maniquí), no también en la ficha.
    expect(prompt.match(/con el peso de la tela/g)).toHaveLength(1);
    expect(prompt).toMatch(/BASTA: suelta, donde termina en la foto, con su mismo ancho y su mismo acabado/);
  });

  it("CONTROL de producción: el buzo de franela de Pantalones conserva su basta como en la foto (no se dibuja como pantalón de vestir)", () => {
    for (const extras of CAMINOS) {
      const { prompt } = pedidoDeCatalogo(extras, buzo);
      expect(prompt, JSON.stringify(extras)).not.toMatch(/BASTA: suelta|tela plana|de vestir/);
    }
    expect(pedidoDeCatalogo({}, buzo).prompt).toMatch(/BASTA: como en la foto/);
    // Un legging o un buzo («pierna») no recibe «las piernas caen con el peso de la tela»: le contradiría lo ceñido.
    expect(pedidoDeCatalogo({}, buzo).prompt).not.toMatch(/caen con el peso/);
  });

  it("una falda no recibe «bragueta» como ejemplo de su cierre", () => {
    expect(pedidoDeCatalogo({}, fal).prompt).toMatch(/PRETINA: .*\(al frente, al costado o elástica\)/);
    expect(pedidoDeCatalogo({}, fal).prompt).not.toMatch(/bragueta/);
  });

  it("CONTROL: un short deja la basta como en la foto, y una falda habla de vuelo y ruedo, no de piernas", () => {
    expect(pedidoDeCatalogo({}, sho).prompt).toMatch(/BASTA: como en la foto/);
    expect(pedidoDeCatalogo({}, sho).prompt).not.toMatch(/BASTA: suelta/);
    const falda = pedidoDeCatalogo({}, fal).prompt;
    expect(falda).toMatch(/VUELO:/);
    expect(falda).toMatch(/RUEDO:/);
    expect(falda).not.toMatch(/PIERNA|BASTA|piernas/);
  });

  it("con molde, una prenda de cintura copia su FORMA (no mangas, cuello ni elástico), toma la TEXTURA de la foto real y la ficha manda sobre el molde", () => {
    for (const extras of [{ molde: true }, { espalda: true, molde: true }]) {
      const { prompt } = pedidoDeCatalogo(extras, pan);
      expect(prompt, JSON.stringify(extras)).toMatch(/copia EXACTAMENTE la forma: la silueta, el largo, la pretina, la forma de la pierna, los pliegues/);
      expect(prompt, JSON.stringify(extras)).toMatch(/la textura de la tela/);
      expect(prompt, JSON.stringify(extras)).toMatch(/Si el MOLDE contradice los DATOS DE LA PRENDA, mandan los datos/);
      expect(prompt, JSON.stringify(extras)).not.toMatch(/mangas|\bel cuello,|el elástico|toma SOLO el color/);
    }
    expect(pedidoDeCatalogo({ molde: true }, fal).prompt).toMatch(/el vuelo, el ruedo/);
  });

  it("con molde, un pantalón de tela plana NO copia la basta del molde (un molde viejo con puño la pasaría a todos los colores)", () => {
    const conMolde = pedidoDeCatalogo({ molde: true }, pan).prompt;
    expect(conMolde).not.toMatch(/la forma de la pierna, la basta/);
    expect(conMolde).toMatch(/BASTA: suelta, como en la IMAGEN 1, aunque el molde la muestre distinta/);
    expect(pedidoDeCatalogo({ espalda: true, molde: true }, pan).prompt).toMatch(/como en las fotos reales, aunque el molde la muestre distinta/);
    // El buzo de franela sí copia su basta del molde (puede ser un puño de verdad).
    expect(pedidoDeCatalogo({ molde: true }, buzo).prompt).toMatch(/la forma de la pierna, la basta, los pliegues/);
  });

  it("la ficha sigue yendo al final de todos los pedidos de cintura", () => {
    for (const ficha of [pan, jean, sho, fal, buzo]) for (const extras of CAMINOS) expect(pedidoDeCatalogo(extras, ficha).prompt.endsWith(ficha.texto)).toBe(true);
  });
});
