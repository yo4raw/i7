import { c as create_ssr_component } from "../../chunks/ssr.js";
const Layout = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  return `<nav class="bg-slate-700 py-4 mb-8" data-svelte-h="svelte-172i0g"><div class="max-w-7xl mx-auto px-4 flex gap-8"><a href="/" class="text-white font-bold hover:opacity-80 transition-opacity">ホーム</a> <a href="/cards" class="text-white font-bold hover:opacity-80 transition-opacity">カード一覧</a> <a href="/scoreup" class="text-white font-bold hover:opacity-80 transition-opacity">スコアアップ検索</a> <a href="/about" class="text-white font-bold hover:opacity-80 transition-opacity">About</a></div></nav> <main>${slots.default ? slots.default({}) : ``}</main>`;
});
export {
  Layout as default
};
