// Datos de la maqueta del rediseño de la tienda (2026-10-17).
// REAL: los nombres y las fotos de las prendas, tal como salen en la portada pública de tienda.cayla.pe (las fotos se leen
// de su almacén público; no se copian al repo), las dos tiendas que muestra la web y cómo funciona separar.
// DE EJEMPLO: precios, colores de más, tallas, stock por tienda, looks y el número de la separación.
(function () {
  const FOTOS = "https://vovjyyiafkxteijimpuy.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/";

  const prendas = [
    { id: "kalessi", nombre: "Blusa Kalessi", cat: "blusas", precio: 119, foto: ["9afb4280-1866-466c-bad1-8a635f45bdea"], colores: [["Chocolate", "#4e3a2e"], ["Marfil", "#ece6da"]], tallas: ["S", "M", "L"], stock: { aqp: 3, tru: 1 } },
    { id: "tiana", nombre: "Palazo Tiana", cat: "pantalones", precio: 139, foto: ["984f73d6-ce8f-45f2-b7b3-c42ae98f4f06"], colores: [["Celeste", "#a9c3dd"]], tallas: ["26", "28", "30", "32"], stock: { aqp: 5, tru: 2 } },
    { id: "alba", nombre: "Corset Alba", cat: "corsets", precio: 99, foto: ["7b4450d9-fb1c-4eab-92a7-843d7de778af"], colores: [["Rojo", "#d42a2a"], ["Negro", "#1f1d1c"]], tallas: ["S", "M"], stock: { aqp: 1, tru: 0 } },
    { id: "strend", nombre: "Pantalón Sastre Strend", cat: "pantalones", precio: 149, foto: ["6e022b5c-51ae-4ef1-87b5-10b4d69a5d20"], colores: [["Gris oliva", "#5e6157"], ["Negro", "#1f1d1c"], ["Beige", "#cdbb9f"]], tallas: ["S", "M", "L", "XL"], stock: { aqp: 4, tru: 3 } },
    { id: "luna", nombre: "Falda Luna", cat: "faldas", precio: 89, foto: ["eeb109f1-d55d-48dc-bfea-e2b5c469b740", "25f986b5-ed42-4923-bb39-4a08c1888f99"], colores: [["Café", "#6a5240"]], tallas: ["S", "M", "L"], stock: { aqp: 2, tru: 4 } },
    { id: "semicadera", nombre: "Palazo Semicadera", cat: "pantalones", precio: 139, foto: ["773bebab-3304-4d95-87f8-c56282f475a7"], colores: [["Azul", "#5b7fa8"]], tallas: ["26", "28", "30", "32"], stock: { aqp: 6, tru: 5 } },
    { id: "cuello-v", nombre: "Camiseta Cuello V Cruzado", cat: "tops", precio: 59, foto: ["42ed56a1-62a4-450f-a02b-5475649e4fd3"], colores: [["Amarillo", "#efe2a2"], ["Blanco", "#f3f2ee"], ["Negro", "#1f1d1c"]], tallas: ["S", "M", "L"], stock: { aqp: 7, tru: 6 } },
    { id: "rayas", nombre: "Camisa Rayas Larga", cat: "blusas", precio: 109, foto: ["05de55d0-1588-4d45-b740-772a65d3b083"], colores: [["Blanco a rayas", "#e9edf1"]], tallas: ["S", "M", "L"], stock: { aqp: 0, tru: 2 } },
    { id: "olenka", nombre: "Corset Olenka", cat: "corsets", precio: 109, foto: ["8f41cefc-d7fb-4244-8bcc-622f09962bb0"], colores: [["Serpiente", "#8a7457"]], tallas: ["S", "M"], stock: { aqp: 2, tru: 1 } },
    { id: "crop", nombre: "Crop Manga Corta Cuello V", cat: "tops", precio: 55, foto: ["ea5ea8e9-e35a-4d71-9982-60a190b16104"], colores: [["Negro", "#1f1d1c"], ["Blanco", "#f3f2ee"]], tallas: ["S", "M", "L"], stock: { aqp: 8, tru: 4 } },
    { id: "amarre", nombre: "Camisa M/corta con Amarre", cat: "blusas", precio: 95, foto: ["396af535-07f0-4023-af93-d7edc6d6b5d8"], colores: [["Celeste", "#bfd5ea"]], tallas: ["S", "M", "L"], stock: { aqp: 3, tru: 0 } },
    { id: "wide", nombre: "Wide Leg Semi Cadera", cat: "pantalones", precio: 145, foto: ["d8ead783-7561-44a6-9cb2-dd98bd6a694f"], colores: [["Azul medio", "#6e8fb5"]], tallas: ["26", "28", "30"], stock: { aqp: 2, tru: 3 } },
    { id: "short-lino", nombre: "Short Lino con Pretina Blanca", cat: "faldas", precio: 79, foto: ["7704cde3-6d48-43d6-ae0d-89ab9aedf5af"], colores: [["Chocolate", "#5a4030"]], tallas: ["S", "M", "L"], stock: { aqp: 1, tru: 2 } },
  ];

  const categorias = [
    ["todo", "Todo"], ["blusas", "Blusas y camisas"], ["tops", "Polos y tops"], ["pantalones", "Pantalones"], ["faldas", "Faldas y shorts"], ["corsets", "Corsets"],
  ];

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

  // El orden importa: es el camino real de una separación (ADR-0408).
  const pasos = [
    ["Crea tu cuenta", "Con tu correo, tu DNI, tu celular y tu cumpleaños. Al crearla ya eres miembro del Club CAYLA."],
    ["Elige tus prendas y tu tienda", "En cada prenda ves cuánto hay en Arequipa y en Trujillo."],
    ["Separa y mándalo por WhatsApp", "Te armamos el mensaje con tu número de separación. La tienda la confirma y te guarda las prendas."],
    ["Paga y recógelo", "Pagas en la tienda, al recoger. Nada se cobra en la web."],
  ];

  const club = [
    ["Descuento en tu cumpleaños", "Te lo recordamos por WhatsApp y lo ves en tu cuenta."],
    ["Un vale por cada año", "Cada aniversario con CAYLA suma un vale de compra."],
    ["Lo nuevo, primero", "Lo ves aquí apenas llega a las tiendas."],
    ["Tus separaciones en un lugar", "Ves cada una, si ya la confirmaron y cuánto falta pagar."],
  ];

  const deEjemplo = { numero: "0042" };

  function prenda(id) { return prendas.find((p) => p.id === id) || prendas[0]; }
  function foto(p, i = 0) { return FOTOS + p.foto[i] + ".jpg"; }
  function precio(n) { return "S/ " + n.toLocaleString("es-PE"); }
  function stockTexto(n) { return n <= 0 ? "—" : n === 1 ? "Última" : n <= 3 ? String(n) : "Hay"; }
  function stockFrase(n) { return n <= 0 ? "No hay" : n === 1 ? "Queda la última" : n <= 3 ? `Quedan ${n}` : "Hay"; }
  function nombreCat(c) { return (categorias.find((x) => x[0] === c) || ["", ""])[1]; }

  window.CAYLA = { prendas, categorias, tiendas, looks, pasos, club, deEjemplo, prenda, foto, precio, stockTexto, stockFrase, nombreCat };
})();
