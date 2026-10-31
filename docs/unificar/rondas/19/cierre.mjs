// Archivos de components/ que solo usan las pantallas de un módulo (cierre de imports desde sus page.tsx; la raíz va en RAIZ, una regex).
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
const raiz = process.cwd();
const todos = [];
const andar = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (!/node_modules|\.next|\.salida/.test(p)) andar(p); } else if (/\.tsx?$/.test(f)) todos.push(relative(raiz, p)); } };
andar("app"); andar("components");
const resolver = (desde, spec) => {
  let base = spec.startsWith("@/") ? join(raiz, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(join(raiz, desde)), spec) : null;
  if (!base) return null;
  for (const ext of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) if (existsSync(base + ext) && statSync(base + ext).isFile()) return relative(raiz, base + ext);
  return null;
};
const imports = new Map();
for (const f of todos) {
  const s = readFileSync(f, "utf8");
  imports.set(f, [...s.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => resolver(f, m[1])).filter((x) => x && (x.startsWith("components/") || x.startsWith("app/"))));
}
const esVentas = (f) => new RegExp(process.env.RAIZ ?? "^app/\\(app\\)/(vender|cambios|devoluciones)/").test(f);
const raices = todos.filter(esVentas);
const cierre = new Set(raices);
const cola = [...raices];
while (cola.length) { const f = cola.pop(); for (const i of imports.get(f) ?? []) if (!cierre.has(i) && i.startsWith("components/") && !i.startsWith("components/ui/")) { cierre.add(i); cola.push(i); } }
// Importadores de fuera de Ventas: si alguien de fuera (que no está en el cierre) lo importa, es compartido.
const fuera = new Set();
for (const [f, is] of imports) if (!cierre.has(f)) for (const i of is) if (cierre.has(i)) fuera.add(i);
const propios = [...cierre].filter((f) => !fuera.has(f)).sort();
console.log(propios.join("\n"));
console.error("compartidos:", [...fuera].sort().join(" "));
