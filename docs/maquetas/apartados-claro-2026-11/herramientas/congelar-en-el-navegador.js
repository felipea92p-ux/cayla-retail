// HERRAMIENTA DE LA MAQUETA — se pega en la consola del navegador (o en `javascript_tool`) con la página de prueba abierta.
// Deja en `window.__mq` lo necesario para llevar la pantalla a un estado y «congelarlo»: manda su HTML a la base de mentira,
// que lo escribe en herramientas/congelado/hoy-<nombre>.html. Después se copia a la carpeta de la maqueta sin el prefijo `hoy-`
// y se le agrega `<script src="maqueta.js"></script>` antes de `</body>`.
// Ejemplo:   await __mq.clic(/^Entregar/, '[role=tab]'); await __mq.clic(/Carmen Huamán/); await __mq.congelar('entregar-elegido')
// Ojo: el texto de un botón puede venir pegado («ApartarS/219.80») o traer oculto su «Guardando…»: usar /^Apartar\s*S\// y prefijos.
window.__mq = {
  log: [],
  espera: (ms) => new Promise((r) => setTimeout(r, ms)),
  nombre: (b) => ((b.getAttribute("aria-label") || "") + " " + (b.textContent || "")).replace(/\s+/g, " ").trim(),
  el(re, sel = "button,[role=tab],[role=option],[role=radio],[role=checkbox]", raiz = document) {
    return [...raiz.querySelectorAll(sel)].filter((b) => b.getBoundingClientRect().width > 0).find((b) => re.test(this.nombre(b)));
  },
  async clic(re, sel) {
    const e = this.el(re, sel);
    if (!e) { this.log.push("NO " + re); return false; }
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup"]) e.dispatchEvent(new (t.startsWith("pointer") ? PointerEvent : MouseEvent)(t, { bubbles: true, cancelable: true, button: 0, pointerType: "mouse" }));
    e.click();
    await this.espera(700);
    return true;
  },
  /** Un campo por su aria-label, su placeholder o su etiqueta. Los de la hoja de cobro: / Nombres$/, / Apellidos$/, /Celular/, /8 dígitos/. */
  campo(re) {
    return [...document.querySelectorAll("input,textarea")].filter((i) => i.getBoundingClientRect().width > 0).find((i) => re.test((i.getAttribute("aria-label") || "") + " " + (i.placeholder || "") + " " + (i.labels?.[0]?.textContent || "")));
  },
  /** Escribe en un campo de React (el valor se pone con el setter nativo y se avisa con `input`). */
  async escribe(re, v) {
    const el = this.campo(re);
    if (!el) { this.log.push("NO campo " + re); return null; }
    const d = Object.getOwnPropertyDescriptor(el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value");
    el.focus(); d.set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    await this.espera(500);
    return el;
  },
  tecla(el, key) { el.dispatchEvent(new KeyboardEvent("keydown", { key, code: key, bubbles: true, cancelable: true })); },
  /** Guarda la pantalla tal como está: sin scripts, con los valores escritos como atributos y con `erp.css` como única hoja. */
  async congelar(n) {
    await this.espera(1200);
    document.querySelectorAll("input, textarea").forEach((i) => { if (i.type === "checkbox" || i.type === "radio") { if (i.checked) i.setAttribute("checked", ""); else i.removeAttribute("checked"); } else i.setAttribute("value", i.value); });
    const d = document.documentElement.cloneNode(true);
    d.querySelectorAll("script, nextjs-portal, link[rel=preload], link[rel=stylesheet], style, link[rel=modulepreload], next-route-announcer, template").forEach((x) => x.remove());
    d.querySelectorAll("a[href]").forEach((a) => a.setAttribute("href", "#"));
    const html = "<!doctype html>\n" + d.outerHTML.replace("</head>", '<link rel="stylesheet" href="erp.css"></head>');
    const r = await fetch("http://127.0.0.1:3084/guardar/hoy-" + n, { method: "POST", body: html, headers: { "x-espera": "no" } }).then((x) => x.json()).catch((e) => ({ error: String(e) }));
    this.log.push(JSON.stringify(r));
    return r;
  },
  /** El CSS ya compilado de la pantalla (para rehacer `erp.css`): pegar el resultado en un archivo y cambiar `../media/` por `fuentes/`. */
  css: () => [...document.styleSheets].map((s) => { try { return [...s.cssRules].map((r) => r.cssText).join("\n"); } catch { return ""; } }).join("\n"),
};
"listo: window.__mq";
