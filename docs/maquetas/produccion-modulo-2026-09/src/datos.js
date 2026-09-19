/* ====================================================================
   Datos de ejemplo + derivados. Regla del ERP que aquí se respeta:
   nada derivado se guarda. Saldo de lote = ingresado − consumos;
   costo de una orden = suma de sus consumos + maquila; lo pendiente de
   pago o de recepción se calcula desde los comprobantes.
   ==================================================================== */
const HOY = '2026-09-19';
const ETAPAS = [
  {k:'corte', t:'Corte', d:3, txt:'Tender la tela y cortar las piezas.'},
  {k:'confeccion', t:'Confección', d:8, txt:'Costura, ojal y botón.'},
  {k:'acabado', t:'Acabados', d:2, txt:'Planchado, calidad, etiqueta y empaque.'},
];
const COLS = [{k:'corte',t:'Por cortar'},{k:'confeccion',t:'En confección'},{k:'acabado',t:'En acabados'},{k:'listo',t:'Listas para cerrar'}];
const UMBRAL_GANA = .6, UMBRAL_FILO = .4;
const SEM_OBJ = 8, SEM_LEAD = 3;          // semanas de cobertura objetivo y de espera de una corrida
const TALLAS = ['S','M','L','XL'];

// Modelos: precio, tela, rendimiento estándar (m/prenda), avíos por prenda, reparto por color,
// ventas de los últimos 60 días por talla (todas las tiendas), stock por talla (tiendas + almacén),
// costo real absorbido por prenda (últimos cierres) y cotización de maquila externa (D-31).
const MODELOS = [
  {id:'aruma', n:'Blusa Aruma', cat:'Blusas', precio:189, tela:'lino', rend:.95, avios:{boton:2,etiqueta:1}, colores:{Crudo:.6,Terracota:.4},
    v60:{S:22,M:41,L:30,XL:9}, st:{S:14,M:11,L:12,XL:10}, maq:10, refMaq:14, real:{rend:1.02,seg:.06}},
  {id:'tara', n:'Vestido Tara', cat:'Vestidos', precio:289, tela:'lino', rend:2.2, avios:{cierre:1,etiqueta:1}, colores:{Oliva:.5,Crudo:.5},
    v60:{S:12,M:26,L:20,XL:6}, st:{S:9,M:4,L:8,XL:7}, maq:20, refMaq:15.5, real:{rend:2.25,seg:.04}},
  {id:'sol', n:'Pantalón Sol', cat:'Pantalones', precio:219, tela:'lino', rend:1.9, avios:{boton:1,cierre:1,etiqueta:1}, colores:{Arena:.6,Negro:.4},
    v60:{S:15,M:34,L:28,XL:11}, st:{S:6,M:9,L:10,XL:8}, maq:16, refMaq:16.5, real:{rend:1.93,seg:.05}},
  {id:'nube', n:'Camisa Nube', cat:'Camisas', precio:179, tela:'popelina', rend:1.6, avios:{boton:5,etiqueta:1}, colores:{Blanco:.7,Celeste:.3},
    v60:{S:18,M:29,L:19,XL:7}, st:{S:12,M:15,L:9,XL:6}, maq:8.9, refMaq:12, real:{rend:1.62,seg:.03}},
  {id:'brisa', n:'Falda Brisa', cat:'Faldas', precio:159, tela:'lino', rend:1.1, avios:{cierre:1,etiqueta:1}, colores:{Crudo:.5,Negro:.5},
    v60:{S:10,M:19,L:14,XL:5}, st:{S:8,M:7,L:6,XL:4}, maq:7, refMaq:9.5, real:{rend:1.12,seg:.04}},
  {id:'kuntur', n:'Short Kuntur', cat:'Shorts', precio:129, tela:'popelina', rend:.8, avios:{etiqueta:1,boton:1}, colores:{Negro:.5,Arena:.5},
    v60:{S:8,M:18,L:15,XL:6}, st:{S:1,M:2,L:2,XL:1}, maq:6, refMaq:7.5, real:{rend:.82,seg:.03}},
  {id:'yaku', n:'Blazer Yaku', cat:'Blazers', precio:349, tela:'lino', rend:1.6, avios:{boton:3,etiqueta:1}, colores:{Negro:.7,Camel:.3},
    v60:{S:3,M:9,L:8,XL:2}, st:{S:20,M:28,L:25,XL:15}, maq:22, refMaq:20, real:{rend:1.66,seg:.05}},
];
const MERMA = {lino:.06, popelina:.05, forro:.05};

function datosIniciales(){ return {
  seq:0,
  provs:[
    {n:'Textiles Gamarra', rubro:'Tela', plazo:30, puntual:96, dias:3, serie:[17.9,18.0,18.2,18.3,18.5,18.5]},
    {n:'Lino Andino SAC', rubro:'Tela', plazo:15, puntual:82, dias:6, serie:[18.4,18.6,19.0,19.4,19.8,19.8]},
    {n:'Avíos Gamarra', rubro:'Avíos', plazo:0, puntual:98, dias:2, serie:[.33,.34,.34,.35,.35,.35]},
    {n:'Etiquetas Perú', rubro:'Avíos', plazo:30, puntual:91, dias:5, serie:[.27,.27,.28,.28,.28,.28]},
    {n:'Confecciones Rosales', rubro:'Maquila', plazo:15, puntual:74, dias:9, serie:null},
    {n:'Moda Andina', rubro:'Prenda terminada', plazo:30, puntual:88, dias:7, serie:null},
  ],
  insumos:[
    {id:'lino', nombre:'Lino lavado crudo', tipo:'tela', u:'m', min:60, lotes:[
      {id:'L-0902', prov:'Textiles Gamarra', ingreso:'2026-09-02', cant:120, costo:18.5, doc:'F001-2210'},
      {id:'L-0916', prov:'Lino Andino SAC', ingreso:'2026-09-16', cant:80, costo:19.8, doc:'F004-0871'}]},
    {id:'popelina', nombre:'Popelina de algodón', tipo:'tela', u:'m', min:40, lotes:[
      {id:'P-0905', prov:'Textiles Gamarra', ingreso:'2026-09-05', cant:140, costo:12.4, doc:'F001-2231'}]},
    {id:'forro', nombre:'Forro de viscosa', tipo:'tela', u:'m', min:30, lotes:[
      {id:'V-0911', prov:'Lino Andino SAC', ingreso:'2026-09-11', cant:22, costo:9.9, doc:'F004-0850'}]},
    {id:'boton', nombre:'Botón nácar 15 mm', tipo:'avio', u:'unid.', min:150, lotes:[
      {id:'B-0821', prov:'Avíos Gamarra', ingreso:'2026-08-21', cant:400, costo:.35, doc:'B003-0412'}]},
    {id:'cierre', nombre:'Cierre invisible 55 cm', tipo:'avio', u:'unid.', min:40, lotes:[
      {id:'C-0810', prov:'Avíos Gamarra', ingreso:'2026-08-10', cant:60, costo:3.2, doc:'B003-0398'}]},
    {id:'etiqueta', nombre:'Etiqueta tejida CAYLA', tipo:'avio', u:'unid.', min:100, lotes:[
      {id:'E-0801', prov:'Etiquetas Perú', ingreso:'2026-08-01', cant:500, costo:.28, doc:'F002-1187'}]},
  ],
  ordenes:[
    {id:'o1', modelo:'aruma', entrega:'2026-09-24', maquila:480, plan0:48, etapas:{corte:'hecho',confeccion:'terc',acabado:'pendiente'}},
    {id:'o2', modelo:'tara', entrega:'2026-09-21', maquila:600, plan0:30, etapas:{corte:'hecho',confeccion:'hecho',acabado:'pendiente'}},
    {id:'o3', modelo:'sol', entrega:'2026-09-18', maquila:0, plan0:40, etapas:{corte:'pendiente',confeccion:'pendiente',acabado:'pendiente'}},
    {id:'o4', modelo:'nube', entrega:'2026-09-26', maquila:320, plan0:36, etapas:{corte:'hecho',confeccion:'hecho',acabado:'hecho'}},
    {id:'o5', modelo:'brisa', entrega:'2026-10-02', maquila:0, plan0:24, etapas:{corte:'pendiente',confeccion:'pendiente',acabado:'pendiente'}},
  ],
  cerradas:[{id:'o0', modelo:'nube', ref:'Chaleco Ñusta', entrega:'2026-09-05', maquila:300, plan0:20, buenas:20, cerrada:'2026-09-05', etapas:{corte:'hecho',confeccion:'hecho',acabado:'hecho'}, lineas:{'Único|U':20}}],
  consumos:[
    {id:'m1', orden:'o1', insumo:'lino', lote:'L-0902', qty:41, fecha:'2026-09-15'},
    {id:'m2', orden:'o1', insumo:'boton', lote:'B-0821', qty:96, fecha:'2026-09-15'},
    {id:'m3', orden:'o2', insumo:'lino', lote:'L-0902', qty:66, fecha:'2026-09-12'},
    {id:'m4', orden:'o2', insumo:'cierre', lote:'C-0810', qty:30, fecha:'2026-09-12'},
    {id:'m5', orden:'o4', insumo:'popelina', lote:'P-0905', qty:58, fecha:'2026-09-08'},
    {id:'m6', orden:'o4', insumo:'boton', lote:'B-0821', qty:180, fecha:'2026-09-08'},
    {id:'m7', orden:'o4', insumo:'etiqueta', lote:'E-0801', qty:36, fecha:'2026-09-08'},
    {id:'m8', orden:'o0', insumo:'popelina', lote:'P-0905', qty:30, fecha:'2026-09-03'},
    {id:'m9', orden:'o0', insumo:'boton', lote:'B-0821', qty:60, fecha:'2026-09-03'},
  ],
  // Comprobantes de compra (la factura del proveedor es el eje: de ella cuelgan recepción y pago)
  comps:[
    {id:'c1', prov:'Textiles Gamarra', doc:'F001-2210', fecha:'2026-09-02', dest:'taller', vence:'2026-10-02', pagado:0, recibido:true, lineas:[{k:'ins',ins:'lino',qty:120,costo:18.5}]},
    {id:'c2', prov:'Lino Andino SAC', doc:'F004-0871', fecha:'2026-09-16', dest:'taller', vence:'2026-10-01', pagado:0, recibido:true, lineas:[{k:'ins',ins:'lino',qty:80,costo:19.8}]},
    {id:'c3', prov:'Textiles Gamarra', doc:'F001-2231', fecha:'2026-09-05', dest:'taller', vence:'2026-10-05', pagado:0, recibido:true, lineas:[{k:'ins',ins:'popelina',qty:140,costo:12.4}]},
    {id:'c4', prov:'Lino Andino SAC', doc:'F004-0850', fecha:'2026-09-05', dest:'taller', vence:'2026-09-20', pagado:0, recibido:true, lineas:[{k:'ins',ins:'forro',qty:22,costo:9.9}]},
    {id:'c5', prov:'Avíos Gamarra', doc:'B003-0412', fecha:'2026-08-21', dest:'taller', vence:null, pagado:140, recibido:true, lineas:[{k:'ins',ins:'boton',qty:400,costo:.35}]},
    {id:'c6', prov:'Avíos Gamarra', doc:'B003-0398', fecha:'2026-08-10', dest:'taller', vence:null, pagado:192, recibido:true, lineas:[{k:'ins',ins:'cierre',qty:60,costo:3.2}]},
    {id:'c7', prov:'Etiquetas Perú', doc:'F002-1187', fecha:'2026-08-01', dest:'taller', vence:'2026-08-31', pagado:0, recibido:true, lineas:[{k:'ins',ins:'etiqueta',qty:500,costo:.28}]},
    {id:'c8', prov:'Confecciones Rosales', doc:'F003-0210', fecha:'2026-09-10', dest:'taller', vence:'2026-09-25', pagado:0, recibido:true, lineas:[{k:'srv',desc:'Confección Blusa Aruma (48 prendas)',total:480}]},
    {id:'c9', prov:'Moda Andina', doc:'F005-0644', fecha:'2026-09-15', dest:'tiendas', vence:'2026-10-15', pagado:0, recibido:false, lineas:[{k:'prenda',desc:'Chompas y cardigans',qty:60,costo:42}]},
    {id:'c10', prov:'Lino Andino SAC', doc:'F004-0905', fecha:'2026-09-18', dest:'taller', vence:'2026-10-03', pagado:0, recibido:false, lineas:[{k:'ins',ins:'lino',qty:100,costo:19.8}]},
  ],
  stockTaller:0,
}}

/* ---------- utilidades ---------- */
let D = datosIniciales();
const $ = s => document.querySelector(s);
const sum = a => a.reduce((x,y)=>x+y,0);
const S = n => 'S/ ' + Number(n).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
const S0 = n => 'S/ ' + Number(n).toLocaleString('es-PE',{minimumFractionDigits:0,maximumFractionDigits:0});
const N = (n,d=0) => Number(n).toLocaleString('es-PE',{minimumFractionDigits:d,maximumFractionDigits:d});
const fechaCorta = iso => new Date(iso+'T12:00:00').toLocaleDateString('es-PE',{day:'numeric',month:'short'}).replace('.','');
const dias = iso => Math.round((new Date(iso+'T12:00:00') - new Date(HOY+'T12:00:00'))/864e5);
const sumaDias = (iso,n) => { const d=new Date(iso+'T12:00:00'); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
function repartir(total,w){ const s=sum(w)||1, raw=w.map(x=>total*x/s), base=raw.map(Math.floor); let r=total-sum(base);
  raw.map((v,i)=>[v-base[i],i]).sort((a,b)=>b[0]-a[0]).slice(0,r).forEach(([,i])=>base[i]++); return base; }

/* ---------- catálogo e insumos ---------- */
const modelo = id => MODELOS.find(m=>m.id===id);
const insumo = id => D.insumos.find(i=>i.id===id);
const prov = n => D.provs.find(p=>p.n===n);
const orden = id => D.ordenes.find(o=>o.id===id) || D.cerradas.find(o=>o.id===id);
const nombreOrden = o => o.ref || modelo(o.modelo).n;
const planDe = o => o.lineas ? sum(Object.values(o.lineas)) : o.plan0;
const consumidoLote = (iid,lid) => D.consumos.filter(c=>c.insumo===iid&&c.lote===lid).reduce((a,c)=>a+c.qty,0);
const saldoLote = (i,l) => l.cant - consumidoLote(i.id,l.id);
const saldo = i => sum(i.lotes.map(l=>saldoLote(i,l)));
const loteActivo = i => [...i.lotes].sort((a,b)=>a.ingreso.localeCompare(b.ingreso)).find(l=>saldoLote(i,l)>0);
const loteDe = c => insumo(c.insumo).lotes.find(l=>l.id===c.lote);
const costoC = c => c.qty * loteDe(c).costo;
const totalComp = c => sum(c.lineas.map(l=>l.total!=null?l.total:l.qty*l.costo));
const enCamino = iid => sum(D.comps.filter(c=>!c.recibido).flatMap(c=>c.lineas).filter(l=>l.ins===iid).map(l=>l.qty));
const consumoSem = i => sum(D.consumos.filter(c=>c.insumo===i.id).map(c=>c.qty)) / (19/7);
const estadoIns = i => { const s=saldo(i); return s<=0?{t:'Sin saldo',c:'rojo'}: s<i.min?{t:'Bajo mínimo',c:'ambar'}:{t:'Bien',c:'verde'}; };
const precioRef = iid => { const l=loteActivo(insumo(iid)) || insumo(iid).lotes.slice(-1)[0]; return l.costo; };

/* ---------- órdenes ---------- */
function costos(o, extra){
  const cs = D.consumos.filter(c=>c.orden===o.id);
  let tela=0, avio=0;
  cs.forEach(c=>{ const v=costoC(c); insumo(c.insumo).tipo==='tela'?tela+=v:avio+=v; });
  if(extra){ extra.tipo==='tela'?tela+=extra.v:avio+=extra.v; }
  const n = o.buenas || planDe(o), total = tela+avio+o.maquila;
  return {tela,avio,maq:o.maquila,total,cpp:total/n};
}
const margen = (precio,cpp) => (precio<=0||cpp<=0)?null:(precio-cpp)/precio;
const semaforo = m => m==null?null: m>=UMBRAL_GANA?{c:'verde',t:'Gana'}: m>=UMBRAL_FILO?{c:'ambar',t:'Al filo'}:{c:'rojo',t:'Pierde'};
const etapaActual = o => { const e=ETAPAS.find(e=>o.etapas[e.k]!=='hecho'); return e?e.k:'listo'; };
function riesgo(o){
  const rest = sum(ETAPAS.filter(e=>o.etapas[e.k]!=='hecho').map(e=>e.d + (o.etapas[e.k]==='terc'?2:0)));
  const d = dias(o.entrega), tarde = rest - d;
  return {rest, d, tarde, vencida: d<0 && rest>0, filo: rest>0 && tarde===0 || (tarde<0 && tarde>=-1 && rest>0)};
}
function demandaTela(){   // metros de cada tela que piden las órdenes que aún no se cortan
  const dem = {};
  D.ordenes.filter(o=>o.etapas.corte!=='hecho').forEach(o=>{ const m=modelo(o.modelo);
    dem[m.tela] = (dem[m.tela]||0) + planDe(o)*m.rend*(1+(MERMA[m.tela]||0)); });
  return dem;
}

/* ---------- decisión de qué producir ---------- */
const ventasSem = m => sum(Object.values(m.v60))/8.57;
const stockTot = m => sum(Object.values(m.st));
const enProd = m => sum(D.ordenes.filter(o=>o.modelo===m.id).map(planDe));
function estadoModelo(m){
  const vs=ventasSem(m), c=stockTot(m)/vs, cp=(stockTot(m)+enProd(m))/vs;
  if(enProd(m)===0 && c<SEM_LEAD) return {t:'Producir ya',c:'rojo',o:0,c1:c,cp};
  if(cp<4) return {t:'Producir más',c:'ambar',o:1,c1:c,cp};
  if(cp>16) return {t:'Sobrestock',c:'ambar',o:3,c1:c,cp};
  return {t:'Cubierto',c:'verde',o:2,c1:c,cp};
}
function curva(m){   // pesos por talla: lo que se vende en 8 semanas menos lo que ya hay
  const need = {}; TALLAS.forEach(t=>need[t]=Math.max(0, m.v60[t]/8.57*SEM_OBJ - m.st[t]));
  const tot = sum(Object.values(need));
  const w = tot>0 ? need : m.v60;
  return {w, sugerido: Math.max(0, Math.round((tot - enProd(m))/6)*6), need};
}
function distribuir(m,total,w){
  const perT = repartir(total, TALLAS.map(t=>w[t])), out={};
  TALLAS.forEach((t,i)=>{ const cols=Object.keys(m.colores), perC=repartir(perT[i], cols.map(c=>m.colores[c]));
    cols.forEach((c,j)=>out[c+'|'+t]=perC[j]); });
  return out;
}
// Órdenes iniciales: sus líneas salen de la misma curva de ventas
D.ordenes.forEach(o=>{ const m=modelo(o.modelo); o.lineas = distribuir(m,o.plan0,m.v60); });

/* ---------- eficiencia del Taller (D-31) ---------- */
const FIJOS_MES = 3800;       // dato nuevo: sueldos fijos del Taller + servicios (hoy no se registran)
function eficienciaMes(){
  const cerr = D.cerradas.filter(o=>o.cerrada && o.cerrada.startsWith('2026-09'));
  const absorbido = sum(cerr.map(o=>costos(o).total));
  const proceso = sum(D.ordenes.map(o=>{ const c=costos(o); return c.tela+c.avio+ (o.etapas.confeccion==='hecho'||o.etapas.confeccion==='terc'? o.maquila:0); }));
  const gasto = absorbido + proceso + FIJOS_MES;
  return {absorbido, proceso, fijos:FIJOS_MES, gasto, ef:(absorbido+proceso)/gasto};
}
const HIST_MESES = [{m:'Abr',ef:.62,cpp:41.2},{m:'May',ef:.66,cpp:39.8},{m:'Jun',ef:.71,cpp:38.5},{m:'Jul',ef:.68,cpp:39.4},{m:'Ago',ef:.74,cpp:37.9}];
function comparaMaquila(m){
  const interno = m.rend*precioRef(m.tela) + sum(Object.entries(m.avios).map(([k,q])=>q*precioRef(k))) + m.maq;
  const externo = m.rend*precioRef(m.tela) + sum(Object.entries(m.avios).map(([k,q])=>q*precioRef(k))) + m.refMaq;
  const d = (interno-externo)/externo;
  return {interno, externo, d, v: d<=-.05?{t:'Conviene fabricar',c:'verde'}: d>=.05?{t:'Conviene maquilar',c:'ambar'}:{t:'Parejo',c:'neutro'}};
}
