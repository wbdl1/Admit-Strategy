import morphdom from "morphdom";
import { MutationQueue } from "./mutation-queue.js";
import { AccountExperience } from "./account.js";
import { FilesWorkspace } from "./files.js";

function key(node) {
  if (node.nodeType !== 1) return undefined;
  if (node.id) return node.id;
  if (node.hasAttribute("data-review-id")) return "review:" + node.getAttribute("data-review-id");
  if (node.matches("article,form")) {
    const form = node.matches("form") ? node : node.querySelector("form[data-portal-form]");
    if (form) return node.tagName + ":" + (form.querySelector("[name=operation]")?.value || "") + ":" +
      (form.querySelector("[name=recordId]")?.value || "new");
  }
  return undefined;
}

function patch(root, html) {
  const shell = root.cloneNode(false);
  shell.innerHTML = html;
  morphdom(root, shell, {
    childrenOnly: true,
    getNodeKey: key,
    onBeforeElUpdated(from, to) {
      if(from.hasAttribute("data-file-workspace")&&from.id===to.id)return false;
      if (from.isEqualNode(to)) return false;
      if (from.tagName === "DETAILS") to.open = from.open;
      if (from.matches("form[data-dirty]")) {
        to.dataset.dirty = from.dataset.dirty;
        to.dataset.revision = from.dataset.revision || "0";
      }
      if (from.matches("input:not([type=hidden]),textarea,select") && from.closest("form[data-dirty]")) {
        to.value = from.value;
        if ("checked" in from) to.checked = from.checked;
        return false;
      }
      return true;
    }
  });
}

window.Admit = { MutationQueue, patch, AccountExperience, FilesWorkspace };
document.addEventListener("input", event => {
  const form = event.target.closest("form[data-portal-form]");
  if (form) { form.dataset.dirty = "true"; form.dataset.revision = String(Number(form.dataset.revision || 0) + 1); }
});
