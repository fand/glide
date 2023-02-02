import "./style.css";
import { marked } from "marked";

let el = document.querySelector("#app")!;

async function init() {
  let md = await fetch("/page1.md").then((r) => r.text());
  el.innerHTML = marked(md);
}
init();

postMessage({ payload: "removeLoading" }, "*");
