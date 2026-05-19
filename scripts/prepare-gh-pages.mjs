import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const adminDist = path.join(rootDir, "Panel Administrativo ERP", "dist");
const mobileDist = path.join(rootDir, "Prototipo App Choferes Transporte", "dist");
const outDir = path.join(rootDir, "gh-pages-dist");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  ensureDir(dirPath);
}

function copyDir(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

if (!fs.existsSync(adminDist) || !fs.existsSync(mobileDist)) {
  throw new Error("No se encontraron los dist de admin/mobile. Ejecuta primero ambos builds.");
}

cleanDir(outDir);
copyDir(adminDist, path.join(outDir, "admin"));
copyDir(mobileDist, path.join(outDir, "mobile"));

writeFile(
  path.join(outDir, "index.html"),
  `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Transporte Fighiera — Prototipos</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 32px; background: #f5f5f5; color: #333; }
      a { display: block; margin: 8px 0; font-size: 18px; }
    </style>
  </head>
  <body>
    <h1>Transporte Fighiera — Prototipos</h1>
    <a href="./admin/">Abrir Panel Administrativo</a>
    <a href="./mobile/">Abrir App Movil Choferes</a>
    <p>Importante: abrir ambos desde este mismo dominio para compartir localStorage.</p>
  </body>
</html>`,
);

writeFile(path.join(outDir, ".nojekyll"), "");

console.log("Build de GitHub Pages listo en:", outDir);
