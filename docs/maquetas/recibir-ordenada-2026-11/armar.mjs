// Arma index.html y marcos.js con el MARCO REAL del ERP (lateral y cabecera capturados del DOM de local), abierto y plegado.
//   node docs/maquetas/recibir-ordenada-2026-11/armar.mjs
// Entra: marco-antes.html / marco-antes-plegado.html (lo que va antes del <main> en cada captura) y marco-despues.html. Sin dependencias.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const lee = (n) => (fs.existsSync(path.join(aqui, n)) ? fs.readFileSync(path.join(aqui, n), "utf8") : "");
const abierto = lee("marco-antes.html");
const plegado = lee("marco-antes-plegado.html") || abierto;
const despues = lee("marco-despues.html");

// El <main> real: las mismas clases (el margen del lateral, el aire de arriba y de abajo). `data-fondo-hoja` lo pone la pantalla.
const main = `<main id="maqueta" data-fondo-hoja="true" class="px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-[calc(5rem+env(safe-area-inset-top))] sm:ml-lateral sm:pl-5 sm:pr-[max(2.5rem,env(safe-area-inset-right))] sm:pb-[calc(3rem+env(safe-area-inset-bottom))] sm:pt-[calc(6rem+env(safe-area-inset-top))]"></main>`;

fs.writeFileSync(path.join(aqui, "marcos.js"), `// Generado por armar.mjs: el marco real del ERP, abierto y con el lateral plegado. No editar a mano.\nwindow.MARCOS = ${JSON.stringify({ abierto, plegado, main, despues })};\n`);

const html = `<!doctype html>
<html lang="es" class="eb_garamond_f19dc1cf-module__ZEdURa__variable dm_sans_822025aa-module__BMxp8G__variable" data-tema="claro" data-movimiento="vivo">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Maqueta · Recibir mercadería, ordenada — CAYLA</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="app.css">
<link rel="stylesheet" href="maqueta.css">
</head>
<body class="antialiased">
<div id="capas"></div>
<script src="marcos.js"></script>
<script src="iconos.js"></script>
<script src="datos.js"></script>
<script src="maqueta.js"></script>
</body>
</html>
`;
fs.writeFileSync(path.join(aqui, "index.html"), html);
console.log("index.html", html.length, "bytes · marcos.js", abierto.length, "+", plegado.length);
