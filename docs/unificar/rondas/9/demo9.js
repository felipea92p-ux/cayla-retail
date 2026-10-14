// Ronda 9 de /unificar: el comportamiento de las demos vivas (todo delegado; sobrevive a «Repetir»). Nada guarda ni navega.
(() => {
  const sinTildes = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const reiniciar = (el) => { const c = el.cloneNode(true); el.replaceWith(c); };

  // ---------- 1 · la lista de sugerencias ----------
  const filasDe = (sg) => [...sg.querySelectorAll("[data-sg-fila]:not([hidden])")];
  function activar(sg, fila) {
    sg.querySelectorAll("[data-sg-fila]").forEach((f) => { const si = f === fila; f.classList.toggle("activa", si); f.setAttribute("aria-selected", String(si)); });
    fila?.scrollIntoView({ block: "nearest" });
  }
  function sumar(sg, fila) {
    if (!fila) return;
    fila.classList.remove("sumo"); void fila.offsetWidth; fila.classList.add("sumo");
    const lectura = sg.querySelector("[data-sg-lectura]");
    if (lectura) lectura.textContent = !/^F\d/.test(fila.dataset.n)
      ? `✓ Sumó 1 · ${fila.dataset.n} ${fila.dataset.d.split(" · ").slice(0, 2).join(" / ")} (en la demo no se guarda nada)`
      : `✓ Elegiste ${fila.dataset.n} · ${fila.dataset.d} (en la demo no se guarda nada)`;
  }
  function filtrar(sg, texto) {
    const q = sinTildes(texto.trim());
    let primera = null;
    sg.querySelectorAll("[data-sg-fila]").forEach((f, i) => {
      const ve = !q || sinTildes(`${f.dataset.n} ${f.dataset.d}`).includes(q);
      f.hidden = !ve;
      if (ve) { f.style.setProperty("--i", String(i)); if (!primera) primera = f; }
    });
    activar(sg, primera);
    const caja = sg.querySelector("[data-sg-buscador], .buscador");
    caja?.toggleAttribute("data-con-texto", !!texto);
  }

  // ---------- 2 · la planilla de Conteo ----------
  const CHIP = {
    neutro: "background:var(--color-sand);color:var(--color-taupe)",
    verde: "background:color-mix(in srgb,var(--color-verde) 15%,transparent);color:var(--color-verde)",
    rojo: "background:color-mix(in srgb,var(--color-rojo) 10%,transparent);color:var(--color-rojo-profundo)",
  };
  const chip = (t, tono) => `<span style="display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:999px;font-size:12px;line-height:20px;${CHIP[tono]}" class="anim-asentar"><span style="width:6px;height:6px;border-radius:99px;background:currentColor"></span>${t}</span>`;
  function contar(tr, valor) {
    const debe = Number(tr.dataset.debe);
    const input = tr.querySelector("input");
    const n = valor === "" || valor === null ? null : Math.max(0, Number(valor));
    input.value = n === null ? "" : String(n);
    tr.classList.toggle("correcta", n === debe);
    tr.querySelector("[data-cf-estado]").innerHTML = n === null ? chip("Pendiente", "neutro") : n === debe ? chip("Correcto", "verde") : n < debe ? chip(`Faltan ${debe - n}`, "rojo") : chip(`Hay ${n - debe} de más`, "rojo");
    if (tr.closest(".cf-tabla-sis") && n !== null) { tr.classList.remove("recien"); void tr.offsetWidth; tr.classList.add("recien"); }
  }

  // ---------- 3 · las píldoras de Frescura ----------
  const cerrarFz = (fz) => { if (!fz) return; fz.querySelector("[data-fz-lista]").hidden = true; fz.querySelector("[data-fz-pildora]").removeAttribute("data-abierta"); fz.querySelector("[data-fz-abre]").setAttribute("aria-expanded", "false"); };
  function ponerFz(fz, op) {
    const todos = fz.dataset.todos;
    fz.querySelectorAll("[data-fz-op]").forEach((o) => o.setAttribute("aria-selected", String(o === op)));
    const puesta = op.dataset.valor !== todos;
    const pild = fz.querySelector("[data-fz-pildora]");
    pild.toggleAttribute("data-puesta", puesta);
    const nombre = pild.querySelector(".pildora-filtro-nombre");
    nombre.textContent = puesta ? `${fz.dataset.nombre}:` : fz.dataset.nombre;
    const valor = pild.querySelector(".pildora-filtro-valor");
    valor.hidden = !puesta;
    valor.querySelector(".truncate").textContent = op.dataset.texto;
    pild.querySelector("[data-fz-quitar]").hidden = !puesta;
    pild.querySelector(".pildora-filtro-flecha").style.display = puesta ? "none" : "";
    cerrarFz(fz);
  }

  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    // Repetir
    const rep = t.closest(".dz-repetir");
    if (rep) { e.preventDefault(); rep.closest(".dz").querySelectorAll(".dz-repite").forEach(reiniciar); return; }
    // 1 · sugerencias
    const fila = t.closest("[data-sg-fila]");
    if (fila) { const sg = fila.closest("[data-sg]"); activar(sg, fila); sumar(sg, fila); }
    const borrar = t.closest(".buscador-borrar");
    if (borrar) { const caja = borrar.closest(".buscador"); const input = caja.querySelector("input"); input.value = ""; caja.removeAttribute("data-con-texto"); const sg = caja.closest("[data-sg]"); if (sg) filtrar(sg, ""); input.focus(); }
    // 2 · conteo
    const paso = t.closest("[data-cf-paso]");
    if (paso) { const tr = paso.closest("tr"); const v = tr.querySelector("input").value; contar(tr, String(Math.max(0, (v === "" ? 0 : Number(v)) + Number(paso.dataset.cfPaso)))); }
    const completar = t.closest("[data-cf-completar]");
    if (completar) completar.closest("[data-cf]").querySelectorAll("[data-cf-fila]").forEach((tr) => { if (tr.querySelector("input").value === "") contar(tr, tr.dataset.debe); });
    // 3 · Frescura
    const abre = t.closest("[data-fz-abre]");
    const fzAqui = t.closest("[data-fz]");
    document.querySelectorAll("[data-fz]").forEach((fz) => { if (fz !== fzAqui) cerrarFz(fz); });
    if (abre) {
      const fz = abre.closest("[data-fz]"); const lista = fz.querySelector("[data-fz-lista]"); const abrir = lista.hidden;
      if (abrir) { lista.hidden = false; reiniciar(lista.firstElementChild); fz.querySelector("[data-fz-pildora]").setAttribute("data-abierta", ""); abre.setAttribute("aria-expanded", "true"); } else cerrarFz(fz);
    }
    const op = t.closest("[data-fz-op]");
    if (op) ponerFz(op.closest("[data-fz]"), op);
    const quitar = t.closest("[data-fz-quitar]");
    if (quitar) { const fz = quitar.closest("[data-fz]"); ponerFz(fz, fz.querySelector(`[data-fz-op][data-valor="${fz.dataset.todos}"]`)); }
    const hoy = t.closest("[data-fz-hoy]");
    if (hoy) { const lista = hoy.closest(".dz-ancla").querySelector("[data-fz-hoy-lista]"); lista.hidden = !lista.hidden; hoy.setAttribute("aria-expanded", String(!lista.hidden)); }
    else if (!t.closest("[data-fz-hoy-lista]")) document.querySelectorAll("[data-fz-hoy-lista]").forEach((l) => { l.hidden = true; });
    // 4 · desactivar color (dos toques, como hoy; no guarda)
    const dc = t.closest("[data-dc-desactivar]");
    if (dc) {
      const texto = dc.querySelector(".relative") ?? dc;
      if (dc.dataset.armado !== "1") { dc.dataset.armado = "1"; texto.textContent = "¿Seguro? Confirmar"; dc.classList.add("font-semibold"); }
      else { texto.textContent = "Desactivando…"; setTimeout(() => { texto.textContent = "Desactivar color"; dc.dataset.armado = ""; dc.classList.remove("font-semibold"); }, 1100); }
    }
    // 6 · acciones chicas
    const ac = t.closest("[data-ac]");
    if (ac) {
      if (ac.dataset.ac === "repartir") ac.closest(".ac-hoja").querySelectorAll("[data-ac-nums] span").forEach((s, i) => setTimeout(() => { s.textContent = "4"; s.classList.add("lleno"); }, i * 90));
      const fila = ac.parentElement;
      fila.querySelector(".ac-hecho")?.remove();
      const h = document.createElement("span"); h.className = "ac-hecho"; h.textContent = "✓ listo"; fila.append(h);
      setTimeout(() => h.remove(), 1600);
    }
  });

  document.addEventListener("mouseover", (e) => {
    const fila = e.target instanceof Element ? e.target.closest("[data-sg-fila]") : null;
    if (fila && !fila.classList.contains("activa")) activar(fila.closest("[data-sg]"), fila);
  });

  document.addEventListener("input", (e) => {
    const input = e.target;
    const sg = input.closest?.("[data-sg]");
    if (sg && input.closest(".buscador")) filtrar(sg, input.value);
    // El buscador de la lista de «Estado» (más de 8 opciones, ADR-0209): filtra sin tildes y esconde los grupos vacíos.
    const lista = input.closest?.(".fz-lista");
    if (lista) {
      const q = sinTildes(input.value.trim());
      lista.querySelectorAll("[data-fz-op]").forEach((o) => { o.hidden = !!q && !sinTildes(o.dataset.texto).includes(q); });
      lista.querySelectorAll('[role="group"]').forEach((g) => {
        const vacio = ![...g.querySelectorAll("[data-fz-op]")].some((o) => !o.hidden);
        g.hidden = vacio;
        const titulo = g.previousElementSibling;
        if (titulo?.matches(".fz-grupo-titulo, .fz-grupo-raya")) titulo.hidden = vacio;
      });
    }
  });

  document.addEventListener("keydown", (e) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement)) return;
    const sg = input.closest("[data-sg]");
    if (sg && input.closest(".buscador")) {
      const filas = filasDe(sg);
      const i = filas.findIndex((f) => f.classList.contains("activa"));
      if (e.key === "ArrowDown") { e.preventDefault(); activar(sg, filas[Math.min(filas.length - 1, i + 1)]); }
      if (e.key === "ArrowUp") { e.preventDefault(); activar(sg, filas[Math.max(0, i - 1)]); }
      if (e.key === "Enter") { e.preventDefault(); sumar(sg, filas[i]); }
      if (e.key === "Escape") { e.preventDefault(); input.value = ""; filtrar(sg, ""); }
    }
    const tr = input.closest("[data-cf-fila]");
    if (tr && e.key === "Enter") { e.preventDefault(); contar(tr, input.value); const sig = tr.nextElementSibling?.querySelector("input"); sig?.focus(); }
  });
  document.addEventListener("change", (e) => { const tr = e.target.closest?.("[data-cf-fila]"); if (tr) contar(tr, e.target.value); });
})();
