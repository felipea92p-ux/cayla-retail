// Ronda 14 de /unificar: la guía y el globito de la línea, y el globito de las barras. Nada guarda.
(() => {
  document.addEventListener("pointermove", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    // La línea: la guía salta al punto más cercano y el globito dice la hora o el día con sus cifras.
    document.querySelectorAll("[data-r14-linea]").forEach((caja) => {
      const svg = caja.querySelector("svg");
      const guia = caja.querySelector(".r14-guia"), pa = caja.querySelector(".r14-gpa"), pb = caja.querySelector(".r14-gpb"), globo = caja.querySelector(".r14-globo");
      if (!svg || !guia) return;
      const r = svg.getBoundingClientRect();
      const dentro = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!dentro) { [guia, pa, pb, globo].forEach((n) => n && (n.hidden = true)); return; }
      const escala = svg.viewBox.baseVal.width / r.width;
      const xv = (e.clientX - r.left) * escala;
      const xs = caja.dataset.xs.split(",").map(Number), ya = caja.dataset.ya.split(",").map(Number), yb = caja.dataset.yb ? caja.dataset.yb.split(",").map(Number) : null;
      let i = 0;
      xs.forEach((x, k) => { if (Math.abs(x - xv) < Math.abs(xs[i] - xv)) i = k; });
      guia.setAttribute("x1", xs[i]); guia.setAttribute("x2", xs[i]); guia.hidden = false;
      pa.setAttribute("cx", xs[i]); pa.setAttribute("cy", ya[i]); pa.hidden = false;
      if (yb && pb) { pb.setAttribute("cx", xs[i]); pb.setAttribute("cy", yb[i]); pb.hidden = false; }
      globo.textContent = caja.dataset.tips.split("|")[i];
      globo.style.left = `${xs[i] / escala}px`;
      globo.style.top = `${Number(caja.dataset.arr) / escala}px`;
      globo.hidden = false;
    });
    // Las barras: el globito sobre la barra apuntada.
    document.querySelectorAll("[data-r14-barras]").forEach((caja) => {
      const globo = caja.querySelector(".r14-globo");
      const b = t?.closest(".r14-b");
      if (!b || !caja.contains(b)) { globo.hidden = true; return; }
      const rc = caja.getBoundingClientRect(), rb = b.getBoundingClientRect(), bi = b.querySelector("i").getBoundingClientRect();
      globo.textContent = b.dataset.tip;
      globo.style.left = `${rb.left - rc.left + rb.width / 2}px`;
      globo.style.top = `${bi.top - rc.top}px`;
      globo.hidden = false;
    });
  });
})();
