const fs = require("fs");
const path = require("path");

const assetsDir =
  process.env.CURSOR_ASSETS ||
  path.join(
    process.env.USERPROFILE || "",
    ".cursor",
    "projects",
    "c-Users-user-Desktop-Argentina-Prototipo-Transporte-Fighera",
    "assets",
  );

const root = path.join(__dirname, "..");
const preferred = process.argv[2];

function pickSource() {
  if (preferred && fs.existsSync(preferred)) return preferred;
  if (!fs.existsSync(assetsDir)) return null;
  const files = fs.readdirSync(assetsDir).filter((f) => f.includes("removebg") && f.endsWith(".png"));
  if (!files.length) return null;
  files.sort((a, b) => fs.statSync(path.join(assetsDir, b)).mtimeMs - fs.statSync(path.join(assetsDir, a)).mtimeMs);
  return path.join(assetsDir, files[0]);
}

const src = pickSource();
if (!src) {
  console.error("No se encontró el PNG en", assetsDir);
  process.exit(1);
}

const dests = [
  path.join(root, "Panel Administrativo ERP", "src", "assets", "brand", "logo-transporte-fighera.png"),
  path.join(root, "Prototipo App Choferes Transporte", "src", "assets", "brand", "logo-transporte-fighera.png"),
  path.join(root, "Panel Administrativo ERP", "public", "favicon.png"),
  path.join(root, "Prototipo App Choferes Transporte", "public", "favicon.png"),
];

for (const dest of dests) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log("OK", dest, fs.statSync(dest).size);
}
