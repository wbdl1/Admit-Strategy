import { readFileSync } from "node:fs";

const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const portalHtml = readFileSync(new URL("../portal.html", import.meta.url), "utf8");
const failures = [];

if (!indexHtml.includes('return origin==="https://script.google.com"||/^https:\\/\\/[^/]+\\.googleusercontent\\.com$/.test(String(origin||""))')) {
  failures.push("Frontend replies must require HTTPS Apps Script origins.");
}

function functionBody(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  return start >= 0 ? source.slice(start, end >= 0 ? end : undefined) : "";
}

const bookingHandler = functionBody(indexHtml, "handleBookingResponse(event)", "celebrate()");
if (!bookingHandler.includes("isTrustedBackendOrigin(event.origin)")) failures.push("Booking replies must validate their origin.");
if (!bookingHandler.includes("iframe[name='bookingFrame']")) failures.push("Booking replies must resolve the expected iframe.");
if (!bookingHandler.includes("event.source!==responseFrame.contentWindow")) failures.push("Booking replies must come from the expected iframe window.");

const signupHandler = functionBody(indexHtml, "handleLeadResponse(event)", "completionActions()");
if (!signupHandler.includes("isTrustedBackendOrigin(event.origin)")) failures.push("Portal-signup replies must validate their origin.");
if (!signupHandler.includes("iframe[name='leadFrame']")) failures.push("Portal-signup replies must resolve the expected iframe.");
if (!signupHandler.includes("event.source!==responseFrame.contentWindow")) failures.push("Portal-signup replies must come from the expected iframe window.");

const portalHandler = portalHtml.slice(portalHtml.indexOf('window.addEventListener("message"'), portalHtml.indexOf("async function reconcilePortal"));
if (!portalHandler.includes("event.source!==pending.frame.contentWindow")) failures.push("Portal save replies must come from the expected iframe window.");
if (!portalHandler.includes("isTrustedBackendOrigin(event.origin)")) failures.push("Portal save replies must validate their origin.");

const bookingSubmit = functionBody(indexHtml, "confirmBooking()", "handleBookingResponse(event)");
if (!bookingSubmit.includes("b.email.toLowerCase()===b.parentEmail.toLowerCase()")) failures.push("Bookings must reject a duplicate student and guardian email before submission.");

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("Frontend iframe security contract passed.");
