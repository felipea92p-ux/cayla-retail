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
  {id:'cTRU', n:'Cajón · Tienda TRU',          tipo:'cajon',   cta:'101', saldo:2030, unidad:'TRU'},
  {id:'cAQP', n:'Cajón · Tienda AQP',          tipo:'cajon',   cta:'101', saldo:1745, unidad:'AQP'},
  {id:'cLIM', n:'Cajón · Tienda LIM',          tipo:'cajon',   cta:'101', saldo:1495, unidad:'LIM'},
  {id:'cTAL', n:'Fondo fijo · Taller',         tipo:'cajon',   cta:'101', saldo:630,  unidad:'TAL'},
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
  {u:'TRU', caja:'abierta', abre:'09:02', por:'Rosa Quispe', apertura:200, ventas:1846, ingresos:0,  egresos:16,  depositos:0, traslados:0},
  {u:'AQP', caja:'abierta', abre:'09:15', por:'Lucía Mamani', apertura:200, ventas:1569, ingresos:0,  egresos:24,  depositos:0, traslados:0},
  {u:'LIM', caja:'abierta', abre:'10:04', por:'Carla Ríos',  apertura:150, ventas:1345, ingresos:0,  egresos:0,   depositos:0, traslados:0},
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
const FLUJO_SEMANAS = [
  {s:'28 sep – 4 oct', entra:22000, sale:58500, que:'Planilla S/ 29,800 · alquileres · Confecciones Andina'},
  {s:'5 – 11 oct',     entra:22000, sale:18900, que:'Moda Lima · Tejidos del Sur · Distribuidora Norte (parte)'},
  {s:'12 – 18 oct',    entra:22000, sale:35700, que:'Distribuidora Norte S/ 15,300 · Muebles Roble · luz'},
  {s:'19 – 25 oct',    entra:22000, sale:9800,  que:'Confecciones Andina (LIM) parte · servicios'},
  {s:'26 oct – 1 nov', entra:22000, sale:31200, que:'Planilla · alquileres'},
  {s:'2 – 8 nov',      entra:22000, sale:14600, que:'Proveedores de temporada'},
];
const MINIMO_CAJA = 15000;

// Balance al 31-ago (cerrado). Capital es una ENTRADA, nunca el residual (ADR-0109).
const BALANCE = {
  activo: [['101','Caja (cajones y fondo fijo)',5420],['104','Bancos',47900],['105','Tarjeta por abonar',2310],
           ['201','Mercaderías',186400],['211','Productos terminados del Taller',12600],['24','Insumos del Taller (tela, avíos)',8900],
           ['33','Muebles, equipos y remodelación',28149],['39','Depreciación acumulada',-1778]],
  pasivo: [['4011','IGV por pagar',6840],['4017','Impuesto a la renta',1900],['421','Facturas por pagar',64300],['41','Remuneraciones por pagar',0]],
  patrimonio: [['50','Capital',180000],['591','Utilidades acumuladas',33801],['','Utilidad de agosto',3060]],
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
