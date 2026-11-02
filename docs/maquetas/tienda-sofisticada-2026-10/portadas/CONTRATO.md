# Contrato entre la base I y sus portadas (2026-10-31)

`i-tienda.html` es la base; cada portada del inicio vive en su propio archivo de esta carpeta y habla con la base solo por lo que dice aquí.
Así se hicieron las tres en paralelo, y así se agrega una cuarta sin tocar las demás.

## Lo que la base define antes de cargar las portadas

```js
window.TIENDA = {
  prendas,              // window.PRENDAS tal cual (datos.js)
  P,                    // { [id]: prenda }
  looks,                // [{ n, f, en: [ids], con: [ids] }] los 4 looks de ejemplo
  foto(f),              // "f37" → "../tienda-editorial-2026-10/fotos/f37.jpg"
  sol(n),               // 69.9 → "S/ 69.90"
  stockTexto(p),        // texto de stock para la tienda elegida («Pregunta en tu tienda» si no hay dato)
  claseStock(p),        // "hay" | "pocas" | "ultima" | "sin"
  sede(),               // "Arequipa" | "Trujillo" | "Lima"
  cambiarSede(nombre),  // cambia la sede de toda la tienda (cabecera incluida) y avisa a los suscritos
  alCambiarSede(fn),    // fn(nombre) cada vez que cambia; devuelve una función para desuscribirse
  tiendas,              // [{ nombre, direccion, horario }] reales
  abierta(nombre),      // { abierta, texto: "Abierta hasta las 10 p. m." | "Abre mañana a las 2 p. m." } con la hora de Lima
  agregar(id, desdeEl), // la prenda vuela desde desdeEl a la bolsa y el número rueda
  agregarVarias(ids, desdeEl),
  ir(vista, opc),       // "inicio" | "nuevo" | "catalogo" | "ficha"; opc: { cat, id, filtro: "pocas", ancla } — con el telón
  nuevas(sede),         // las prendas que «Lo nuevo» cuenta como llegadas esta semana (fechas de ejemplo)
  revelar(raiz),        // suma los .revela de raiz al revelado al bajar
  contar(el),           // corre la cifra de un [data-cuenta][data-pref][data-dec]
  reducido,             // true si el aparato pide reducir movimiento
};
window.PORTADAS = window.PORTADAS || {};
```

## Lo que registra cada portada

```js
window.PORTADAS.<clave> = { nombre: "Probador", montar(raiz, T) { … }, desmontar() { … } };
```

- `raiz` es `<section id="portada">` vacío, a todo el ancho, justo bajo la cabecera fija (alto `var(--cab)`).
- Mete su CSS una vez con `<style id="estilo-<clave>">`, todo bajo `.portada-<clave>`, con SOLO estos tokens (la base los define en claro y
  oscuro): `--fondo --papel --placa --tinta --tenue --linea --acento --verde --ocre --sombra --display --texto --ease --g --cab`.
  `--placa` es la placa clara bajo cada recorte y sigue clara en oscuro; los recortes del ERP van sobre ella con `mix-blend-mode: multiply`.
  `--acento` es el rojo CAYLA: solo señales chicas.
- `desmontar()` quita listeners, observadores y timers. La base vacía `raiz`.

## Cómo las carga la base

- Lee `?portada=probador|frase|ocasion` (por defecto `probador`); la barra de la maqueta tiene «Portada: Probador · Frase · Ocasión», que
  cambia sin recargar (desmontar → vaciar → montar) y actualiza la URL.
- Cada archivo se trae con `fetch` y corre dentro de `new Function`: dos portadas pueden repetir nombres arriba sin chocar. Por eso la
  maqueta se abre servida (`http://`), no con doble clic.
- Una portada puede usar las clases de la base `.btn`, `.btn-lleno`, `.btn-borde`, `.iman`, `.pildora`, `.rotulo`, `.display`, `.revela`, y
  los atributos `data-ir`, `data-id`, `data-cat`, `data-filtro` y `data-ancla` en un enlace.

## Reglas para todas

Cursor normal siempre (nunca `cursor: none`). Marcellus para títulos, en oración; Karla para el texto. Movimiento: una vez, sin rebote, sin
bucle; todo se apaga con `prefers-reduced-motion`; todo `:hover` dentro de `@media (hover: hover)`. Sin desborde horizontal a 390 px.
Español, «cliente», «tienda»; nunca «clienta». Nada de «Hecho en nuestro taller». Lo inventado lleva su marca «de ejemplo».
