// Datos inventados de la maqueta. Nada de esto sale de la base ni vuelve a ella.
window.DATOS = (() => {
  // Las tallas de cada categoría son las reales del catálogo (`categoria_tallas`): `habituales` son las de siempre (`habitual = true`) y con esas arranca la tabla;
  // `otras`, las demás que la categoría ofrece, de la más a la menos común; `resto`, las del catálogo que la categoría no ofrece.
  const LETRAS = { habituales: ["S", "M", "L"], otras: ["XS", "XL", "XXL", "Estándar"], resto: ["Única"] };
  const NUMEROS = { habituales: ["28", "30", "32"], otras: ["34", "26"], resto: ["36", "38", "40", "42"] };
  const UNICA = { habituales: ["Única"], otras: [], resto: [] };
  const SUR = "Confecciones del Sur";
  const ANDINA = "Textiles Andina";
  const NORTE = "Moda Norte SAC";

  const colores = [
    { nombre: "Crema", hex: "#EFE6D5" },
    { nombre: "Vino", hex: "#6E1F2B" },
    { nombre: "Negro", hex: "#1F1B18" },
    { nombre: "Azul noche", hex: "#1E2A44" },
    { nombre: "Rosa palo", hex: "#EDB9C6" },
    { nombre: "Arena", hex: "#D9C7B0" },
    { nombre: "Verde oliva", hex: "#5E6B3A" },
    { nombre: "Blanco", hex: "#F7F5F0" },
    { nombre: "Terracota", hex: "#B5603D" },
    { nombre: "Lila", hex: "#B9A6D6" },
  ];
  const hex = (nombre) => colores.find((c) => c.nombre === nombre).hex;

  const categorias = [
    { id: "vestidos", nombre: "Vestidos", tallas: LETRAS, catalogo: ["Vestido Mimosa", "Vestido Ch", "Vestido Aurora", "Vestido Luna"] },
    { id: "camisas", nombre: "Camisas y Blusas", tallas: LETRAS, catalogo: ["Blusa Mimosa", "Camisa Oxford", "Blusa Luna"] },
    { id: "pantalones", nombre: "Pantalones", tallas: NUMEROS, catalogo: ["Pantalón Recto", "Pantalón Cargo"] },
    { id: "jeans", nombre: "Jeans", tallas: NUMEROS, catalogo: ["Jean Clásico", "Jean Flare"] },
    { id: "casacas", nombre: "Casacas", tallas: LETRAS, catalogo: ["Casaca Cuero", "Casaca Polar"] },
    { id: "faldas", nombre: "Faldas", tallas: LETRAS, catalogo: ["Falda Larga", "Falda Jean"] },
    { id: "chompas", nombre: "Chompas", tallas: LETRAS, catalogo: ["Chompa Trenzada"] },
    { id: "enterizos", nombre: "Enterizos", tallas: LETRAS, catalogo: ["Enterizo Lino"] },
    { id: "polos", nombre: "Polos", tallas: LETRAS, catalogo: ["Polo Básico"] },
    { id: "bolsos", nombre: "Bolsos y Carteras", tallas: UNICA, catalogo: ["Cartera Mini"] },
    { id: "anillos", nombre: "Anillos", tallas: { habituales: ["6", "7", "8"], otras: ["9"], resto: [] }, catalogo: ["Anillo Fino"] },
  ];

  const m = (id, nombre, cat, proveedor, marca, tipo, dijeron, contadas, color, extra = {}) => ({
    id,
    nombre,
    cat,
    proveedor,
    marca,
    tipo,
    dijeron,
    contadas: contadas ?? 0,
    contado: contadas !== null,
    color: hex(color),
    ...extra,
  });

  // El boceto de Felipe, con las mismas prendas y cifras donde se pudo: Vestido Lima arranca igual que allí, con sus tallas puestas.
  const modelos = [
    m("lima", "Vestido Lima", "vestidos", SUR, "CAYLA", "restock", 360, 360, "Crema", {
      modo: "ahora",
      matriz: [
        { color: "Crema", celdas: { XS: 20, S: 40, M: 40, L: 40, XL: 20 } },
        { color: "Vino", celdas: { XS: 20, S: 40, M: 40, L: 40, XL: 20 } },
        { color: "Negro", celdas: { XS: 5, S: 10, M: 10, L: 10, XL: 5 } },
      ],
    }),
    m("sofia", "Vestido Sofía", "vestidos", SUR, "CAYLA", "restock", 48, 48, "Vino"),
    m("antonella", "Vestido Antonella", "vestidos", SUR, "CAYLA", "restock", 120, 120, "Rosa palo", {
      modo: "ahora",
      matriz: [
        { color: "Rosa palo", celdas: { XS: 10, S: 20, M: 20, L: 20, XL: 10 } },
        { color: "Crema", celdas: { XS: 0, S: 5, M: 5, L: 0, XL: 0 } },
      ],
    }),
    m("renata", "Vestido Renata", "vestidos", SUR, "Marca Norte", "restock", 75, null, "Arena"),
    m("camila", "Vestido Camila", "vestidos", ANDINA, "Marca Norte", "restock", 600, 580, "Azul noche"),
    m("valeria", "Vestido Valeria", "vestidos", ANDINA, "CAYLA", "nuevo", 2400, 2400, "Blanco"),
    m("alba", "Vestido Alba", "vestidos", ANDINA, "Marca Sur", "nuevo", 150, null, "Verde oliva"),
    m("midi", "Vestido midi satinado con cinturón y manga globo", "vestidos", NORTE, "Marca Sur", "restock", 36, null, "Terracota"),

    m("aurora", "Blusa Aurora", "camisas", SUR, "CAYLA", "restock", 240, 240, "Crema"),
    m("ines", "Blusa Inés", "camisas", SUR, "Marca Norte", "restock", 180, null, "Lila"),
    m("lino", "Camisa Lino", "camisas", NORTE, "Marca Sur", "nuevo", 300, null, "Blanco"),
    m("flora", "Blusa Flora", "camisas", ANDINA, "CAYLA", "restock", 100, 96, "Terracota"),

    m("milan", "Pantalón Milán", "pantalones", ANDINA, "CAYLA", "restock", 150, null, "Negro"),
    m("sastre", "Pantalón Sastre", "pantalones", NORTE, "Marca Sur", "nuevo", 80, null, "Arena"),
    m("palazzo", "Pantalón Palazzo", "pantalones", ANDINA, "Marca Norte", "restock", 210, 212, "Vino"),

    m("recto", "Jean Recto", "jeans", SUR, "CAYLA", "restock", 420, null, "Azul noche"),
    m("mom", "Jean Mom", "jeans", SUR, "Marca Norte", "nuevo", 260, null, "Azul noche"),
    m("skinny", "Jean Skinny", "jeans", NORTE, "CAYLA", "restock", 320, 320, "Negro"),

    m("denim", "Casaca Denim", "casacas", NORTE, "Marca Norte", "restock", 90, null, "Azul noche"),
    m("bomber", "Casaca Bomber", "casacas", ANDINA, "Marca Sur", "nuevo", 60, null, "Verde oliva"),

    m("plisada", "Falda Plisada", "faldas", SUR, "CAYLA", "restock", 130, 130, "Rosa palo"),
    m("midifalda", "Falda Midi", "faldas", NORTE, "Marca Sur", "nuevo", 70, null, "Terracota"),
    m("lapiz", "Falda Lápiz", "faldas", ANDINA, "Marca Norte", "restock", 40, 0, "Negro"),
  ];

  /** «Envío grande»: el volumen de la prueba del 2 de noviembre (11 categorías, unos 74 modelos, más de 100 mil prendas), para ver si la pantalla aguanta. Siempre el mismo. */
  function envioGrande() {
    const nombres = ["Sofía", "Paula", "Valeria", "Antonella", "Renata", "Camila", "Inés", "Bruna", "Mariana", "Lima", "Daniela", "Alba", "Lucía", "Emma"];
    const base = { vestidos: "Vestido", camisas: "Blusa", pantalones: "Pantalón", jeans: "Jean", casacas: "Casaca", faldas: "Falda", chompas: "Chompa", enterizos: "Enterizo", polos: "Polo", bolsos: "Cartera", anillos: "Anillo" };
    const cuantos = { vestidos: 14, camisas: 14, pantalones: 8, jeans: 8, casacas: 6, faldas: 6, chompas: 5, enterizos: 3, polos: 3, bolsos: 4, anillos: 3 };
    const cantidades = [12000, 5000, 2400, 1200, 900, 600, 480, 360, 240, 150, 120, 75, 48, 36];
    const provs = [SUR, ANDINA, NORTE];
    const marcas = ["CAYLA", "Marca Norte", "Marca Sur"];
    const salida = [];
    let n = 0;
    for (const c of categorias) {
      for (let i = 0; i < cuantos[c.id]; i++) {
        n += 1;
        const dijeron = cantidades[(n * 5) % cantidades.length];
        const color = colores[n % colores.length].nombre;
        const tipo = n % 4 === 0 ? "nuevo" : "restock";
        // Va por la mitad: dos de cada tres contados, y uno de cada nueve con diferencia.
        const contadas = n % 3 === 0 ? null : n % 9 === 1 ? Math.max(0, dijeron - (n % 7) * 3 - 2) : dijeron;
        salida.push(m(`g${n}`, `${base[c.id]} ${nombres[i % nombres.length]}`, c.id, provs[n % 3], marcas[(n >> 1) % 3], tipo, dijeron, contadas, color));
      }
    }
    return salida;
  }

  return {
    envio: { numero: "ENV-003058", guia: "0001-4821", sede: "Tienda Lima", fecha: "lunes, 2 de noviembre · 19:40" },
    equipo: ["Felipe Alvarez", "Mariana Quispe", "Rosa Huamán"],
    papeles: [
      { id: "p1", tipo: "Factura", numero: "F001-2291", proveedor: SUR, foto: true },
      { id: "p2", tipo: "Boleta", numero: "B002-0118", proveedor: ANDINA, foto: false },
      { id: "p3", tipo: "Factura", numero: "F003-0764", proveedor: NORTE, foto: false },
    ],
    colores,
    categorias,
    modelos,
    envioGrande,
  };
})();
