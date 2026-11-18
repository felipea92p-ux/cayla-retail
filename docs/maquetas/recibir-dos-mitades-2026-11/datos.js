// El envío de la maqueta: el mismo que se sembró en la base local aislada para mirar la pantalla real (ENV-000002, Gamarra Textil SAC → Tienda Lima).
// Datos inventados. `contadas: null` = todavía nadie lo contó. `rep` = lo repartido por color|talla.
window.DATOS2 = {
  sede: "Tienda Lima",
  envio: "ENV-000002",
  guia: "T001-000342",
  proveedor: "Gamarra Textil SAC",
  marca: "CAYLA",
  quien: { nombre: "Felipe", iniciales: "FA" },
  despachadoPor: "Felipe Alvarez",
  fecha: "miércoles, 11 de noviembre",
  modelos: [
    { id: "quoy", cat: "Tops", nombre: "Top Quoy", tipo: "nuevo", dijeron: 6, contadas: null, modo: null, costo: "24.00",
      tallas: ["S", "M"], colores: [["Beige", "#D5BA98"]], rep: {} },
    { id: "asora", cat: "Tops", nombre: "Top Asora", tipo: "nuevo", dijeron: 7, contadas: null, modo: null, costo: "26.00",
      tallas: ["S", "M"], colores: [["Blanco", "#F4F9FF"], ["Negro", "#2D2C2F"]], rep: {} },
    { id: "lunares", cat: "Tops", nombre: "Top Estampado con Lunares", tipo: "restock", dijeron: 10, contadas: 10, modo: "ahora", costo: "28.00",
      tallas: ["S", "M"], colores: [["Azul zafiro", "#1F3F8F"], ["Azul", "#2F6AA3"], ["Blanco", "#F4F9FF"], ["Café", "#6A4A3C"], ["Negro", "#2D2C2F"]],
      rep: { "Blanco|S": 7 }, lunares: true },
    { id: "carla", cat: "Pantalones", nombre: "Pantalón Carla", tipo: "restock", dijeron: 4, contadas: null, modo: null, costo: "45.00",
      tallas: ["28", "30", "32"], colores: [["Beige", "#D5BA98"], ["Negro", "#2D2C2F"]], rep: {} },
  ],
  // Lo que ofrece la carta además de lo que ya tiene la prenda (para «+ Talla» y «+ Color»).
  tallasDeMas: { Tops: ["XS", "L", "XL"], Pantalones: ["26", "34"], Vestidos: ["XS", "L"], Blusas: ["XS", "L"], Casacas: ["L", "XL"], Faldas: ["XS", "L"] },
  ordenTallas: ["XS", "S", "M", "L", "XL", "26", "28", "30", "32", "34"],
  coloresDeMas: [["Crudo", "#F3ECE0"], ["Gris", "#848587"], ["Camel", "#B0885B"], ["Rojo", "#BD332D"], ["Verde", "#487D49"], ["Rosa", "#E7B7B0"]],
  // Prendas del catálogo que se parecen a lo que se escribe (para «Llegó algo que no está en la lista» y «Es otra prenda»).
  catalogo: [
    { nombre: "Top Halter Marfil", cat: "Tops" }, { nombre: "Top Canalé Básico", cat: "Tops" }, { nombre: "Top Asimétrico Noche", cat: "Tops" },
    { nombre: "Pantalón Mía", cat: "Pantalones" }, { nombre: "Pantalón Palazzo Brisa", cat: "Pantalones" }, { nombre: "Blusa Emma", cat: "Blusas" }, { nombre: "Blusa Valentina", cat: "Blusas" },
  ],
  // Un ejemplo de nombre según la categoría elegida (regla «Sugerencias coherentes», ADR-0290).
  ejemploDeNombre: { Tops: "Ej. Top tejido manga corta", Pantalones: "Ej. Pantalón recto con pinzas", Blusas: "Ej. Blusa de lino manga globo", Vestidos: "Ej. Vestido midi cruzado", Casacas: "Ej. Casaca corta de drill", Faldas: "Ej. Falda plisada midi" },
  notasFrecuentes: ["Llegó en dos bolsas", "Etiquetas cambiadas", "Caja golpeada", "Faltaba la guía"],
};
