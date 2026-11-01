/* Datos INVENTADOS de la maqueta (nombres, teléfonos, códigos). Lo real es la forma: estados, plazos y textos salen de
   apps/web/lib/pedidos-web-reglas.ts. Los colores de prenda son dato (no cambian con el tema). */
(function () {
  const P = (window.P = {});

  P.PLAZOS = { confirmar: 24, sinPagar: 48, recoger: 7 };
  P.CODIGO_ENTREGA = "2094";
  P.RESPONSABLES = [
    { id: "r1", nombre: "Rosa Medina", rol: "Líder de equipo" },
    { id: "r2", nombre: "Jorge Chávez", rol: "Colaborador" },
    { id: "r3", nombre: "Ana Lucía Pardo", rol: "Colaboradora" },
  ];

  const COLOR = {
    Negro: "#2b2b28",
    Marfil: "#efe6d2",
    Beige: "#d8c3a0",
    Camel: "#b98a55",
    Gris: "#8e8e8a",
    Verde: "#4f6b4a",
    Azul: "#3d5a80",
    Café: "#6a4a36",
  };

  /** Una prenda de un pedido. `disp`: lo que hay libre hoy: en la tienda del pedido (almacén y piso) y en otras sedes (`otras`, que se pueden pedir). */
  function L(id, ref, cat, color, talla, precio, extra) {
    return Object.assign(
      { id, ref, cat, color, talla, hex: COLOR[color], precio, estado: "pendiente", lugar: null, disp: { alm: 0, piso: 0, otras: [] }, compiten: [], empresa: "CAYLA" },
      extra || {},
    );
  }

  /** Datos nuevos cada vez: «Reiniciar» vuelve a este punto. */
  P.crear = function () {
    const pedidos = [
      /* ───────── Por confirmar ───────── */
      {
        id: "W-0031", estado: "por_confirmar", hace: "hace 23 h", creado: "Separado hace 23 h",
        cliente: { nombre: "Valeria Quispe Mendoza", cel: "987 412 305", correo: "valeria.quispe@correo.com" },
        venceMin: 40, pagos: [], boleta: null, cupon: null,
        lineas: [
          L("a", "Blusa Emma", "blusa", "Negro", "M", 89.9, { disp: { alm: 1, piso: 1, otras: [] }, compiten: [{ c: "W-0030", antes: true }] }),
          L("b", "Pantalón Lino", "pantalon", "Beige", "28", 119.9, { disp: { alm: 0, piso: 0, otras: [{ t: "Tienda AQP", n: 1 }] } }),
          L("c", "Cinturón Cuero", "cinturon", "Café", "Único", 49.9, { disp: { alm: 1, piso: 0, otras: [] } }),
        ],
      },
      {
        id: "W-0030", estado: "por_confirmar", hace: "hace 14 h", creado: "Separado hace 14 h",
        cliente: { nombre: "Camila Paredes Rojas", cel: "954 220 118", correo: "camila.paredes@correo.com" },
        venceMin: 9 * 60 + 20, pagos: [], boleta: null, cupon: null,
        lineas: [L("a", "Blusa Emma", "blusa", "Negro", "M", 89.9, { disp: { alm: 1, piso: 1, otras: [] }, compiten: [{ c: "W-0031", antes: false }] })],
      },
      /* ───────── Por cobrar ───────── */
      {
        id: "W-0028", estado: "confirmado", hace: "hace 46 h", creado: "Separado hace 2 días", confirmadoHace: "hace 46 h",
        cliente: { nombre: "Lucía Fernández Soto", cel: "961 508 733", correo: "lucia.fs@correo.com" },
        anulaMin: 2 * 60, pagos: [], boleta: null,
        cupon: { codigo: "CAY-4821-9H2M", descuento: 10, estado: "reservado" },
        lineas: [L("a", "Vestido Aurora", "vestido", "Verde", "S", 169.9, { estado: "reservada", lugar: "almacen" })],
      },
      {
        id: "W-0027", estado: "confirmado", hace: "hace 20 h", creado: "Separado hace 1 día", confirmadoHace: "hace 20 h",
        cliente: { nombre: "Rosa Huamán Díaz", cel: "945 331 902", correo: "rosa.huaman@correo.com" },
        pagos: [{ id: "p1", monto: 50, medio: "yape", op: "04812793", cuando: "hace 20 h", por: "Jorge Chávez", enCaja: false, estado: "aprobado" }],
        boleta: null, cupon: null,
        lineas: [
          L("a", "Casaca Lana", "casaca", "Gris", "M", 189.9, { estado: "reservada", lugar: "piso" }),
          L("b", "Chaleco Tejido", "chaleco", "Camel", "S", 119.9, { estado: "por_conseguir", via: "taller", fecha: "8 nov" }),
        ],
      },
      {
        id: "W-0026", estado: "confirmado", hace: "hace 3 días", creado: "Separado hace 3 días", confirmadoHace: "hace 3 días", sinPagar: true,
        cliente: { nombre: "Mariana Torres León", cel: "937 664 120", correo: "mariana.torres@correo.com" },
        pagos: [{ id: "p1", monto: 79.9, medio: "plin", op: "30281144", cuando: "hace 3 días", por: "Ana Lucía Pardo", enCaja: false, estado: "aprobado" }],
        boleta: null, cupon: null,
        lineas: [
          L("a", "Pantalón Lino", "pantalon", "Negro", "30", 119.9, { estado: "reservada", lugar: "almacen" }),
          L("b", "Cinturón Cuero", "cinturon", "Café", "Único", 49.9, { estado: "por_conseguir", via: "compra", fecha: "2 nov", disp: { alm: 1, piso: 0, otras: [] } }),
        ],
      },
      /* ───────── Por entregar ───────── */
      {
        id: "W-0025", estado: "pagado", hace: "hace 3 h", creado: "Separado hace 1 día", pagadoHace: "hace 3 h", listo: true,
        cliente: { nombre: "Ana Gutiérrez Vega", cel: "976 118 440", correo: "ana.gutierrez@correo.com" },
        pagos: [{ id: "p1", monto: 189.8, medio: "efectivo", op: null, cuando: "hace 3 h", por: "Rosa Medina", enCaja: true, estado: "aprobado", hoy: true }],
        boleta: { texto: "B001-00085", estado: "aceptado" }, cupon: null,
        lineas: [
          L("a", "Blusa Emma", "blusa", "Marfil", "S", 89.9, { estado: "reservada", lugar: "almacen" }),
          L("b", "Falda Plisada", "falda", "Azul", "M", 99.9, { estado: "reservada", lugar: "piso" }),
        ],
      },
      {
        id: "W-0024", estado: "pagado", hace: "hace 8 días", creado: "Separado hace 9 días", pagadoHace: "hace 8 días", listo: true, sinRecoger: true,
        cliente: { nombre: "Diego Salazar Ruiz", cel: "912 884 207", correo: "diego.salazar@correo.com" },
        pagos: [{ id: "p1", monto: 79.9, medio: "yape", op: "77120945", cuando: "hace 8 días", por: "Jorge Chávez", enCaja: false, estado: "aprobado" }],
        boleta: { texto: "B001-00071", estado: "aceptado" }, cupon: null,
        lineas: [L("a", "Polo Pima", "polo", "Negro", "L", 79.9, { estado: "reservada", lugar: "almacen" })],
      },
      {
        id: "W-0023", estado: "pagado", hace: "hace 2 días", creado: "Separado hace 3 días", pagadoHace: "hace 2 días", listo: false,
        cliente: { nombre: "Paola Ríos Campos", cel: "988 310 576", correo: "paola.rios@correo.com" },
        pagos: [{ id: "p1", monto: 359.8, medio: "transferencia", op: "90412377", cuando: "hace 2 días", por: "Ana Lucía Pardo", enCaja: false, estado: "aprobado" }],
        boleta: { texto: "B001-00083", estado: "enviado" }, cupon: null,
        lineas: [
          L("a", "Casaca Lana", "casaca", "Camel", "S", 189.9, { estado: "reservada", lugar: "almacen" }),
          L("b", "Vestido Aurora", "vestido", "Verde", "M", 169.9, { estado: "por_conseguir", traslado: { desde: "Tienda AQP", numero: 412, llega: "3 nov" } }),
        ],
      },
      /* ───────── Cerrados ───────── */
      {
        id: "W-0022", estado: "anulado", hace: "hace 20 h", creado: "Separado hace 2 días", cierre: "cliente_desistio", conVenta: false,
        cliente: { nombre: "Angélica Ruiz Fernández", cel: "929 770 318", correo: "angelica.ruiz@correo.com" },
        pagos: [{ id: "p1", monto: 109, medio: "yape", op: "55012873", cuando: "hace 2 días", por: "Jorge Chávez", enCaja: false, estado: "aprobado" }],
        boleta: null, cupon: null,
        lineas: [L("a", "Pantalón Lino", "pantalon", "Azul", "28", 109, { estado: "liberada" })],
      },
      cerrado("W-0021", "Entregado", "hace 1 día", "Marcela Linares Peña", [L("a", "Polo Pima", "polo", "Marfil", "M", 79.9), L("b", "Falda Plisada", "falda", "Negro", "S", 99.9)], { entregadoPor: "Rosa Medina", boleta: "B001-00080" }),
      cerrado("W-0020", "Entregado", "hace 2 días", "Sofía Vargas Núñez", [L("a", "Casaca Lana", "casaca", "Gris", "L", 189.9)], { entregadoPor: "Jorge Chávez", boleta: "B001-00077" }),
      cerrado("W-0019", "cliente_no_respondio", "hace 6 días", "Felipe Álvarez Pereyra", [L("a", "Chaleco Tejido", "chaleco", "Beige", "M", 69.9), L("b", "Blusa Emma", "blusa", "Café", "M", 89.9), L("c", "Pantalón Lino", "pantalon", "Beige", "30", 119.9)], {}),
      cerrado("W-0018", "sin_confirmar", "hace 6 días", "Lorena Chávez Mori", [L("a", "Vestido Aurora", "vestido", "Verde", "S", 169.9)], {}),
      cerrado("W-0017", "sin_stock", "hace 7 días", "Gabriela Soto Ibáñez", [L("a", "Pantalón Lino", "pantalon", "Negro", "26", 119.9)], {}),
      cerrado("W-0016", "Entregado", "hace 8 días", "Natalia Cárdenas Ríos", [L("a", "Blusa Emma", "blusa", "Marfil", "M", 89.9), L("b", "Cinturón Cuero", "cinturon", "Café", "Único", 49.9)], { entregadoPor: "Ana Lucía Pardo", boleta: "B001-00069" }),
      cerrado("W-0015", "cliente_desistio", "hace 9 días", "Daniela Mejía Torres", [L("a", "Casaca Lana", "casaca", "Camel", "M", 189.9)], { conVenta: true, boleta: "B001-00066", nota: "BC01-00004" }),
      cerrado("W-0014", "sin_stock", "hace 11 días", "Renata Flores Díaz", [L("a", "Falda Plisada", "falda", "Azul", "S", 99.9)], {}),
      cerrado("W-0013", "Entregado", "hace 12 días", "Carmen Alva Ríos", [L("a", "Polo Pima", "polo", "Negro", "S", 79.9)], { entregadoPor: "Rosa Medina", boleta: "B001-00058" }),
      cerrado("W-0012", "cliente_desistio", "hace 14 días", "Jimena Paz Cuba", [L("a", "Vestido Aurora", "vestido", "Verde", "M", 169.9), L("b", "Chaleco Tejido", "chaleco", "Camel", "S", 119.9)], {}),
    ];

    const enviar = [
      {
        id: "W-0112", tiendaPedido: "Tienda AQP",
        lineas: [L("a", "Blusa Emma", "blusa", "Marfil", "S", 89.9, { lugar: "piso" }), L("b", "Falda Plisada", "falda", "Negro", "M", 99.9, { lugar: "almacen" })],
      },
    ];
    return { pedidos, enviar };
  };

  /** Un pedido ya cerrado: `motivo` es «Entregado» o la clave con que se cerró. */
  function cerrado(id, motivo, hace, nombre, lineas, x) {
    const entregado = motivo === "Entregado";
    const anulado = !entregado && motivo !== "sin_confirmar";
    const total = lineas.reduce((a, l) => a + l.precio, 0);
    lineas.forEach((l) => (l.estado = entregado ? "entregada" : "liberada"));
    return {
      id, estado: entregado ? "entregado" : motivo === "sin_confirmar" ? "vencido" : "anulado", hace, creado: "Separado " + hace,
      cliente: { nombre, cel: "9" + (40 + (id.length * 7) % 50) + " " + (300 + parseInt(id.slice(-2), 10) * 13) + " " + (100 + parseInt(id.slice(-2), 10) * 17), correo: nombre.split(" ")[0].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") + "@correo.com" },
      cierre: entregado ? null : motivo, entregadoPor: x.entregadoPor || null, conVenta: !!x.conVenta,
      pagos: entregado || x.conVenta ? [{ id: "p1", monto: total, medio: "efectivo", op: null, cuando: hace, por: x.entregadoPor || "Rosa Medina", enCaja: true, estado: x.conVenta ? "anulado" : "aprobado", devuelto: !!x.conVenta }] : [],
      boleta: x.boleta ? { texto: x.boleta, estado: x.nota ? "anulado" : "aceptado" } : null,
      nota: x.nota ? { texto: x.nota, estado: "aceptado", total } : null,
      cupon: null, lineas,
    };
  }
})();
