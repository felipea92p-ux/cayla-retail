// ============ Acciones: un solo escuchador para toda la demo ============
document.addEventListener('click', e => {
  const irA = e.target.closest('[data-ir]');
  if (irA){ e.preventDefault(); const [r, t] = irA.dataset.ir.split(':'); if (t) E.tab[r] = t; ir(r); return; }
  const tab = e.target.closest('[data-tab]');
  if (tab){ const [r, t] = tab.dataset.tab.split(':'); E.tab[r] = t; render(); return; }
  const seg = e.target.closest('.seg button');
  if (seg){
    const ctl = seg.parentElement.dataset.ctl, v = seg.dataset.v;
    seg.parentElement.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed', b===seg));
    if (ctl==='rol'){ E.rol = v; E.seleccion.clear(); if (!puedeVer(E.ruta)) E.ruta = 'gastos'; }
    if (ctl==='fuentes') E.fuentes = v==='si';
    if (ctl==='tema') document.documentElement.dataset.theme = v;
    render(); return;
  }
  if (e.target.closest('#reiniciar')){ location.hash=''; location.reload(); return; }
  const a = e.target.closest('[data-accion]');
  if (!a) return;
  const id = a.dataset.id;
  ({
    'nuevo-gasto': modalGasto, 'nuevo-activo': modalActivo, 'ver-gasto': () => modalVerGasto(id),
    'clasificar': () => modalClasificar(id), 'nuevo-mov': modalMovimiento, 'pagar': modalPagar,
    'conciliar': () => { const v = parseFloat(($('#b-'+id).value||'').replace(/,/g,'')); if (isNaN(v)) return; E.conciliado[id] = v; render(); avisar(v===cuenta(id).saldo?'Coincide con el banco.':'Hay una diferencia: revisa los movimientos sin pareja.'); },
    ...(typeof ACCIONES_EXTRA === 'object' ? ACCIONES_EXTRA : {}),
  }[a.dataset.accion] || (()=>{}))(a);
});
document.addEventListener('change', e => {
  const s = e.target.closest('[data-sel]');
  if (s){ s.checked ? E.seleccion.add(s.dataset.sel) : E.seleccion.delete(s.dataset.sel); render(); return; }
  if (e.target.id === 'irMovil') ir(e.target.value);
  const m = e.target.closest('[data-cambia]');
  if (m){ E[m.dataset.cambia] = m.type==='checkbox' ? m.checked : m.value; render(); }
});
// #ruta o #ruta:pestaña
function leerHash(){ const [r, t] = location.hash.slice(1).split(':'); if (!MENU.some(m=>m.r===r)) return false; E.ruta = r; if (t) E.tab[r] = t; return true; }
window.addEventListener('hashchange', () => { if (leerHash()) render(); });
leerHash(); render();
