// Panel de revisión de la maqueta. Todo lo que guarda (estado de cada pantalla, notas) vive en ESTE navegador (localStorage):
// nunca se escribe en producción ni en ninguna base.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const P = window.PANTALLAS;
  const CAPTURAS = {}; // se llena con actual/capturas.json
  const guardado = (() => { try { return JSON.parse(localStorage.getItem("cayla-premium-panel") || "{}"); } catch { return {}; } })();
  const deUrl = Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
  const est = {
    id: deUrl.p && P.some(x => x.id === deUrl.p) ? deUrl.p : guardado.id || P[0].id,
    modo: deUrl.m || guardado.modo || "lado",
    w: Number(deUrl.w || guardado.w || 1440),
    sincro: guardado.sincro ?? true,
    pestana: "problemas",
    senalar: false,
  };
  const leer = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? d; } catch { return d; } };
  const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  let estados = leer("cayla-premium-estados", {});
  let notas = leer("cayla-premium-notas", {});
  const pantalla = () => P.find(x => x.id === est.id);
  const persistir = () => {
    escribir("cayla-premium-panel", { id: est.id, modo: est.modo, w: est.w, sincro: est.sincro });
    history.replaceState(null, "", `#p=${est.id}&m=${est.modo}&w=${est.w}`);
  };

  // — Barra —
  const sel = $("#pantalla");
  const grupos = [...new Set(P.map(x => x.grupo))];
  sel.innerHTML = grupos.map(g => `<optgroup label="${g}">${P.filter(x => x.grupo === g).map(x => `<option value="${x.id}">${x.nombre}</option>`).join("")}</optgroup>`).join("");
  sel.addEventListener("change", () => { est.id = sel.value; irAPantalla(); });
  $("#modo").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; est.modo = b.dataset.v; montar(); });
  $("#dispositivo").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; est.w = Number(b.dataset.w); montar(); });
  $("#sincro").checked = est.sincro;
  $("#sincro").addEventListener("change", e => { est.sincro = e.target.checked; persistir(); });
  $("#verRevision").addEventListener("click", e => { const r = $("#revision"); r.hidden = !r.hidden; e.currentTarget.setAttribute("aria-expanded", String(!r.hidden)); escalar(); });
  $("#abrirPremium").addEventListener("click", () => window.open(`premium/index.html#${pantalla().ruta}`, "_blank"));
  window.addEventListener("resize", () => escalar());

  // — Lienzos —
  let iframe = null, captura = null, cerrojo = false;
  function columna(tipo) {
    const p = pantalla();
    const col = document.createElement("div");
    col.className = "columna";
    col.dataset.tipo = tipo;
    const etq = tipo === "actual"
      ? `<span class="etq" title="Captura auténtica de cayla.pe, solo lectura">Captura de cayla.pe${CAPTURAS[`${p.actual}-${est.w}`] ? ` · ${new Date(CAPTURAS[`${p.actual}-${est.w}`].fecha).toLocaleDateString("es-PE")}` : ""}</span>`
      : `<span class="etq">Maqueta navegable · datos simulados aislados</span>`;
    col.innerHTML = `<div class="columna-cab"><b>${tipo === "actual" ? "Actual" : "Premium"}</b>${etq}</div><div class="ventana"><div class="dispositivo"></div></div>`;
    const disp = col.querySelector(".dispositivo");
    if (tipo === "premium") {
      iframe = document.createElement("iframe");
      iframe.title = "Maqueta premium de la tienda";
      iframe.src = `premium/index.html#${p.ruta}`;
      iframe.addEventListener("load", () => { engancharIframe(); pintarPines(); });
      disp.append(iframe);
    } else {
      const clave = `${p.actual}-${est.w}`;
      if (p.actual && CAPTURAS[clave]) {
        captura = document.createElement("div");
        captura.className = "captura";
        captura.innerHTML = `<img alt="Captura de la tienda actual: ${p.nombre}, a ${est.w} px" src="actual/${clave}.jpg">`;
        captura.addEventListener("scroll", () => sincronizar("actual"));
        disp.append(captura);
      } else {
        captura = null;
        disp.innerHTML = `<div class="falta"><b>Sin captura auténtica</b><span>${p.actual ? "Las capturas no se guardan en el repositorio. Créalas con <code>node docs/maquetas/tienda-premium-2026-11/herramientas/maqueta.mjs actual</code> (solo lectura de cayla.pe)." : p.sinActual || "Esta pantalla no se pudo capturar en cayla.pe."}</span><span>No se muestra una aproximación como si fuera la real.</span></div>`;
      }
    }
    return col;
  }
  function montar() {
    const cont = $("#lienzos");
    cont.innerHTML = "";
    iframe = null; captura = null;
    if (est.modo !== "premium") cont.append(columna("actual"));
    if (est.modo !== "actual") cont.append(columna("premium"));
    for (const b of document.querySelectorAll("#modo button")) b.setAttribute("aria-pressed", String(b.dataset.v === est.modo));
    for (const b of document.querySelectorAll("#dispositivo button")) b.setAttribute("aria-pressed", String(Number(b.dataset.w) === est.w));
    sel.value = est.id;
    escalar();
    revision();
    persistir();
  }
  function escalar() {
    requestAnimationFrame(() => {
      for (const v of document.querySelectorAll(".ventana")) {
        const d = v.querySelector(".dispositivo");
        const s = Math.min(1, (v.clientWidth - 4) / est.w);
        d.style.width = `${est.w}px`;
        d.style.height = `${v.clientHeight / s}px`;
        d.style.transform = `scale(${s})`;
        d.style.left = `${(v.clientWidth - est.w * s) / 2}px`;
        d.style.transformOrigin = "top left";
      }
    });
  }
  function irAPantalla() {
    const p = pantalla();
    // Si el iframe ya está, solo cambia la ruta: así la bolsa y la sesión simuladas siguen ahí.
    if (iframe?.contentWindow && est.modo !== "actual") {
      const actualCol = document.querySelector('.columna[data-tipo="actual"]');
      if (actualCol) actualCol.replaceWith(columna("actual"));
      iframe.contentWindow.location.hash = p.ruta;
      escalar(); revision(); persistir(); sel.value = est.id;
      return;
    }
    montar();
  }

  // — Sincronía de desplazamiento (por proporción, porque las dos versiones no miden lo mismo) —
  const proporcion = el => { const m = el.scrollHeight - el.clientHeight; return m > 0 ? el.scrollTop / m : 0; };
  function sincronizar(desde) {
    if (!est.sincro || cerrojo || !iframe || !captura) return;
    const doc = iframe.contentDocument?.scrollingElement;
    if (!doc) return;
    cerrojo = true;
    if (desde === "actual") doc.scrollTop = proporcion(captura) * (doc.scrollHeight - doc.clientHeight);
    else captura.scrollTop = proporcion(doc) * (captura.scrollHeight - captura.clientHeight);
    requestAnimationFrame(() => { cerrojo = false; });
  }
  // La pantalla del registro que corresponde a una ruta de la maqueta: misma ruta (los segmentos variables —una prenda, un outfit,
  // una tienda, un pedido— cuentan como iguales) y todos sus parámetros presentes; gana la que pide más parámetros.
  const VARIABLES = ["prenda", "look", "tienda", "separado"];
  function pantallaDeRuta(ruta) {
    const [rp, rq = ""] = ruta.split("?"), qs = new URLSearchParams(rq);
    const igual = (a, b) => { const x = a.split("/"), y = b.split("/"); return x.length === y.length && x.every((s, i) => s === y[i] || (i === 2 && VARIABLES.includes(x[1]) && x[1] === y[1])); };
    let mejor = null, puntos = -1;
    for (const x of P) {
      const [xp, xq = ""] = x.ruta.split("?");
      if (!igual(xp, rp)) continue;
      const pide = [...new URLSearchParams(xq)];
      if (pide.some(([k, v]) => qs.get(k) !== v && k !== "demo")) continue;
      const n = pide.filter(([k]) => k !== "demo").length;
      if (n > puntos) { mejor = x; puntos = n; }
    }
    return mejor;
  }
  function engancharIframe() {
    const w = iframe?.contentWindow;
    if (!w) return;
    w.addEventListener("scroll", () => sincronizar("premium"), { passive: true });
    w.addEventListener("hashchange", () => {
      // Si la clienta navegó dentro de la maqueta, el panel sigue a esa pantalla.
      const ruta = w.location.hash.slice(1) || "/";
      const p = ruta === pantalla().ruta ? pantalla() : pantallaDeRuta(ruta);
      if (p && p.id !== est.id) {
        est.id = p.id; sel.value = p.id;
        const actualCol = document.querySelector('.columna[data-tipo="actual"]');
        if (actualCol) actualCol.replaceWith(columna("actual"));
        escalar(); revision(); persistir();
      }
      setTimeout(pintarPines, 300);
    });
  }

  // — Revisión: problemas, mejoras, notas y tablero —
  const TIPO = { comprobado: "Comprobado", observado: "Observado", propuesta: "Propuesta", decide: "Decide Felipe" };
  const item = x => `<div class="item"><h4><span class="tipo ${x.tipo}">${TIPO[x.tipo] || x.tipo}</span>${x.t}</h4>${x.d ? `<p>${x.d}</p>` : ""}</div>`;
  for (const b of document.querySelectorAll(".pestanas-rev button")) b.addEventListener("click", () => { est.pestana = b.dataset.p; revision(); });
  $("#estado").addEventListener("change", e => { estados[est.id] = e.target.value; escribir("cayla-premium-estados", estados); if (est.pestana === "todas") revision(); });
  function revision() {
    const p = pantalla();
    $("#revGrupo").textContent = p.grupo;
    $("#revTitulo").textContent = p.nombre;
    $("#estado").value = estados[p.id] || "por-revisar";
    $("#cuentaNotas").textContent = (notas[p.id] || []).length || "";
    for (const b of document.querySelectorAll(".pestanas-rev button")) b.setAttribute("aria-selected", String(b.dataset.p === est.pestana));
    const c = $("#revCuerpo");
    if (est.pestana === "problemas") c.innerHTML = `<p class="nota-intro"><b>Comprobado</b>: se ve en la captura o en el código, con evidencia. <b>Observado</b>: se vio en la captura y conviene confirmarlo en un aparato real.</p>${(p.problemas || []).map(item).join("") || "<p>Sin problemas anotados.</p>"}`;
    else if (est.pestana === "mejoras") c.innerHTML = `<p class="nota-intro">Lo que cambia la versión Premium y por qué. <b>Decide Felipe</b>: toca negocio o marca.</p>${(p.mejoras || []).map(item).join("") || "<p>Sin mejoras anotadas.</p>"}`;
    else if (est.pestana === "notas") notasVista(c, p);
    else tablero(c);
  }
  function notasVista(c, p) {
    const lista = notas[p.id] || [];
    c.innerHTML = `<p class="nota-intro">Tus observaciones se guardan solo en este navegador. «Señalar» marca un punto en la maqueta Premium.</p>
      <div class="form-nota"><textarea id="textoNota" placeholder="Qué cambiarías en ${p.nombre}…"></textarea>
      <div class="fila"><button class="prim" id="agregarNota">Agregar nota</button><button id="senalar" aria-pressed="${est.senalar}">${est.senalar ? "Toca la maqueta…" : "Señalar en la maqueta"}</button><button id="exportar">Descargar todas</button></div></div>
      ${lista.map((n, i) => `<div class="nota"><button class="quitar" data-i="${i}" aria-label="Quitar nota">✕</button><small>${n.pin ? `📍 ${n.pin.n} · ` : ""}${new Date(n.fecha).toLocaleString("es-PE")} · ${n.w}px · ${n.modo}${n.pin?.que ? ` · «${n.pin.que}»` : ""}</small>${n.texto.replace(/</g, "&lt;")}</div>`).join("")}`;
    $("#agregarNota").onclick = () => agregarNota(null);
    $("#senalar").onclick = () => { est.senalar = !est.senalar; capaSenalar(); revision(); };
    $("#exportar").onclick = exportar;
    for (const b of c.querySelectorAll(".quitar")) b.onclick = () => { lista.splice(Number(b.dataset.i), 1); notas[p.id] = lista; escribir("cayla-premium-notas", notas); revision(); pintarPines(); };
  }
  function agregarNota(pin) {
    const t = $("#textoNota")?.value.trim();
    if (!t && !pin) return;
    const lista = notas[est.id] || (notas[est.id] = []);
    lista.push({ texto: t || "(sin texto)", fecha: Date.now(), w: est.w, modo: est.modo, pin, ruta: iframe?.contentWindow?.location.hash.slice(1) });
    escribir("cayla-premium-notas", notas);
    revision(); pintarPines();
  }
  function capaSenalar() {
    document.querySelector(".pin-capa")?.remove();
    const v = document.querySelector('.columna[data-tipo="premium"] .dispositivo');
    if (!est.senalar || !v) return;
    const capa = document.createElement("div");
    capa.className = "pin-capa";
    capa.title = "Toca el componente que quieres señalar";
    capa.addEventListener("click", e => {
      const r = v.getBoundingClientRect(), s = r.width / est.w;
      const x = (e.clientX - r.left) / s, y = (e.clientY - r.top) / s;
      const d = iframe.contentDocument;
      const el = d.elementFromPoint(x, y);
      const que = (el?.closest("[aria-label],h1,h2,h3,button,a,label")?.getAttribute("aria-label") || el?.closest("h1,h2,h3,button,a,label")?.textContent || el?.className || el?.tagName || "").toString().trim().slice(0, 60);
      const n = (notas[est.id] || []).filter(z => z.pin).length + 1;
      est.senalar = false; capa.remove();
      agregarNota({ n, x: x / est.w, y: y + d.scrollingElement.scrollTop, que });
    });
    v.append(capa);
  }
  function pintarPines() {
    const d = iframe?.contentDocument;
    if (!d?.body) return;
    d.querySelectorAll(".pin-revision").forEach(x => x.remove());
    const ruta = iframe.contentWindow.location.hash.slice(1);
    for (const n of notas[est.id] || []) {
      if (!n.pin || (n.ruta && n.ruta !== ruta)) continue;
      const p = d.createElement("div");
      p.className = "pin-revision";
      p.textContent = n.pin.n;
      p.title = n.texto;
      Object.assign(p.style, { position: "absolute", left: `${n.pin.x * 100}%`, top: `${n.pin.y}px`, zIndex: 9999, width: "24px", height: "24px", margin: "-12px 0 0 -12px", borderRadius: "50%", background: "#3b5bdb", color: "#fff", font: "700 11px/24px system-ui", textAlign: "center", boxShadow: "0 0 0 3px #fff", pointerEvents: "none" });
      d.body.style.position = "relative";
      d.body.append(p);
    }
  }
  function exportar() {
    const lineas = ["# Notas de revisión · Tienda CAYLA Premium", "", `Exportado: ${new Date().toLocaleString("es-PE")}`, ""];
    for (const x of P) {
      const ns = notas[x.id] || [];
      lineas.push(`## ${x.grupo} · ${x.nombre} — ${({ "por-revisar": "Por revisar", "en-ajuste": "Pide ajustes", aprobada: "Aprobada" })[estados[x.id] || "por-revisar"]}`);
      if (!ns.length) lineas.push("- (sin notas)");
      for (const n of ns) lineas.push(`- ${n.pin ? `📍${n.pin.n} (${n.pin.que}) ` : ""}[${n.w}px · ${n.modo}] ${n.texto}`);
      lineas.push("");
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lineas.join("\n")], { type: "text/markdown" }));
    a.download = "notas-revision-tienda-premium.md";
    a.click();
  }
  function tablero(c) {
    const cuenta = { "por-revisar": 0, "en-ajuste": 0, aprobada: 0 };
    for (const x of P) cuenta[estados[x.id] || "por-revisar"]++;
    c.innerHTML = `<p class="nota-intro">${P.length} pantallas · ${cuenta.aprobada} aprobadas · ${cuenta["en-ajuste"]} piden ajustes · ${cuenta["por-revisar"]} por revisar.</p>
      <table class="tablero">${grupos.map(g => `<tr><td colspan="3"><b>${g}</b></td></tr>${P.filter(x => x.grupo === g).map(x => `<tr><td><span class="punto ${estados[x.id] || ""}"></span><button data-id="${x.id}">${x.nombre}</button></td><td>${(x.problemas || []).length} prob.</td><td>${(notas[x.id] || []).length} notas</td></tr>`).join("")}`).join("")}</table>`;
    for (const b of c.querySelectorAll("button[data-id]")) b.onclick = () => { est.id = b.dataset.id; irAPantalla(); };
  }

  fetch("actual/capturas.json").then(r => r.json()).then(j => Object.assign(CAPTURAS, j)).catch(() => {}).finally(montar);
})();
