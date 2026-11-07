// Datos de la maqueta del spike de la tienda (2026-10-26).
// REAL: los nombres y las fotos de las 13 prendas de la portada pública de tienda.cayla.pe (las fotos se leen de su almacén público; no se
// copian al repo, que es público), las dos tiendas con su dirección, horario y WhatsApp, y el texto de «Así se separa» y del Club
// (apps/tienda/components/AsiSeSepara.tsx y SeccionClub.tsx).
// DE EJEMPLO: precios, colores de más, tallas, cuánto hay por talla, las ofertas, las insignias, los looks, los pedidos, los puntos.
(function () {
  const FOTOS = "https://vovjyyiafkxteijimpuy.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/";

  // `pct`: descuento de la campaña vigente (Aniversario CAYLA); `nuevo`: llegó en los últimos 30 días; `puesto`: lugar en «Más vendidos».
  const prendas = [
    { id: "kalessi", nombre: "Blusa Kalessi", cat: "blusas", precio: 119, nuevo: true, foto: ["9afb4280-1866-466c-bad1-8a635f45bdea"], colores: [["Chocolate", "#4e3a2e"], ["Marfil", "#ece6da"]], tallas: ["S", "M", "L"], stock: { aqp: 5, tru: 1 }, desc: "Blusa de manga larga con cuello camisero y botones al frente. Caída suave, ligeramente oversize." },
    { id: "tiana", nombre: "Palazo Tiana", cat: "pantalones", precio: 139, pct: 15, foto: ["984f73d6-ce8f-45f2-b7b3-c42ae98f4f06"], colores: [["Celeste", "#a9c3dd"]], tallas: ["26", "28", "30", "32"], stock: { aqp: 8, tru: 2 }, desc: "Palazo de tiro alto y pierna ancha en denim ligero. Cintura con botón y cierre." },
    { id: "alba", nombre: "Corset Alba", cat: "corsets", precio: 99, puesto: 1, foto: ["7b4450d9-fb1c-4eab-92a7-843d7de778af"], colores: [["Rojo", "#d42a2a"], ["Negro", "#1f1d1c"]], tallas: ["S", "M"], stock: { aqp: 1, tru: 0 }, desc: "Corset con encaje y varillas, escote corazón y cordones atrás." },
    { id: "strend", nombre: "Pantalón Sastre Strend", cat: "pantalones", precio: 149, nuevo: true, foto: ["6e022b5c-51ae-4ef1-87b5-10b4d69a5d20"], colores: [["Gris oliva", "#5e6157"], ["Negro", "#1f1d1c"], ["Beige", "#cdbb9f"]], tallas: ["S", "M", "L", "XL"], stock: { aqp: 7, tru: 4 }, desc: "Pantalón de sastre con pinzas y pierna recta. Tela con caída." },
    { id: "luna", nombre: "Falda Luna", cat: "faldas", precio: 89, pct: 15, puesto: 4, foto: ["eeb109f1-d55d-48dc-bfea-e2b5c469b740", "25f986b5-ed42-4923-bb39-4a08c1888f99"], colores: [["Café", "#6a5240"]], tallas: ["S", "M", "L"], stock: { aqp: 2, tru: 6 }, desc: "Minifalda plisada con hebilla lateral y pretina ajustada." },
    { id: "semicadera", nombre: "Palazo Semicadera", cat: "pantalones", precio: 139, pct: 15, foto: ["773bebab-3304-4d95-87f8-c56282f475a7"], colores: [["Azul", "#5b7fa8"]], tallas: ["26", "28", "30", "32"], stock: { aqp: 9, tru: 5 }, desc: "Palazo de tiro semicadera, pierna ancha, denim azul medio." },
    { id: "cuello-v", nombre: "Camiseta Cuello V Cruzado", cat: "tops", precio: 59, nuevo: true, foto: ["42ed56a1-62a4-450f-a02b-5475649e4fd3"], colores: [["Amarillo", "#efe2a2"], ["Blanco", "#f3f2ee"], ["Negro", "#1f1d1c"]], tallas: ["S", "M", "L"], stock: { aqp: 9, tru: 7 }, desc: "Camiseta con cuello en V cruzado y manga corta. Algodón elástico." },
    { id: "rayas", nombre: "Camisa Rayas Larga", cat: "blusas", precio: 109, puesto: 2, foto: ["05de55d0-1588-4d45-b740-772a65d3b083"], colores: [["Blanco a rayas", "#e9edf1"]], tallas: ["S", "M", "L"], stock: { aqp: 0, tru: 3 }, desc: "Camisa larga de rayas finas, manga tres cuartos, corte amplio." },
    { id: "olenka", nombre: "Corset Olenka", cat: "corsets", precio: 109, puesto: 3, foto: ["8f41cefc-d7fb-4244-8bcc-622f09962bb0"], colores: [["Serpiente", "#8a7457"]], tallas: ["S", "M"], stock: { aqp: 3, tru: 1 }, desc: "Corset de estampado serpiente con lazo en el pecho." },
    { id: "crop", nombre: "Crop Manga Corta Cuello V", cat: "tops", precio: 55, foto: ["ea5ea8e9-e35a-4d71-9982-60a190b16104"], colores: [["Negro", "#1f1d1c"], ["Blanco", "#f3f2ee"]], tallas: ["S", "M", "L"], stock: { aqp: 11, tru: 5 }, desc: "Crop top de manga corta y cuello en V." },
    { id: "amarre", nombre: "Camisa M/corta con Amarre", cat: "blusas", precio: 95, puesto: 5, foto: ["396af535-07f0-4023-af93-d7edc6d6b5d8"], colores: [["Celeste", "#bfd5ea"]], tallas: ["S", "M", "L"], stock: { aqp: 4, tru: 0 }, desc: "Camisa de manga corta con amarre en la cintura." },
    { id: "wide", nombre: "Wide Leg Semi Cadera", cat: "pantalones", precio: 145, foto: ["d8ead783-7561-44a6-9cb2-dd98bd6a694f"], colores: [["Azul medio", "#6e8fb5"]], tallas: ["26", "28", "30"], stock: { aqp: 3, tru: 4 }, desc: "Pantalón wide leg de tiro semicadera en denim azul medio." },
    { id: "short-lino", nombre: "Short Lino con Pretina Blanca", cat: "faldas", precio: 79, pct: 15, foto: ["7704cde3-6d48-43d6-ae0d-89ab9aedf5af"], colores: [["Chocolate", "#5a4030"]], tallas: ["S", "M", "L"], stock: { aqp: 2, tru: 3 }, desc: "Short de lino con pretina blanca y bolsillos." },
  ];

  // La campaña vigente: termina dentro de 2 días, 7 horas y 14 minutos (así la cuenta regresiva se ve viva en cada apertura).
  const campana = { nombre: "Aniversario CAYLA", pct: 15, hasta: Date.now() + ((2 * 24 + 7) * 60 + 14) * 60 * 1000 };

  const categorias = [
    ["todo", "Todo"], ["blusas", "Blusas y camisas"], ["tops", "Polos y tops"], ["pantalones", "Pantalones"], ["faldas", "Faldas y shorts"], ["corsets", "Corsets"],
  ];
  // El menú «Ropa» de la cabecera: sus grupos y las categorías de cada uno.
  const menuRopa = [["Arriba", ["blusas", "tops", "corsets"]], ["Abajo", ["pantalones", "faldas"]]];

  const tiendas = [
    { id: "aqp", ciudad: "Arequipa", direccion: "Calle Bolívar 400-A", horario: "Lunes a sábado, 14:00 a 22:00", whatsapp: "953 585 537" },
    { id: "tru", ciudad: "Trujillo", direccion: "Sinchi Roca 1043", horario: "Lunes a sábado, 08:30 a 20:15 · domingos, 09:30 a 18:15", whatsapp: "967 924 072" },
  ];

  const looks = [
    { n: 1, titulo: "Chocolate y celeste", prendas: ["kalessi", "tiana"] },
    { n: 2, titulo: "Rojo y gris", prendas: ["alba", "strend"] },
    { n: 3, titulo: "Rayas y lino", prendas: ["rayas", "short-lino"] },
    { n: 4, titulo: "Negro con café", prendas: ["crop", "luna"] },
  ];

  // El texto real de «Así se separa» (components/AsiSeSepara.tsx): el orden es el camino real de una separación (ADR-0408).
  const pasos = [
    ["Entra o crea tu cuenta", "Con tu correo, en un minuto."],
    ["Elige tu prenda y tu talla", "En cada prenda ves cuánto hay en tu tienda."],
    ["Toca «Separar» y mándalo por WhatsApp", "El mensaje ya va escrito. No pagas nada en la web."],
    ["Paga y recógelo", "Coordinas el pago con la tienda y lo recoges con tu código."],
  ];
  // Los cuatro beneficios del Club (components/SeccionClub.tsx).
  const club = [
    ["Puntos en cada compra", "Cada compra suma puntos que valen en tienda y en la web."],
    ["Regalo en tu cumpleaños", "Un regalo de puntos el mes de tu cumpleaños."],
    ["Lo nuevo, primero", "Lo ves aquí apenas llega a las tiendas."],
    ["Tus pedidos en un lugar", "Ves cada separación, si ya la confirmaron y cuánto falta."],
  ];

  // Lo que hay en «Mi perfil» de una miembro de ejemplo.
  const yo = {
    nombre: "Camila", apellido: "Quispe", correo: "camila@gmail.com", desde: 2026, numero: "0001 4827",
    puntos: { saldo: 1240, vale: 24.8, regalo: 200, cumple: "14 de noviembre", pierdeEl: "30 de octubre de 2028" },
    cupones: [{ codigo: "ANIV-7K2P", texto: "S/ 10 de descuento en tu bolsa", estado: "activo" }],
    movimientos: [["Compra en Arequipa", "+119", "12 oct"], ["Canje: cupón de S/ 10", "−500", "03 oct"], ["Regalo de bienvenida", "+200", "28 sep"]],
    pedidos: [
      { n: "0042", estado: "por-confirmar", tienda: "aqp", prendas: [["kalessi", "Chocolate", "M"], ["tiana", "Celeste", "28"]], fecha: "Hoy" },
      { n: "0038", estado: "lista", tienda: "aqp", prendas: [["rayas", "Blanco a rayas", "S"]], fecha: "Ayer", codigo: "K7-48" },
      { n: "0031", estado: "recogida", tienda: "tru", prendas: [["crop", "Negro", "M"], ["luna", "Café", "S"]], fecha: "8 oct" },
    ],
    favoritos: ["alba", "luna", "wide"],
  };

  const ESTADOS_PEDIDO = { "por-confirmar": ["Por confirmar", "La tienda la confirma por WhatsApp."], lista: ["Lista para recoger", "Tu código para recogerla:"], recogida: ["Recogida", "Gracias por tu compra."] };

  const deEjemplo = { numero: "0042" };

  // ── Ayudas ────────────────────────────────────────────────────────────────────────────────────────────────────────
  const prenda = (id) => prendas.find((p) => p.id === id) || prendas[0];
  const foto = (p, i = 0) => FOTOS + p.foto[i] + ".jpg";
  const soles = (n) => "S/ " + (Math.round(n * 100) % 100 === 0 ? Math.round(n).toLocaleString("es-PE") : n.toFixed(2).replace(".", ","));
  // El precio que paga el cliente: con la campaña, el descuento; `antes` es lo que costaría sin ella.
  const precio = (p) => (p.pct ? { principal: Math.round(p.precio * (1 - p.pct / 100)), antes: p.precio, oferta: true, pct: p.pct } : { principal: p.precio, antes: null, oferta: false, pct: 0 });
  // Cuánto hay de cada talla en una tienda: el total de la prenda repartido (de ejemplo, siempre igual para la misma prenda).
  const PESOS = [0.2, 0.4, 0.3, 0.1];
  function stockPorTalla(p, tienda) {
    const total = p.stock[tienda];
    const k = p.tallas.length;
    const pesos = p.tallas.map((_, i) => PESOS[Math.min(i, 3)] + (i === 1 ? 0.05 : 0));
    const suma = pesos.reduce((a, b) => a + b, 0);
    const out = {};
    let resto = total;
    p.tallas.forEach((t, i) => { const n = i === k - 1 ? resto : Math.min(resto, Math.round((total * pesos[i]) / suma)); out[t] = n; resto -= n; });
    return out;
  }
  const nivel = (n) => (n <= 0 ? "—" : n === 1 ? "Última" : n <= 3 ? String(n) : "Hay");
  const nivelFrase = (n) => (n <= 0 ? "No hay" : n === 1 ? "Queda la última" : n <= 3 ? `Quedan ${n}` : "Hay");
  const nombreCat = (c) => (categorias.find((x) => x[0] === c) || ["", ""])[1];
  const tienda = (id) => tiendas.find((t) => t.id === id) || tiendas[0];
  const totalHay = (p, t) => p.stock[t];

  window.CAYLA = { prendas, categorias, menuRopa, tiendas, looks, pasos, club, yo, ESTADOS_PEDIDO, campana, deEjemplo, prenda, foto, soles, precio, stockPorTalla, nivel, nivelFrase, nombreCat, tienda, totalHay };
})();
