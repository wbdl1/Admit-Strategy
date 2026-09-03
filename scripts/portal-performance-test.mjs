import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../portal.html", import.meta.url), "utf8");
const failures = [];

if (html.includes("scrollIntoView")) failures.push("Portal must not trigger automatic scrolling.");
if (!/\.save-status\{position:fixed/.test(html)) failures.push("Save feedback must use a fixed toast.");
if (!html.includes('const items = [["today","Today"],["classes","Classes"],["calendar","Calendar"],["materials","Materials"],["progress","Progress"],["settings","Settings"]]')) {
  failures.push("Primary navigation must contain the six approved areas in order.");
}
if (!html.includes("function renderAffectedViews(operation)")) failures.push("Mutations need scoped view updates.");
if (!html.includes("function classWorkspace(data)")) failures.push("Subject tools need a class workspace.");
if (!html.includes('[["overview","Overview"],["topics","Topics"],["tests","Tests"],["materials","Materials"],["strategy","Study Strategy"]]')) {
  failures.push("Class navigation is incomplete.");
}
if (!html.includes("reviewDisplayMode === \"board\"") || !html.includes("Review queue") || !html.includes("Board view")) {
  failures.push("Compact review queue and optional board view are required.");
}

const mutationHandler = html.slice(html.indexOf('window.addEventListener("message"'), html.indexOf("async function reconcilePortal"));
if (/refreshPortal\s*\(/.test(mutationHandler)) failures.push("Successful saves must not refresh the full portal.");
if (/render\s*\(/.test(mutationHandler)) failures.push("Successful saves must not rebuild the full app.");

const localMutation = html.slice(html.indexOf("function applyDemoAction"), html.indexOf("function moveDemoReviewCard"));
if (/\brender\s*\(/.test(localMutation)) failures.push("Local mutations must not rebuild the full app.");

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("Portal performance contract passed.");
