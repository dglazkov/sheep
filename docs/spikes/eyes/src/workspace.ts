// A fake sheep workspace: a few files a sheep might have written, with relative
// assets, a fetch of its own JSON, and a deliberate runtime error to see whether
// the eyes report it.
export const WORKSPACE: Record<string, { type: string; body: string }> = {
  "/index.html": {
    type: "text/html; charset=utf-8",
    body: `<!doctype html><html><head><meta charset="utf-8"><title>counter</title>
<link rel="stylesheet" href="style.css"><script type="module" src="app.js"></script></head>
<body><main><h1>Counter</h1><button id="inc">+1</button><output id="n">0</output>
<ul id="items"></ul></main></body></html>`,
  },
  "/style.css": {
    type: "text/css",
    body: `body{font-family:system-ui,sans-serif;background:#0b1020;color:#e8ecff;margin:0}
main{max-width:480px;margin:40px auto;padding:24px;border:1px solid #334;border-radius:12px}
button{font-size:20px;padding:8px 16px;border-radius:8px;border:0;background:#5b7cff;color:#fff}
output{margin-left:16px;font-size:28px;font-variant-numeric:tabular-nums}
li{padding:4px 0;border-bottom:1px dashed #334}`,
  },
  "/app.js": {
    type: "text/javascript",
    body: `const n = document.getElementById("n"); let count = 0;
document.getElementById("inc").addEventListener("click", () => { n.textContent = String(++count); });
const items = await (await fetch("./items.json")).json();
for (const item of items) { const li = document.createElement("li"); li.textContent = item; document.getElementById("items").append(li); }
console.log("app ready, items:", items.length);
console.warn("a warning the sheep should see");
undefinedFunction(); // a bug the sheep should see`,
  },
  "/items.json": { type: "application/json", body: JSON.stringify(["wool", "grass", "fence"]) },
};
