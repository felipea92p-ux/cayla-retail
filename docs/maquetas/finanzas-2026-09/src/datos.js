// ============ Datos de ejemplo (nada se guarda). Hoy = jueves 24-sep-2026. ============
const HOY = '2026-09-24';
const UNIDADES = [
  {k:'TRU', n:'Tienda TRU', tipo:'tienda'},
  {k:'AQP', n:'Tienda AQP', tipo:'tienda'},
  {k:'LIM', n:'Tienda LIM', tipo:'tienda'},
  {k:'TAL', n:'Taller', tipo:'taller'},
  {k:'EMP', n:'De la empresa', tipo:'empresa'},
];
const nombreUnidad = k => (UNIDADES.find(u=>u.k===k)||{n:k}).n;

// Categorías cerradas, cada una con su cuenta contable (ADR-0117). Sin «Otros», a propósito.
const CATEGORIAS = [
  {c:'alquiler',      n:'Alquileres',             cta:'635'},
  {c:'servicios',     n:'Servicios básicos',      cta:'636', ej:'luz, agua, internet, software'},
  {c:'personal',      n:'Honorarios y personal',  cta:'62',  ej:'contador, asesorías'},
  {c:'transporte',    n:'Transporte',             cta:'631', ej:'envíos que no son de compra'},
  {c:'mantenimiento', n:'Mantenimiento',          cta:'634'},
  {c:'publicidad',    n:'Publicidad',             cta:'637'},
  {c:'suministros',   n:'Suministros',            cta:'656', ej:'bolsas, empaques, útiles'},
  {c:'comisiones',    n:'Comisiones del POS',     cta:'639', ej:'nueva: confirmar con el contador'},
];
const cat = c => CATEGORIAS.find(x=>x.c===c);

// Cuentas y dinero (§7 del plan). Yape y Plin NO son cuentas: son canales que caen en una cuenta de banco (ADR-0109).
const CUENTAS = [
  {id:'bcp',  n:'BCP · Cta. corriente',        tipo:'banco',   cta:'104', saldo:38420, conciliado:'2026-09-19', banco:38420,
   recibe:'Yape de TRU y AQP · transferencias'},
  {id:'ibk',  n:'Interbank · Cta. corriente',  tipo:'banco',   cta:'104', saldo:12880, conciliado:'2026-08-29', banco:null,
   recibe:'Plin de las 3 tiendas · Yape de LIM · abonos del POS'},
  {id:'pos',  n:'Niubiz · tarjeta por abonar', tipo:'transito',cta:'105', saldo:2310,  recibe:'Cobros con tarjeta hasta que el banco los abona'},
  {id:'cTRU', n:'Cajón · Tienda TRU',          tipo:'cajon',   cta:'101', saldo:1030, unidad:'TRU'},
  {id:'cAQP', n:'Cajón · Tienda AQP',          tipo:'cajon',   cta:'101', saldo:745,  unidad:'AQP'},
  {id:'cLIM', n:'Cajón · Tienda LIM',          tipo:'cajon',   cta:'101', saldo:495,  unidad:'LIM'},
  {id:'cTAL', n:'Fondo fijo · Taller',         tipo:'cajon',   cta:'101', saldo:630,  unidad:'TAL'},
  // v3: el cierre de caja ya manda plata a la caja fuerte o al líder: son lugares con plata, así que son cuentas.
  {id:'fTRU', n:'Caja fuerte · Tienda TRU',    tipo:'caja_fuerte', cta:'101', saldo:1800, unidad:'TRU'},
  {id:'fAQP', n:'Caja fuerte · Tienda AQP',    tipo:'caja_fuerte', cta:'101', saldo:1200, unidad:'AQP'},
  {id:'fLIM', n:'Caja fuerte · Tienda LIM',    tipo:'caja_fuerte', cta:'101', saldo:900,  unidad:'LIM'},
  {id:'rend', n:'Efectivo entregado al líder', tipo:'rendir',  cta:'101', saldo:0, recibe:'Lo que un cierre entrega al líder, hasta que lo deposita'},
  {id:'visa', n:'Visa BCP empresa (tarjeta de crédito)', tipo:'credito', cta:'—', saldo:-1850, recibe:'Lo que debes a la tarjeta. Se paga desde el BCP el día 5'},
];
const cuenta = id => CUENTAS.find(c=>c.id===id);

// A qué cuenta cae cada medio de cobro, por tienda. Así Vender no cambia.
const MEDIOS = [
  {u:'TRU', efectivo:'cTRU', yape:'bcp', plin:'ibk', tarjeta:'pos', transferencia:'bcp'},
  {u:'AQP', efectivo:'cAQP', yape:'bcp', plin:'ibk', tarjeta:'pos', transferencia:'bcp'},
  {u:'LIM', efectivo:'cLIM', yape:'ibk', plin:'ibk', tarjeta:'pos', transferencia:'bcp'},
];

const MOV_DINERO = [
  {f:'2026-09-23', tipo:'Depósito del cajón', de:'cAQP', a:'bcp', monto:3200, ref:'Voucher 004512', u:'AQP', por:'Lucía Mamani'},
  {f:'2026-09-22', tipo:'Abono de tarjeta',   de:'pos',  a:'ibk', monto:4180, ref:'Liquidación Niubiz 20-sep', comision:118, u:null, por:'Felipe Alvarez'},
  {f:'2026-09-22', tipo:'Depósito del cajón', de:'cTRU', a:'bcp', monto:2750, ref:'Voucher 118830', u:'TRU', por:'Rosa Quispe'},
  {f:'2026-09-19', tipo:'Entre cuentas',      de:'ibk',  a:'bcp', monto:8000, ref:'Para pagar a Confecciones Andina', u:null, por:'Felipe Alvarez'},
  {f:'2026-09-18', tipo:'Depósito del cajón', de:'cLIM', a:'bcp', monto:1900, ref:'Voucher 220017', u:'LIM', por:'Carla Ríos'},
  {f:'2026-09-15', tipo:'Retiro del dueño',   de:'bcp',  a:null,  monto:2500, ref:'Retiro personal', u:null, por:'Felipe Alvarez'},
];

// Gastos. comp: tipo de comprobante; si hay comprobante de proveedor, cuelga de la cabecera `compras` (naturaleza = gasto).
const GASTOS = [
  {id:1,  f:'2026-09-23', u:'TRU', c:'suministros',   d:'Bolsas kraft con logo (500)', prov:'Empaques del Norte', comp:'Factura', num:'F001-00231', total:354,  igv:54,  medio:'cTRU', cond:'contado', estado:'pagado'},
  {id:2,  f:'2026-09-22', u:'LIM', c:'alquiler',      d:'Alquiler de octubre',          prov:'Inmobiliaria San Isidro', comp:'Factura', num:'F003-01877', total:6200, igv:946, medio:null,  cond:'credito', vence:'2026-09-30', estado:'porpagar'},
  {id:3,  f:'2026-09-21', u:'EMP', c:'personal',      d:'Contabilidad de agosto',       prov:'Estudio contable Ríos', comp:'Recibo por honorarios', num:'E001-45', total:1200, igv:0, medio:'bcp', cond:'contado', estado:'pagado'},
  {id:4,  f:'2026-09-20', u:'AQP', c:'transporte',    d:'Envío de 2 cajas a AQP (Shalom)', prov:'Shalom', comp:'Boleta', num:'B012-88341', total:48, igv:0, medio:'cAQP', cond:'contado', estado:'pagado'},
  {id:5,  f:'2026-09-19', u:'TRU', c:'servicios',     d:'Luz de agosto',                prov:'Hidrandina', comp:'Factura', num:'S120-554120', total:612, igv:93, medio:null, cond:'credito', vence:'2026-09-28', estado:'porpagar'},
  {id:6,  f:'2026-09-18', u:'EMP', c:'publicidad',    d:'Campaña Instagram · septiembre', prov:'Meta Platforms', comp:'Factura', num:'FBADS-8812', total:1600, igv:0, medio:'bcp', cond:'contado', estado:'pagado'},
  {id:7,  f:'2026-09-17', u:'TAL', c:'mantenimiento', d:'Mantenimiento de la recta Juki', prov:'Técnico Hilos', comp:'Sin comprobante', num:'', total:120, igv:0, medio:'cTAL', cond:'contado', estado:'pagado'},
  {id:8,  f:'2026-09-16', u:'TRU', c:'transporte',    d:'Mototaxi al banco',            prov:'', comp:'Sin comprobante', num:'', total:6, igv:0, medio:'cTRU', cond:'contado', estado:'pagado'},
  {id:9,  f:'2026-09-15', u:'EMP', c:'servicios',     d:'Servidores y software (sept.)', prov:'Vercel / Supabase', comp:'Factura', num:'INV-2026-09', total:480, igv:0, medio:'bcp', cond:'contado', estado:'pagado'},
  {id:10, f:'2026-09-12', u:'AQP', c:'alquiler',      d:'Alquiler de septiembre',       prov:'Rentas Yanahuara', comp:'Factura', num:'F001-00904', total:3800, igv:580, medio:'bcp', cond:'contado', estado:'pagado'},
  {id:11, f:'2026-09-10', u:'TRU', c:'alquiler',      d:'Alquiler de septiembre',       prov:'Inversiones Primavera', comp:'Factura', num:'F002-00455', total:4500, igv:686, medio:'bcp', cond:'contado', estado:'pagado'},
  {id:12, f:'2026-09-08', u:'LIM', c:'suministros',   d:'Ganchos de exhibición (100)',  prov:'Bazar Central', comp:'Boleta', num:'B003-2210', total:95, igv:0, medio:'cLIM', cond:'contado', estado:'anulado', motivo:'Se registró dos veces'},
  {id:14, f:'2026-09-21', u:'AQP', c:'servicios',     d:'Luz de agosto',                prov:'SEAL', comp:'Factura', num:'S004-120981', total:662, igv:101, medio:'bcp', cond:'contado', estado:'pagado', raro:'38 % más alta que su promedio (S/ 480)'},
  {id:13, f:'2026-09-05', u:'TAL', c:'servicios',     d:'Luz del Taller (agosto)',      prov:'Luz del Sur', comp:'Factura', num:'S310-77120', total:710, igv:108, medio:'ibk', cond:'contado', estado:'pagado'},
];

const ACTIVOS = [
  {id:1, n:'Mostrador de roble',        u:'TRU', f:'2026-02-10', costo:3200,  vida:120, prov:'Muebles Roble', num:'F001-00088'},
  {id:2, n:'Mac mini (caja)',           u:'TRU', f:'2026-06-03', costo:2899,  vida:48,  prov:'iShop Perú', num:'F004-19002'},
  {id:3, n:'Impresora Zebra ZD230',     u:'AQP', f:'2026-05-18', costo:1150,  vida:60,  prov:'Etiquetas Perú', num:'F001-03311'},
  {id:4, n:'Remodelación del local',    u:'LIM', f:'2026-01-15', costo:18500, vida:120, prov:'Constructora Lince', num:'F001-00017'},
  {id:5, n:'Máquina recta Juki DDL-8700', u:'TAL', f:'2025-11-02', costo:2400, vida:60, prov:'Maquinarias Gamarra', num:'F002-00520'},
];

// Egresos de caja que alguien registró en el mostrador y todavía nadie clasificó (ADR-0117).
const EGRESOS = [
  {id:'e1', f:'2026-08-31', u:'LIM', motivo:'Depósito bancario', nota:'Voucher 219944', monto:2300, mes:'2026-08'},
  {id:'e2', f:'2026-09-21', u:'TRU', motivo:'Compra de insumos', nota:'cinta de embalaje', monto:10},
  {id:'e3', f:'2026-09-19', u:'AQP', motivo:'Otro', nota:'movilidad', monto:12},
  {id:'e4', f:'2026-09-17', u:'TRU', motivo:'Retiro de efectivo', nota:'', monto:150},
];

// Efectivo por tienda: hoy (caja abierta) — sale de fn_resumen_caja (ADR-0191).
const EFECTIVO = [
  {u:'TRU', caja:'abierta', abre:'09:02', por:'Rosa Quispe', apertura:200, ventas:846, ingresos:0,  egresos:16,  depositos:0, traslados:0},
  {u:'AQP', caja:'abierta', abre:'09:15', por:'Lucía Mamani', apertura:200, ventas:569, ingresos:0,  egresos:24,  depositos:0, traslados:0},
  {u:'LIM', caja:'abierta', abre:'10:04', por:'Carla Ríos',  apertura:150, ventas:345, ingresos:0,  egresos:0,   depositos:0, traslados:0},
];

// Por pagar consolidado: mercadería y gastos/activos (cabecera `compras`) + insumos (comprobantes_produccion, ADR-0133).
const POR_PAGAR = [
  {id:'p1', nat:'mercaderia', prov:'Confecciones Andina SAC', num:'F001-00812', u:'TRU', total:12400, pagado:6000, vence:'2026-09-22'},
  {id:'p2', nat:'gasto',      prov:'Hidrandina', num:'S120-554120', u:'TRU', total:612, pagado:0, vence:'2026-09-28'},
  {id:'p3', nat:'gasto',      prov:'Inmobiliaria San Isidro', num:'F003-01877', u:'LIM', total:6200, pagado:0, vence:'2026-09-30'},
  {id:'p4', nat:'mercaderia', prov:'Moda Lima EIRL', num:'F002-00118', u:'AQP', total:8950, pagado:0, vence:'2026-10-02'},
  {id:'p5', nat:'insumo',     prov:'Tejidos del Sur', num:'F005-00341', u:'TAL', total:4380, pagado:1000, vence:'2026-10-06'},
  {id:'p6', nat:'mercaderia', prov:'Distribuidora Norte', num:'F001-02290', u:'TRU', total:15300, pagado:0, vence:'2026-10-09'},
  {id:'p7', nat:'activo',     prov:'Muebles Roble', num:'F001-00131', u:'AQP', total:2600, pagado:1300, vence:'2026-10-15'},
  {id:'p8', nat:'mercaderia', prov:'Confecciones Andina SAC', num:'F001-00840', u:'LIM', total:20400, pagado:0, vence:'2026-10-20'},
];
const NATURALEZA = {mercaderia:'Mercadería', gasto:'Gasto', activo:'Activo fijo', insumo:'Insumo del Taller'};

// Estado de resultados de AGOSTO (mes cerrado). Septiembre se deriva «a la fecha» en marco.js.
const RESULTADOS_AGO = {
  ventas:      {TRU:44100, AQP:33600, LIM:19800, TAL:0,     EMP:0},
  costo:       {TRU:19850, AQP:15450, LIM:9300,  TAL:0,     EMP:0},
  flete:       {TRU:420,   AQP:610,   LIM:380,   TAL:0,     EMP:0},
  mermas:      {TRU:160,   AQP:90,    LIM:210,   TAL:0,     EMP:0},
  planilla:    {TRU:7800,  AQP:6400,  LIM:5200,  TAL:9600,  EMP:4500},
  alquiler:    {TRU:4500,  AQP:3800,  LIM:6200,  TAL:1800,  EMP:0},
  servicios:   {TRU:620,   AQP:480,   LIM:540,   TAL:710,   EMP:660},
  personal:    {TRU:0,     AQP:0,     LIM:0,     TAL:0,     EMP:1200},
  publicidad:  {TRU:0,     AQP:0,     LIM:0,     TAL:0,     EMP:3200},
  transporte:  {TRU:120,   AQP:90,    LIM:60,    TAL:140,   EMP:0},
  suministros: {TRU:380,   AQP:310,   LIM:240,   TAL:520,   EMP:90},
  mantenimiento:{TRU:0,    AQP:150,   LIM:0,     TAL:260,   EMP:0},
  depreciacion:{TRU:87,    AQP:19,    LIM:154,   TAL:40,    EMP:0},
  absorbido:   {TRU:0,     AQP:0,     LIM:0,     TAL:11900, EMP:0},
};

// Flujo: saldo disponible hoy y lo que viene, por semana.
const FLUJO_REAL = {
  entradas: [['Efectivo',38200],['Yape',19600],['Plin',11100],['Tarjeta',8300],['Transferencia',3400]],
  salidas:  [['Proveedores de mercadería',41300],['Planilla (Dynamic)',29800],['Gastos',18400],['Insumos del Taller',6200],['Retiro del dueño',2500]],
};
// Lo que entra sube en las semanas con campaña (su meta la dice cuánto): el flujo lee las campañas.
const FLUJO_SEMANAS = [
  {s:'28 sep – 4 oct', entra:24500, sale:58500, campana:'Aniversario CAYLA desde el 1', que:'Planilla S/ 29,800 · alquileres · Confecciones Andina'},
  {s:'5 – 11 oct',     entra:26000, sale:18900, campana:'Aniversario CAYLA', que:'Moda Lima · Tejidos del Sur · Distribuidora Norte (parte)'},
  {s:'12 – 18 oct',    entra:23000, sale:42000, campana:'Aniversario CAYLA hasta el 14', que:'Distribuidora Norte S/ 15,300 · reposición para el Aniversario S/ 6,300 · Muebles Roble · luz'},
  {s:'19 – 25 oct',    entra:22000, sale:9800,  que:'Confecciones Andina (LIM) parte · servicios'},
  {s:'26 oct – 1 nov', entra:22000, sale:31200, que:'Planilla · alquileres'},
  {s:'2 – 8 nov',      entra:22000, sale:14600, que:'Proveedores de temporada'},
];

// Balance al 31-ago (cerrado). Capital es una ENTRADA, nunca el residual (ADR-0109).
const BALANCE = {
  activo: [['101','Caja (cajones y fondo fijo)',5420],['104','Bancos',47900],['105','Tarjeta por abonar',2310],
           ['201','Mercaderías',186400],['211','Productos terminados del Taller',12600],['24','Insumos del Taller (tela, avíos)',8900],
           ['33','Muebles, equipos y remodelación',28149],['39','Depreciación acumulada',-1778]],
  pasivo: [['4011','IGV por pagar',6840],['4017','Impuesto a la renta',1900],['421','Facturas por pagar',64300],['41','Remuneraciones por pagar',0],['47','Préstamo del dueño (por devolver)',6000]],
  patrimonio: [['50','Capital',180000],['591','Utilidades acumuladas',27801],['','Utilidad de agosto',3060]],
};
const CONCILIACION = [
  {cta:'101 Caja', contra:'la suma de las cajas cerradas al 31-ago', a:5420, b:5420},
  {cta:'201 Mercaderías', contra:'stock × costo de cada prenda al 31-ago', a:186400, b:186400},
  {cta:'421 Facturas por pagar', contra:'saldo de cada factura de proveedor', a:64300, b:64300},
  {cta:'4011 IGV', contra:'comprobantes emitidos − facturas de proveedor', a:6840, b:6840},
];

// Impuestos
const IGV_MESES = [
  {m:'Abr', deb:14200, cred:9100}, {m:'May', deb:15900, cred:12300}, {m:'Jun', deb:16800, cred:10200},
  {m:'Jul', deb:18300, cred:13900}, {m:'Ago', deb:17550, cred:10710}, {m:'Sep*', deb:15200, cred:9800},
];
const UIT = 5500, VENTAS_12M = 1214000;

// Cierre de mes: estado por unidad
const CIERRE = {
  '2026-07': {TRU:{c:true, por:'Felipe Alvarez', f:'2026-08-04', hash:'a91f…3c0e'}, AQP:{c:true, por:'Felipe Alvarez', f:'2026-08-04', hash:'77b2…e901'},
              LIM:{c:true, por:'Felipe Alvarez', f:'2026-08-05', hash:'0c44…9ad2'}, TAL:{c:true, por:'Felipe Alvarez', f:'2026-08-05', hash:'5e10…b7f4'},
              EMP:{c:true, por:'Felipe Alvarez', f:'2026-08-06', hash:'d3aa…1f60'}},
  '2026-08': {TRU:{c:true, por:'Felipe Alvarez', f:'2026-09-03', hash:'19ce…40ab'}, AQP:{c:true, por:'Felipe Alvarez', f:'2026-09-03', hash:'b820…7d15'},
              LIM:{c:false}, TAL:{c:false}, EMP:{c:false}},
};
const PERSONAS = ['Felipe Alvarez','Rosa Quispe','Lucía Mamani','Carla Ríos'];

// ============ v2: configuración, gastos fijos, presupuesto, avisos, conciliación con parejas ============
// Lo que el líder ajusta en Gestión ▸ Configuración (se guarda allá, lo leen todas las pantallas).
const CONFIG = {
  minimoCaja: 15000,        // aviso del flujo de caja
  avisoGastoPct: 25,        // «este gasto vino X % más alto que su promedio»
  avisoVenceDias: 7,        // cuántos días antes avisa un vencimiento
  empresa: {ruc:'20601234567', razon:'CAYLA MODA S.A.C.', comercial:'CAYLA'},
  tasas: [{desde:'2011-03-01', igv:18}],
  uits: [{anio:2026, valor:5500, nota:'por confirmar con el contador'}, {anio:2025, valor:5350}],
};

// Gastos que se repiten: el sistema los detectó y el líder los confirmó (o los propone para confirmar).
const FIJOS = [
  {id:'f1', n:'Alquiler', u:'TRU', c:'alquiler', prov:'Inversiones Primavera', monto:4500, dia:10, cuenta:'bcp', estado:'registrado'},
  {id:'f2', n:'Alquiler', u:'AQP', c:'alquiler', prov:'Rentas Yanahuara', monto:3800, dia:12, cuenta:'bcp', estado:'registrado'},
  {id:'f3', n:'Alquiler', u:'LIM', c:'alquiler', prov:'Inmobiliaria San Isidro', monto:6200, dia:30, cuenta:'bcp', estado:'registrado'},
  {id:'f4', n:'Alquiler', u:'TAL', c:'alquiler', prov:'Sra. Huamán (local del Taller)', monto:1800, dia:25, cuenta:'bcp', estado:'propuesto'},
  {id:'f5', n:'Luz', u:'TRU', c:'servicios', prov:'Hidrandina', monto:612, dia:19, variable:true, cuenta:null, estado:'registrado'},
  {id:'f6', n:'Luz', u:'AQP', c:'servicios', prov:'SEAL', monto:480, dia:19, variable:true, cuenta:'bcp', estado:'registrado'},
  {id:'f10', n:'Luz', u:'LIM', c:'servicios', prov:'Luz del Sur', monto:540, dia:19, variable:true, cuenta:'ibk', estado:'falta'},
  {id:'f7', n:'Internet', u:'TRU', c:'servicios', prov:'Movistar', monto:129, dia:25, cuenta:'bcp', estado:'propuesto'},
  {id:'f8', n:'Contabilidad', u:'EMP', c:'personal', prov:'Estudio contable Ríos', monto:1200, dia:21, cuenta:'bcp', estado:'registrado'},
  {id:'f9', n:'Servidores y software', u:'EMP', c:'servicios', prov:'Vercel / Supabase', monto:480, dia:15, cuenta:'bcp', estado:'registrado'},
];
// Lo que se repite pero nadie marcó como fijo todavía.
const DETECTADOS = [
  {id:'d1', prov:'Shalom', c:'transporte', u:'AQP', monto:48, patron:'4 meses seguidos, entre el 18 y el 22, entre S/ 42 y S/ 55'},
  {id:'d2', prov:'Meta Platforms', c:'publicidad', u:'EMP', monto:1600, patron:'6 meses seguidos, cerca del día 18, entre S/ 1,200 y S/ 1,600'},
];

// Presupuesto de septiembre (lo pone el líder en Configuración). Ventas sin IGV.
const PRESUPUESTO = {
  ventas:   {TRU:46000, AQP:34000, LIM:24000},
  gastos:   { // rubro → unidad → tope del mes
    alquiler:    {TRU:4500, AQP:3800, LIM:6200, TAL:1800},
    servicios:   {TRU:650,  AQP:500,  LIM:480,  TAL:720,  EMP:700},
    publicidad:  {EMP:2500},
    suministros: {TRU:320,  AQP:320,  LIM:250,  TAL:540,  EMP:100},
    transporte:  {TRU:150,  AQP:120,  LIM:80,   TAL:150},
  },
};

// Avisos de lo raro: los calcula el sistema comparando con el promedio de los últimos 6 meses.
const RAROS = [
  {u:'AQP', t:'La luz de AQP vino 38 % más alta que su promedio', d:'S/ 662 este mes contra S/ 480 de promedio en 6 meses. ¿Cambió algo en la tienda o es un error del recibo?', ir:'gastos', dato:'gastos + promedio móvil'},
  {u:'LIM', t:'LIM pierde el triple de prendas que TRU', d:'Mermas de agosto: 1,1 % de la venta en LIM contra 0,4 % en TRU. Son S/ 130 al mes que se van.', ir:'reportes:resultados', dato:'prendas_danadas / ventas'},
  {u:null,  t:'Moda Lima EIRL subió 12 % el costo de la blusa Aurora', d:'De S/ 38 a S/ 42.50 en su última factura. Si el precio de venta no cambia, el margen de esa prenda baja de 58 % a 53 %.', ir:'dinero:porpagar', dato:'costo_historial'},
];

// Extracto de Interbank (lo que dice el banco). El sistema propone la pareja; el líder confirma.
const EXTRACTO_IBK = [
  {id:'x1', f:'2026-09-22', d:'ABONO NIUBIZ LIQ 200926',      monto: 4180, pareja:'Abono de tarjeta del 22 sep · S/ 4,180'},
  {id:'x2', f:'2026-09-22', d:'PLIN LOTE 220926',              monto: 1240, pareja:'Cobros con Plin del 22 sep: TRU S/ 610 · AQP S/ 420 · LIM S/ 210'},
  {id:'x3', f:'2026-09-22', d:'COM. MANTENIMIENTO CTA',        monto: -25,  pareja:null, sugerir:'Registrar como gasto «Comisiones del POS» (639) de la empresa'},
  {id:'x4', f:'2026-09-19', d:'TRANSF. A CTA BCP 1942…',       monto:-8000, pareja:'Entre cuentas del 19 sep · S/ 8,000'},
  {id:'x5', f:'2026-09-05', d:'PAGO SERVICIO LUZ DEL SUR',     monto: -710, pareja:'Gasto «Luz del Taller (agosto)» del 5 sep'},
  {id:'x6', f:'2026-09-03', d:'YAPE LIM 030926',               monto:  385, pareja:'Cobros con Yape de LIM del 3 sep'},
];

// Plata del dueño: aporte (se queda en CAYLA) o préstamo (CAYLA te lo devuelve).
const PRESTAMOS_DUENO = [
  {f:'2026-07-14', monto:10000, nota:'Para pagar la mercadería de invierno', devuelto:4000},
];

// ============ v3: meta del día y fondo de caja; cada campaña los cambia (Configuración ▸ Tiendas y caja) ============
// La meta del día es CON IGV: es lo que la caja ve cobrado. El presupuesto del mes la muestra sin IGV.
const DIAS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const DIAS_L = ['lunes','martes','miércoles','jueves','viernes','sábado','domingo'];
const TIENDAS_CAJA = {
  TRU: {metas:[1500,1500,1600,1700,2000,2500,2000], fondo:300, cierra:'21:00'},
  AQP: {metas:[1100,1100,1200,1250,1500,1850,1450], fondo:250, cierra:'21:00'},
  LIM: {metas:[780,780,850,880,1050,1300,1020],     fondo:200, cierra:'22:00'},
};
// Las CAMPAÑAS son las etiquetas de estilo «campaña» de Catálogo ▸ Etiquetas (las mismas de producción, con sus fechas).
// Ellas son las dueñas de las fechas. Lo nuevo es su efecto en la caja, por tienda: cuánto sube la meta y qué fondo
// dejar (null = lo normal). Pueden cruzarse: ese día gana la mayor (igual que el descuento de una prenda).
const CAMPANAS = [
  {id:'c01', n:'San Valentín',                desde:'2026-01-31', hasta:'2026-02-14', dcto:null, caja:{TRU:{pct:15, fondo:350}, AQP:{pct:15, fondo:300}, LIM:{pct:10, fondo:250}}},
  {id:'c02', n:'Día de la Mujer',             desde:'2026-02-22', hasta:'2026-03-08', dcto:null, caja:null},
  {id:'c03', n:'Día de la Tierra',            desde:'2026-04-08', hasta:'2026-04-22', dcto:null, caja:null},
  {id:'c04', n:'Día de la Madre',             desde:'2026-04-26', hasta:'2026-05-10', dcto:null, caja:{TRU:{pct:30, fondo:400}, AQP:{pct:30, fondo:350}, LIM:{pct:25, fondo:300}}},
  {id:'c05', n:'Fiestas Patrias',             desde:'2026-07-14', hasta:'2026-07-29', dcto:null, caja:{TRU:{pct:25, fondo:400}, AQP:{pct:25, fondo:350}, LIM:{pct:20, fondo:300}}},
  {id:'c06', n:'Día Internacional del Gato',  desde:'2026-07-25', hasta:'2026-08-08', dcto:null, caja:{TRU:{pct:5, fondo:null}, AQP:{pct:5, fondo:null}, LIM:{pct:5, fondo:null}}},
  {id:'c07', n:'Día Internacional del Perro', desde:'2026-08-12', hasta:'2026-08-26', dcto:null, caja:{TRU:{pct:5, fondo:null}, AQP:{pct:5, fondo:null}, LIM:{pct:5, fondo:null}}},
  {id:'c08', n:'Aniversario CAYLA',           desde:'2026-10-01', hasta:'2026-10-14', dcto:15,   caja:{TRU:{pct:30, fondo:400}, AQP:{pct:30, fondo:350}, LIM:{pct:30, fondo:300}}},
  {id:'c09', n:'Halloween',                   desde:'2026-10-17', hasta:'2026-10-31', dcto:null, caja:null},
  {id:'c10', n:'Black Friday',                desde:'2026-11-09', hasta:'2026-11-30', dcto:30,   caja:{TRU:{pct:50, fondo:500}, AQP:{pct:50, fondo:450}, LIM:{pct:40, fondo:400}}},
  {id:'c11', n:'Navidad',                     desde:'2026-12-11', hasta:'2026-12-25', dcto:null, caja:{TRU:{pct:40, fondo:500}, AQP:{pct:40, fondo:450}, LIM:{pct:35, fondo:400}}},
  {id:'c12', n:'CyberWow',                    desde:null,         hasta:null,         dcto:null, caja:null},
];
// Resultado de las campañas que ya pasaron (ventas sin IGV). «normal» = lo que la tienda vende en la misma cantidad
// de días sin campaña. descuento = lo que se dejó de cobrar por el descuento de la campaña (venta_items.descuento_etiqueta_id).
const CAMPANA_RESULTADOS = {
  c04: {ventas:52400, normal:40100, descuento:0,    margenPct:.53, prendas:612},
  c05: {ventas:48900, normal:37800, descuento:2300, margenPct:.49, prendas:598},
  c06: {ventas:43200, normal:41600, descuento:1900, margenPct:.47, prendas:520},
  c07: {ventas:41800, normal:41200, descuento:2600, margenPct:.45, prendas:505},
};
// Lo que vendió hoy cada tienda hasta las 17:40, por medio (la caja lo tiene; aquí para el ejemplo de Caja).
const HOY_CAJA = {
  hora:'17:40',
  TRU: {efectivo:846, yape:190, plin:0, tarjeta:84, transferencia:0},
  AQP: {efectivo:569, yape:260, plin:120, tarjeta:0, transferencia:0},
  LIM: {efectivo:345, yape:180, plin:90, tarjeta:210, transferencia:0},
};
