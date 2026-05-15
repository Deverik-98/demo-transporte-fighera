const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const adminDist = path.join(root, "Panel Administrativo ERP", "dist");
const mobileDist = path.join(root, "Prototipo App Choferes Transporte", "dist");
const port = 5180;

function sendFile(res, filePath, contentType = "text/html") {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

function contentTypeByExt(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".ico")) return "image/x-icon";
  return "text/plain; charset=utf-8";
}

function serveStatic(baseDir, reqPath, res) {
  const relative = reqPath.replace(/^\/+/, "");
  const safeRelative = path.normalize(relative).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(baseDir, safeRelative);
  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) {
      sendFile(res, filePath, contentTypeByExt(filePath));
      return;
    }
    sendFile(res, path.join(baseDir, "index.html"));
  });
}

function serveSharedAsset(reqPath, res) {
  const relative = reqPath.replace(/^\/+/, "");
  const safeRelative = path.normalize(relative).replace(/^(\.\.(\/|\\|$))+/, "");
  const adminAsset = path.join(adminDist, safeRelative);
  const mobileAsset = path.join(mobileDist, safeRelative);

  fs.stat(adminAsset, (adminErr, adminStat) => {
    if (!adminErr && adminStat.isFile()) {
      sendFile(res, adminAsset, contentTypeByExt(adminAsset));
      return;
    }
    fs.stat(mobileAsset, (mobileErr, mobileStat) => {
      if (!mobileErr && mobileStat.isFile()) {
        sendFile(res, mobileAsset, contentTypeByExt(mobileAsset));
        return;
      }
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Asset no encontrado");
    });
  });
}

const server = http.createServer((req, res) => {
  const url = req.url || "/";

  if (url === "/" || url.startsWith("/?")) {
    res.writeHead(302, { Location: "/admin/" });
    res.end();
    return;
  }

  if (url === "/admin" || url.startsWith("/admin?")) {
    res.writeHead(302, { Location: "/admin/" });
    res.end();
    return;
  }

  if (url === "/mobile" || url.startsWith("/mobile?")) {
    res.writeHead(302, { Location: "/mobile/" });
    res.end();
    return;
  }

  if (url.startsWith("/assets/")) {
    serveSharedAsset(url, res);
    return;
  }

  if (url.startsWith("/admin/")) {
    const reqPath = url.replace("/admin/", "");
    serveStatic(adminDist, reqPath, res);
    return;
  }

  if (url.startsWith("/mobile/")) {
    const reqPath = url.replace("/mobile/", "");
    serveStatic(mobileDist, reqPath, res);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Ruta no encontrada. Usa /admin/ o /mobile/");
});

server.listen(port, () => {
  console.log(`Unified prototypes server running on http://localhost:${port}`);
  console.log(`Admin:  http://localhost:${port}/admin/`);
  console.log(`Mobile: http://localhost:${port}/mobile/`);
});
