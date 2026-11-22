import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const root = new URL("../", import.meta.url);
const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };

// Serve only the site's public files. The repo also contains server-side code.
export async function startPracticeServer() {
  const server = createServer(async (req, res) => {
    try {
      let path = new URL(req.url, "http://localhost").pathname;
      if (path === "/apply" || path === "/practice") path += "/";
      if (path.endsWith("/")) path += "index.html";
      const publicPath = /^\/(?:index\.html|styles\.css|(?:js|practice|apply|auth\/callback)\/[\w-]+\.(?:html|css|js))$/;
      if (req.method !== "GET" || !publicPath.test(path)) {
        res.writeHead(404).end();
        return;
      }
      const body = await readFile(new URL(path.slice(1), root));
      res.writeHead(200, { "Content-Type": mime[extname(path)] + "; charset=utf-8" }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    origin: "http://127.0.0.1:" + server.address().port,
    close: () => new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())),
  };
}
