/* Escaneo repetido · maqueta (2026-10-28). Datos inventados; nada se guarda.
   La regla que se prueba (en el ERP viviría en una función pura, p. ej. lib/lectura-repetida.ts, con su prueba):
     · la prenda no está en la lista            → suma 1 (como hoy)
     · ya está, y no es una «pila declarada»     → NO suma: pregunta (¿Quieres volver a agregar esta prenda?)
     · mientras pregunta, la misma etiqueta      → se ignora (solo se cuenta)
     · otra prenda mientras pregunta             → «No» a la anterior y esa otra se lee normal (en B no: la hoja bloquea)
     · responder es TOCAR; nunca Enter (el Enter de la pistola no puede decir «Sí» por ti). */
(() => {
  const PRENDAS = [
    { id: "emma", nombre: "Blusa Emma", det: "M · Beige", sku: "BL-EMM-M-BEI", cod: "7701001", alm: 12, color: "#d9c3a3", claro: true },
    { id: "luna", nombre: "Casaca Luna", det: "S · Negro", sku: "CS-LUN-S-NEG", cod: "7701002", alm: 6, color: "#3a3733" },
    { id: "sofia", nombre: "Vestido Sofía", det: "L · Azul", sku: "VS-SOF-L-AZU", cod: "7701003", alm: 4, color: "#5b7a99" },
  ];
  const P = Object.fromEntries(PRENDAS.map((p) => [p.id, p]));
  const POR_COD = Object.fromEntries(PRENDAS.map((p) => [p.cod, p.id]));

  const S = {};
  const $ = (s) => document.querySelector(s);
  const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
  const nom = (p) => `${p.nombre} · ${p.det}`;
  const line = (id) => S.lines.find((l) => l.id === id);
  const total = () => S.lines.reduce((s, l) => s + l.n, 0);
  let timerNota = 0;
  let timerQuieta = 0;

  /* ── sonido: el mismo idioma de siempre (agudo = sumó, grave y largo = mira la pantalla) ───────── */
  let ac = null;
  function tono(f, ms) {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = f;
      g.gain.value = 0.05;
      o.connect(g);
      g.connect(ac.destination);
      o.start();
      o.stop(ac.currentTime + ms / 1000);
    } catch (e) { /* sin audio: el demo sigue */ }
  }
  const sonido = (k) => (k === "nueva" ? tono(1320, 70) : k === "suma" ? tono(1760, 70) : tono(330, 260));

  function reset() {
    clearTimeout(timerNota);
    clearInterval(timerQuieta);
    Object.assign(S, {
      lines: [{ id: "luna", n: 2 }, { id: "sofia", n: 1 }],
      pend: null, sin: new Set(), log: [], flash: null, ultima: null, nota: null,
    });
    log("info", "Lista de ejemplo: 2 casacas Luna y 1 vestido Sofía ya escaneados.");
    render();
  }

  function log(tipo, txt, k) {
    if (k && S.log[0] && S.log[0].k === k) { S.log[0].txt = txt; return; }
    S.log.unshift({ tipo, txt, k });
    S.log = S.log.slice(0, 40);
  }

  function nota(txt) {
    S.nota = { txt };
    clearTimeout(timerNota);
    timerNota = setTimeout(() => { S.nota = null; render(); }, 4200);
  }

  function sumar(id, tono = "verde") {
    const l = line(id);
    if (l) { l.n += 1; S.lines = [l, ...S.lines.filter((x) => x !== l)]; } else S.lines.unshift({ id, n: 1 });
    S.flash = { id, fresh: true, tono };
    S.ultima = id;
    return line(id);
  }

  /* ── una lectura (pistola o cámara: el mismo camino) ───────────────────────────────────────────── */
  function scan(id) {
    const p = P[id];
    if (S.pend) {
      if (S.pend.id === id) {
        S.pend.ign += 1;
        S.pend.fresh = false;
        log("ign", `${p.nombre}: la misma etiqueta sigue ahí. No suma · ${plural(S.pend.ign, "lectura ignorada", "lecturas ignoradas")}.`, "rep:" + id);
        return render();
      }
      if (S.dir === "b") {
        log("ign", `${p.nombre}: la hoja está abierta. Responde primero (no se leyó).`, "bloq");
        return render();
      }
      resolver("no", " (pasaste a otra prenda)");
    }
    const l = line(id);
    clearTimeout(timerNota);
    S.nota = null;
    if (!l) {
      sumar(id);
      sonido("nueva");
      log("ok", `${p.nombre}: primera lectura, entra a la lista (1).`);
      return render();
    }
    if (l.n >= p.alm) {
      sonido("grave");
      S.ultima = id;
      nota(`${p.nombre}: ya bajaste todo lo que hay en el almacén (${p.alm}).`);
      log("ign", `${p.nombre}: tope del almacén (${p.alm}). No suma.`);
      return render();
    }
    if (S.sin.has(id)) {
      sumar(id);
      sonido("suma");
      log("ok", `${p.nombre}: suma 1 → ${line(id).n} (pila declarada, no pregunta).`);
      return render();
    }
    S.pend = { id, ign: 0, fresh: true, varias: false, v: l.n + 1 };
    S.ultima = id;
    S.flash = { id, fresh: true, tono: "ambar" };
    sonido("grave");
    log("ask", `${p.nombre}: ya llevas ${l.n}. Pregunto antes de sumar.`);
    render();
  }

  function resolver(r, extra = "") {
    const id = S.pend.id;
    const p = P[id];
    const l = line(id);
    const ign = S.pend.ign;
    const cola = ign ? ` Ignoré ${plural(ign, "lectura repetida", "lecturas repetidas")}.` : "";
    if (r === "si") {
      sumar(id);
      sonido("suma");
      log("ok", `Sí: ${p.nombre} suma 1 → ${l.n}.${cola}`);
    } else {
      log("no", `No: ${p.nombre} se queda en ${l.n}${extra}.${cola}`);
      if (!extra) nota(`No se sumó. ${p.nombre} sigue en ${l.n}.`);
    }
    S.pend = null;
  }

  function poner() {
    const id = S.pend.id;
    const l = line(id);
    l.n = S.pend.v;
    S.sin.add(id);
    S.flash = { id, fresh: true, tono: "verde" };
    sonido("suma");
    log("ok", `Son varias iguales: ${P[id].nombre} queda en ${l.n}. Ya no pregunta por esta prenda.`);
    S.pend = null;
  }

  /* ── piezas de la pregunta ─────────────────────────────────────────────────────────────────────── */
  function cifras() {
    const l = line(S.pend.id);
    return `<div class="cifras">
      <div class="cif"><div class="lbl">Llevas de esta prenda</div><div class="v num"><span class="a">${l.n}</span><svg class="ic"><use href="#i-arrow"/></svg><span class="b">${l.n + 1}</span><small>si la agregas</small></div></div>
    </div>`;
  }
  function varias() {
    const id = S.pend.id;
    const l = line(id);
    const tope = P[id].alm;
    const v = S.pend.v;
    return `<div class="varias ${S.pend.varFresh ? "fresh" : ""}"><p>¿Cuántas tienes <b>en total</b>? <span style="color:var(--t65)">(hay ${tope} en el almacén)</span></p>
      <div class="paso"><button data-act="vmenos" class="${v <= l.n + 1 ? "off" : ""}" aria-label="Una menos">−</button><span class="n num">${v}</span><button data-act="vmas" class="${v >= tope ? "off" : ""}" aria-label="Una más">+</button></div>
      <button class="btn pri chico" data-act="poner">Poner ${v}</button><button class="btn sut chico" data-act="varias">Cancelar</button></div>`;
  }
  function botones() {
    return `<div class="btns"><button class="btn" data-act="si">Sí, agregar otra</button><button class="btn" data-act="no">No, fue la misma</button>${S.pend.varias ? "" : `<button class="btn sut" data-act="varias">Son varias iguales</button>`}</div>${S.pend.varias ? varias() : ""}`;
  }
  function pie() {
    const n = S.pend.ign;
    return `<div class="preg-pie">${n ? `<span class="chip amb ign">${plural(n, "lectura repetida ignorada", "lecturas repetidas ignoradas")}</span>` : ""}<span><span class="kbd">Esc</span> = No · escanear otra prenda = No</span></div>`;
  }
  const rol = `role="alertdialog" aria-live="assertive" aria-label="¿Quieres volver a agregar esta prenda?"`;

  function preguntaA() {
    const p = P[S.pend.id];
    return `<div class="preg ${S.pend.fresh ? "fresh" : ""}" ${rol}>
      <div class="preg-t"><svg class="ic g"><use href="#i-copy"/></svg><div><h3>¿Quieres volver a agregar esta prenda?</h3><p class="quien"><b>${nom(p)}</b> ya está en la lista.</p></div></div>
      ${cifras()}${botones()}${pie()}</div>`;
  }
  function hojaB() {
    const p = P[S.pend.id];
    const f = S.pend.fresh ? "fresh" : "";
    return `<div class="velo ${f}"><div class="hoja ${f}" ${rol}>
      <div class="preg-t"><svg class="ic g hd"><use href="#i-copy"/></svg><div><h3>¿Quieres volver a agregar esta prenda?</h3><p class="quien"><b>${nom(p)}</b> ya está en la lista.</p></div></div>
      ${cifras()}${botones()}<p class="ign-b">${S.pend.ign ? `<span class="chip amb">${plural(S.pend.ign, "lectura repetida ignorada", "lecturas repetidas ignoradas")}</span> · ` : ""}<span class="kbd">Esc</span> = No. Mientras esta hoja esté abierta, no se lee nada más.</p>
    </div></div>`;
  }
  function tiraC() {
    const id = S.pend.id;
    const l = line(id);
    return `<div class="tira-pide ${S.pend.fresh ? "fresh" : ""}" ${rol}>
      <p class="tx"><span class="lbl">¿Quieres volver a agregar esta prenda?</span>Llevas <b class="num">${l.n}</b> → serían <b class="num">${l.n + 1}</b></p>
      <div class="btns"><button class="btn chico" data-act="si">Sí, agregar otra</button><button class="btn chico" data-act="no">No, fue la misma</button>${S.pend.varias ? "" : `<button class="btn sut chico" data-act="varias">Son varias iguales</button>`}</div>
      ${S.pend.varias ? varias() : ""}
      ${S.pend.ign ? `<span class="chip amb ign">${plural(S.pend.ign, "lectura ignorada", "lecturas ignoradas")}</span>` : ""}
    </div>`;
  }

  /* ── pintar ────────────────────────────────────────────────────────────────────────────────────── */
  function put(el, html) {
    if (el._h !== html) { el.innerHTML = html; el._h = html; }
  }

  function renderEscr() {
    put($("#z-nota"), S.nota ? `<div class="nota-r"><svg class="ic"><use href="#i-info"/></svg>${S.nota.txt}</div>` : "");
    put($("#z-aviso"), S.dir === "a" && S.pend ? preguntaA() : "");
    put($("#z-hoja"), S.dir === "b" && S.pend ? hojaB() : "");
    const filas = S.lines.map((l) => {
      const p = P[l.id];
      const pide = S.pend && S.pend.id === l.id && S.dir !== "b";
      const dest = S.flash && S.flash.fresh && S.flash.id === l.id && S.flash.tono === "verde";
      return `<li class="fila ${pide ? "pide" : ""}">${dest ? '<span class="dest"></span>' : ""}
        <div class="pren"><div class="mini ${p.claro ? "claro" : ""}" style="background:${p.color}" data-color-dato><svg class="ic"><use href="#i-hanger"/></svg></div>
          <div><p class="nom">${nom(p)}</p><p class="sku">${p.sku}</p>
          <p class="meta"><span class="num">En almacén: ${p.alm}</span>${S.sin.has(l.id) ? `<span class="chip piz">Varias iguales · sin preguntar</span><button class="btn sut chico" data-act="volverapreguntar" data-id="${l.id}" style="height:24px;padding:0 8px;font-size:11.5px">Volver a preguntar</button>` : ""}</p></div></div>
        <div class="acc"><div class="paso"><button data-act="menos" data-id="${l.id}" class="${l.n <= 1 ? "off" : ""}" aria-label="Una menos de ${p.nombre}">−</button><span class="n num">${l.n}</span><button data-act="mas" data-id="${l.id}" class="${l.n >= p.alm ? "off" : ""}" aria-label="Una más de ${p.nombre}">+</button></div>
          <button class="btn sut" data-act="quitar" data-id="${l.id}">Quitar</button></div>
        ${S.dir === "c" && pide ? tiraC() : ""}</li>`;
    });
    put($("#lista"), S.lines.length ? `<ul>${filas.join("")}</ul>` : `<div class="vacio">Aún no escaneaste nada.</div>`);
    const t = total();
    put($("#isla"), `<div><p class="res"><span class="pop">${plural(t, "prenda", "prendas")} · ${plural(S.lines.length, "modelo", "modelos")}</span></p></div>
      <div class="der"><div class="combo"><span class="avat">A</span>Ana Quispe</div><button class="btn pri ${S.lines.length ? "" : "off"}">${S.lines.length ? `Confirmar bajada · ${plural(t, "prenda", "prendas")}` : "Confirmar bajada"}</button></div>`);
  }

  function renderTel() {
    const act = S.ultima ? P[S.ultima] : null;
    const l = act ? line(S.ultima) : null;
    const f = S.flash && S.flash.fresh;
    const visor = `<div class="visor"><i class="esq a"></i><i class="esq b"></i><i class="esq c"></i><i class="esq d"></i>
      ${act ? `<div class="etq ${f ? "nueva" : ""}"><i></i><span>${act.cod}</span></div>` : ""}
      ${f ? `<div class="flash ${S.flash.tono === "ambar" ? "ambar" : "verde"}"></div>` : ""}</div>`;
    const card = () => `<div class="tel-card"><div class="lbl">Estás bajando</div><p class="nom">${act.nombre}</p><p class="det">${act.det} · ${act.sku}</p>
      <div class="fila-n"><span class="det">En almacén: ${act.alm}</span><div class="paso"><button data-act="menos" data-id="${act.id}" class="${l.n <= 1 ? "off" : ""}" aria-label="Una menos">−</button><span class="n num">${l.n}</span><button data-act="mas" data-id="${act.id}" class="${l.n >= act.alm ? "off" : ""}" aria-label="Una más">+</button></div></div></div>`;
    let bandeja;
    if (!act || !l) bandeja = `<p class="tel-vacio">Lo que escanees aparece aquí, con − / + para corregir.</p>`;
    else if (S.pend && S.dir === "a") {
      bandeja = `<div class="tel-card pide ${S.pend.fresh ? "fresh" : ""}" ${rol}><div class="lbl">Ya está en la lista</div>
        <p class="nom" style="font-size:21px">¿Quieres volver a agregar esta prenda?</p><p class="quien"><b>${nom(act)}</b></p>
        ${cifras()}${botones()}${pie()}</div>`;
    } else if (S.pend && S.dir === "c") {
      bandeja = `<div class="tel-card pide ${S.pend.fresh ? "fresh" : ""}" ${rol}><div class="lbl">Estás bajando</div><p class="nom">${act.nombre}</p><p class="det">${act.det} · ${act.sku}</p>
        <div class="tira-pide vieja" style="margin-top:10px;background:#1b1815;border-color:#e4b968"><p class="tx" style="color:#e8e0d0"><span class="lbl">¿Quieres volver a agregar esta prenda?</span>Llevas <b class="num">${l.n}</b> → serían <b class="num">${l.n + 1}</b></p>
        <div class="btns" style="margin:0"><button class="btn chico" data-act="si">Sí, agregar otra</button><button class="btn chico" data-act="no">No, fue la misma</button>${S.pend.varias ? "" : `<button class="btn sut chico" data-act="varias">Son varias iguales</button>`}</div>${S.pend.varias ? varias() : ""}
        ${S.pend.ign ? `<span class="chip amb ign">${plural(S.pend.ign, "lectura ignorada", "lecturas ignoradas")}</span>` : ""}</div></div>`;
    } else bandeja = card();
    const hoja = S.pend && S.dir === "b" ? `<div class="tel-velo ${S.pend.fresh ? "fresh" : ""}"><div class="tel-hoja ${S.pend.fresh ? "fresh" : ""}" ${rol}><div class="asa"></div>
      <div class="preg-t"><svg class="ic g hd" style="color:var(--ambar)"><use href="#i-copy"/></svg><div><h3>¿Quieres volver a agregar esta prenda?</h3><p class="quien"><b>${nom(P[S.pend.id])}</b> ya está en la lista.</p></div></div>
      ${cifras()}${botones()}<p class="ign-b" style="margin-top:10px;font-size:12px;color:var(--taupe)">${S.pend.ign ? `<span class="chip amb">${plural(S.pend.ign, "lectura repetida ignorada", "lecturas repetidas ignoradas")}</span> · ` : ""}Mientras esta hoja esté abierta, no se lee nada más.</p></div></div>` : "";
    put($("#tel"), `<div class="tel-top"><div class="t"><small>Bajar · cada lectura suma 1</small><b>Bajar con la cámara</b></div><span class="cont num">${total()}</span><span class="tel-x"><svg class="ic"><use href="#i-x"/></svg></span></div>
      ${visor}<p class="pildora-v">Pasa las etiquetas una tras otra · suena y vibra en cada una</p>
      <div class="bandeja">${bandeja}</div>
      <div class="tel-pie"><button class="btn" data-act="pant" data-v="escr">Listo</button></div>${hoja}`);
  }

  function renderRegistro() {
    const etq = { ok: "Sumó", ask: "Preguntó", no: "No", ign: "Ignorada", info: "" };
    put($("#registro"), S.log.length ? S.log.map((e) => `<li class="${e.tipo}"><i class="p"></i><span>${e.txt}</span></li>`).join("") : `<li class="vacio-r">Aquí aparece cada lectura y qué hizo el sistema.</li>`);
    void etq;
  }

  const RECO = {
    a: `<h2>★ A · Aviso en el campo</h2><p><b>Ganas:</b> es la misma forma de las ofertas «La tengo en la mano» que ya existen bajo el campo; nada se tapa, la lista y el total se ven mientras decides, y escanear otra prenda sigue funcionando (cuenta como «No»).</p><p><b>Pagas:</b> en el celular el aviso ocupa el lugar de la bandeja y hay que mirar abajo. Para eso suena el tono grave.</p>`,
    b: `<h2>B · Hoja al centro</h2><p><b>Ganas:</b> imposible no verla; nadie sigue escaneando sin responder.</p><p><b>Pagas:</b> frena a quien escanea una pila de prendas distintas (cada lectura espera) y tapa la lista, justo lo que hace falta para decidir. Es la más lenta.</p>`,
    c: `<h2>C · La fila pregunta</h2><p><b>Ganas:</b> la pregunta vive donde vive el número: ves la prenda, su cantidad y la respuesta juntas.</p><p><b>Pagas:</b> si la fila está lejos o fuera de pantalla, la pregunta pasa desapercibida; hace falta desplazar la vista a la lista y el campo queda sin aviso.</p>`,
  };

  function render() {
    renderEscr();
    renderTel();
    renderRegistro();
    put($("#reco"), RECO[S.dir]);
    $("#reco").classList.toggle("reco", S.dir === "a");
    if (S.pend) { S.pend.fresh = false; S.pend.varFresh = false; }
    if (S.flash) S.flash.fresh = false;
  }

  /* ── eventos ───────────────────────────────────────────────────────────────────────────────────── */
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const id = b.dataset.id;
    switch (b.dataset.act) {
      case "si": return S.pend && (resolver("si"), render());
      case "no": return S.pend && (resolver("no"), render());
      case "varias": S.pend.varias = !S.pend.varias; S.pend.fresh = false; S.pend.varFresh = true; return render();
      case "vmenos": S.pend.v = Math.max(line(S.pend.id).n + 1, S.pend.v - 1); return render();
      case "vmas": S.pend.v = Math.min(P[S.pend.id].alm, S.pend.v + 1); return render();
      case "poner": return poner(), render();
      case "mas": { const l = line(id); if (l && l.n < P[id].alm) { l.n += 1; S.ultima = id; render(); } return; }
      case "menos": { const l = line(id); if (l && l.n > 1) { l.n -= 1; S.ultima = id; render(); } return; }
      case "quitar": S.lines = S.lines.filter((l) => l.id !== id); if (S.pend && S.pend.id === id) S.pend = null; log("info", `${P[id].nombre} se quitó de la lista.`); return render();
      case "volverapreguntar": S.sin.delete(id); return render();
      case "scan": return scan(id);
      case "repetir": return S.ultima ? scan(S.ultima) : nota("Primero escanea una prenda.") || render();
      case "quieta": return quieta();
      case "dir": S.dir = b.dataset.v; marcar("dir"); return render();
      case "pant": S.pant = b.dataset.v; marcar("pant"); $("#escr").hidden = S.pant !== "escr"; $("#cel").hidden = S.pant !== "cel"; return render();
      case "tema": { const o = document.documentElement.dataset.tema !== "oscuro"; document.documentElement.dataset.tema = o ? "oscuro" : "claro"; b.textContent = o ? "Modo claro" : "Modo oscuro"; return; }
      case "lento": document.documentElement.classList.toggle("lento"); b.classList.toggle("on"); return;
      case "reset": return reset();
    }
  });

  function marcar(grupo) {
    document.querySelectorAll(`[data-act="${grupo}"]`).forEach((x) => x.classList.toggle("on", x.dataset.v === S[grupo === "dir" ? "dir" : "pant"]));
  }

  // La etiqueta se queda frente al lector y sigue leyéndose: 6 lecturas seguidas de la misma.
  function quieta() {
    const id = S.ultima;
    if (!id) { nota("Primero escanea una prenda."); return render(); }
    clearInterval(timerQuieta);
    let n = 0;
    scan(id);
    timerQuieta = setInterval(() => { n += 1; scan(id); if (n >= 5) clearInterval(timerQuieta); }, 380);
  }

  $("#campo").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const texto = e.currentTarget.value.trim();
    e.currentTarget.value = "";
    if (!texto) return;
    const id = POR_COD[texto];
    if (id) return scan(id);
    sonido("grave");
    nota(`No encuentro «${texto}» entre las prendas de Lima. Prueba con 7701001, 7701002 o 7701003.`);
    render();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && S.pend) { resolver("no"); render(); }
  });

  $("#botones-prendas").innerHTML = PRENDAS.map((p) => `<button class="btn" data-act="scan" data-id="${p.id}"><i class="sw" style="background:${p.color}" data-color-dato></i><span>${nom(p)}<br><span class="cod">${p.cod}</span></span></button>`).join("");

  if (/sinmov/.test(location.search)) document.documentElement.classList.add("sinmov");
  S.dir = "a";
  S.pant = "escr";
  reset();
})();
