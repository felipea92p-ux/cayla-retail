// Dibuja íconos de lucide como SVG en texto (para las demos de la página de elegir). Uso: import { svg } from "./svg.mjs"; svg("Search", 16, 2)
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as L from "lucide-react";
export const svg = (nombre, tam = 16, trazo = 2, clase = "") => renderToStaticMarkup(createElement(L[nombre], { size: tam, strokeWidth: trazo, "aria-hidden": true, className: clase }));
