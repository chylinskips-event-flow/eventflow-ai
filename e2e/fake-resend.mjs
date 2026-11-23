// Atrapa API Resend dla testów E2E. Aplikacja wysyła tu maile przez RESEND_BASE_URL,
// więc nic nie wychodzi do prawdziwych adresów. Testy czytają wysłane maile przez GET /__messages.
import http from "node:http";

const port = Number(process.argv[2] ?? 3199);
const messages = [];

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (req.method === "GET" && url.pathname === "/__health") return send(res, 200, { ok: true });
    if (req.method === "GET" && url.pathname === "/__messages") {
      const to = url.searchParams.get("to");
      return send(res, 200, to ? messages.filter((m) => [].concat(m.to).includes(to)) : messages);
    }
    if (req.method === "DELETE" && url.pathname === "/__messages") {
      messages.length = 0;
      return send(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/emails") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const payload = JSON.parse(body || "{}");
        const id = `e2e-${messages.length + 1}`;
        messages.push({
          id,
          to: payload.to,
          from: payload.from,
          subject: payload.subject,
          html: payload.html,
          attachments: (payload.attachments ?? []).map((a) => ({ filename: a.filename, contentId: a.content_id ?? a.contentId })),
        });
        send(res, 200, { id });
      });
      return;
    }
    send(res, 404, { message: "not found" });
  })
  .listen(port, "127.0.0.1");
