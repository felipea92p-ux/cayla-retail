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
    if (ctl==='rol'){ E.rol = v; E.seleccion.clear(); E.ver = v==='lider' ? E.sedeActiva : 'TRU'; if (!puedeVer(E.ruta)) E.ruta = 'gastos'; }
    if (ctl==='fuentes') E.fuentes = v==='si';
    if (ctl==='tema') document.documentElement.dataset.theme = v;
    render(); return;
  }
  if (e.target.closest('#reiniciar')){ location.hash=''; location.reload(); return; }
  const a = e.target.closest('[data-accion]');
  if (!a) return;
  const id = a.dataset.id;
  ({
    'nuevo-gasto': modalGasto, 'cfg-cuenta': modalCuenta, 'nuevo-activo': modalActivo, 'ver-gasto': () => modalVerGasto(id),
    'clasificar': () => modalClasificar(id), 'nuevo-mov': a => modalMovimiento(a), 'pagar': modalPagar,
    'conciliar': () => { const v = parseFloat(($('#b-'+id).value||'').replace(/,/g,'')); if (isNaN(v)) return; E.conciliado[id] = v; render(); avisar(v===cuenta(id).saldo?'Coincide con el banco.':'Hay una diferencia: revisa los movimientos sin pareja.'); },
    ...(typeof ACCIONES_EXTRA === 'object' ? ACCIONES_EXTRA : {}),
  }[a.dataset.accion] || (()=>{}))(a);
});
document.addEventListener('change', e => {
  const s = e.target.closest('[data-sel]');
  if (s){ s.checked ? E.seleccion.add(s.dataset.sel) : E.seleccion.delete(s.dataset.sel); render(); return; }
  if (e.target.id === 'irMovil') ir(e.target.value);
  const m = e.target.closest('[data-cambia]');
  if (m){
    const k = m.dataset.cambia; E[k] = m.type==='checkbox' ? m.checked : m.value;
    // Cambiar la sede de la cabecera = cambiar dónde trabajas: el filtro de la pantalla la sigue (ADR-0149: con loader).
    if (k === 'sedeActiva'){ E.ver = m.value; guardar(`Ahora trabajas en ${nombreUnidad(m.value)}.`); return; }
    render(); return;
  }
  const esc_ = e.target.closest('[data-esc]');
  if (esc_){ E.escenario[esc_.dataset.esc] = +esc_.value; render(); return; }
  const chk = e.target.closest('[data-esc-check]');
  if (chk){ E.escenario[chk.dataset.escCheck] = chk.checked; render(); return; }
  const cfg = e.target.closest('[data-cfg]');
  if (cfg){ const v = parseFloat(cfg.value.replace(/[^0-9.]/g,'')); if (!isNaN(v)){ CONFIG[cfg.dataset.cfg] = v; avisar('Guardado. Todas las pantallas ya usan el valor nuevo.'); } return; }
  const emp = e.target.closest('[data-cfg-emp]');
  if (emp){ CONFIG.empresa[emp.dataset.cfgEmp] = emp.value; avisar('Guardado.'); return; }
  const pp = e.target.closest('[data-ppto]');
  if (pp){ const r = pp.dataset.ppto.split('|'), v = parseFloat(pp.value.replace(/[^0-9.]/g,'')) || null;
    if (r[0]==='ventas') PRESUPUESTO.ventas[r[1]] = v; else { PRESUPUESTO.gastos[r[1]][r[2]] = v; if (v==null) delete PRESUPUESTO.gastos[r[1]][r[2]]; }
    avisar('Presupuesto guardado.'); return; }
  const tc = e.target.closest('[data-tc]');
  if (tc){ const [u,k] = tc.dataset.tc.split('|'), v = parseFloat(tc.value.replace(/[^0-9.]/g,'')); if (isNaN(v)) return;
    if (k==='fondo') TIENDAS_CAJA[u].fondo = v; else TIENDAS_CAJA[u].metas[+k] = v;
    render(); avisar(k==='fondo' ? `Fondo de ${nombreUnidad(u)}: ${S(v)}.` : `Meta del ${DIAS_L[+k]} de ${nombreUnidad(u)}: ${S(v)}. La meta del mes se recalculó.`); return; }
  const md = e.target.closest('[data-medio]');
  if (md){ const [u,k] = md.dataset.medio.split('|'); MEDIOS.find(x=>x.u===u)[k] = md.value; avisar(`Desde hoy, ${k} de ${nombreUnidad(u)} entra a ${cuenta(md.value).n}.`); return; }
});
// Mientras se arrastra un deslizador, solo cambia su número; al soltar, se recalcula todo.
document.addEventListener('input', e => { const r = e.target.closest('[data-esc]'); if (!r) return;
  const b = r.previousElementSibling?.querySelector('b'); if (!b) return; const k = r.dataset.esc, v = +r.value;
  b.textContent = k==='alqLIM' ? S(v) : (v>0?'+':'')+v+' %'; });
// #ruta o #ruta:pestaña
function leerHash(){ const [r, t] = location.hash.slice(1).split(':'); if (!MENU.some(m=>m.r===r)) return false; E.ruta = r; if (t) E.tab[r] = t; return true; }
window.addEventListener('hashchange', () => { if (leerHash()) render(); });
leerHash(); render();
