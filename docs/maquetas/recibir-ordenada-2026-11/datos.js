// El envío de la maqueta: el mismo que se sembró en la base local aislada para mirar la pantalla real (ENV-000002, Gamarra Textil SAC → Tienda Lima).
// Datos inventados. `contadas: null` = todavía nadie lo contó. `rep` = lo repartido por color|talla (solo si eligió tallas y colores ahora).
window.DATOS = {
  sede: "Tienda Lima",
  envio: "ENV-000002",
  guia: "T001-000342",
  proveedor: "Gamarra Textil SAC",
  marca: "CAYLA",
  quien: { nombre: "Felipe", iniciales: "FA", admin: true },
  despachadoPor: "Felipe Alvarez",
  fecha: "miércoles, 11 de noviembre",
  modelos: [
    { id: "quoy", cat: "Tops", nombre: "Top Quoy", tipo: "nuevo", dijeron: 6, contadas: null, modo: null, costo: "24.00",
      tallas: ["S", "M"], colores: [["Beige", "#D5BA98"]], rep: {}, hex: "#e5dbd2" },
    { id: "asora", cat: "Tops", nombre: "Top Asora", tipo: "nuevo", dijeron: 7, contadas: null, modo: null, costo: "26.00",
      tallas: ["S", "M"], colores: [["Blanco", "#F4F9FF"], ["Negro", "#2D2C2F"]], rep: {}, hex: "#e5dbd2" },
    { id: "lunares", cat: "Tops", nombre: "Top Estampado con Lunares", tipo: "restock", dijeron: 10, contadas: 10, modo: "ahora", costo: "28.00",
      tallas: ["S", "M"], colores: [["Azul zafiro", "#1F3F8F"], ["Azul", "#2F6AA3"], ["Blanco", "#F4F9FF"], ["Cafe", "#6A4A3C"], ["Negro", "#2D2C2F"]],
      rep: { "Blanco|S": 7 }, hex: "#e5dbd2", lunares: true },
    { id: "carla", cat: "Pantalones", nombre: "Pantalón Carla", tipo: "restock", dijeron: 4, contadas: null, modo: null, costo: "45.00",
      tallas: ["28", "30", "32"], colores: [["Beige", "#D5BA98"], ["Negro", "#2D2C2F"]], rep: {}, hex: "#e5dbd2" },
  ],
  // Las tallas que la categoría ofrece además de las de siempre (para «+ Talla»).
  tallasDeMas: { Tops: ["XS", "L", "XL"], Pantalones: ["26", "34"] },
  coloresDeMas: [["Crudo", "#F3ECE0"], ["Gris", "#848587"], ["Camel", "#B0885B"], ["Rojo", "#BD332D"], ["Verde", "#487D49"]],
};
