import { c as create_ssr_component, d as compute_rest_props, f as spread, h as escape_attribute_value, i as escape_object, v as validate_component } from "../../chunks/ssr.js";
import { C as Card, B as Button } from "../../chunks/Button.js";
import { c as cn, B as Badge } from "../../chunks/Badge.js";
const CardHeader = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let $$restProps = compute_rest_props($$props, ["className"]);
  let { className = "" } = $$props;
  if ($$props.className === void 0 && $$bindings.className && className !== void 0) $$bindings.className(className);
  return `<div${spread(
    [
      {
        class: escape_attribute_value(cn("p-6", className))
      },
      escape_object($$restProps)
    ],
    {}
  )}>${slots.default ? slots.default({}) : ``}</div>`;
});
const CardContent = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let $$restProps = compute_rest_props($$props, ["className"]);
  let { className = "" } = $$props;
  if ($$props.className === void 0 && $$bindings.className && className !== void 0) $$bindings.className(className);
  return `<div${spread(
    [
      {
        class: escape_attribute_value(cn("p-6 pt-0", className))
      },
      escape_object($$restProps)
    ],
    {}
  )}>${slots.default ? slots.default({}) : ``}</div>`;
});
const Page = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  return `<div class="max-w-7xl mx-auto px-4 py-8"><div class="mb-8"><h1 class="text-4xl font-bold text-gray-800 mb-2" data-svelte-h="svelte-1bku7bh">アイドリッシュセブン カードデータベース 🎵</h1> ${validate_component(Badge, "Badge").$$render($$result, { variant: "secondary" }, {}, {
    default: () => {
      return `Powered by Rabee UI`;
    }
  })} ${validate_component(Badge, "Badge").$$render($$result, { variant: "default", className: "ml-2" }, {}, {
    default: () => {
      return `Hot Reload Enabled 🔥`;
    }
  })}</div> ${validate_component(Card, "Card").$$render($$result, { className: "mb-6" }, {}, {
    default: () => {
      return `${validate_component(CardHeader, "CardHeader").$$render($$result, {}, {}, {
        default: () => {
          return `<h2 class="text-2xl font-semibold text-gray-700" data-svelte-h="svelte-1lj5dms">ようこそ！</h2>`;
        }
      })} ${validate_component(CardContent, "CardContent").$$render($$result, {}, {}, {
        default: () => {
          return `<p class="text-gray-600 mb-2" data-svelte-h="svelte-14fusq">アイドリッシュセブンのカード情報を管理するデータベースシステムです。</p> <p class="text-gray-600" data-svelte-h="svelte-z70krv">Google Sheetsから自動的にデータを取得し、検索可能な形で提供します。</p>`;
        }
      })}`;
    }
  })} <div class="bg-white rounded-lg shadow-md p-6 mb-6"><h2 class="text-2xl font-semibold text-gray-700 mb-4" data-svelte-h="svelte-1fdtkj3">機能</h2> <ul class="space-y-2 mb-6" data-svelte-h="svelte-urpvay"><li class="flex items-center text-gray-600"><span class="mr-2">📊</span> <span>カード一覧の閲覧</span></li> <li class="flex items-center text-gray-600"><span class="mr-2">🔍</span> <span>カード検索</span></li> <li class="flex items-center text-gray-600"><span class="mr-2">📱</span> <span>カード詳細情報</span></li> <li class="flex items-center text-gray-600"><span class="mr-2">⭐</span> <span>レアリティ別フィルター</span></li> <li class="flex items-center text-gray-600"><span class="mr-2">👥</span> <span>キャラクター別フィルター</span></li></ul> ${validate_component(Button, "Button").$$render($$result, { href: "/cards", size: "lg" }, {}, {
    default: () => {
      return `カード一覧を見る`;
    }
  })}</div> <div class="bg-white rounded-lg shadow-md p-6" data-svelte-h="svelte-pgka5o"><h2 class="text-2xl font-semibold text-gray-700 mb-4">データソース</h2> <p class="text-gray-600 mb-2">データは<a href="https://docs.google.com/spreadsheets/d/1LifgqDiRlQOIhP8blqEngJhI_Nnagbo8uspwmfg72fY/edit?gid=0#gid=0" target="_blank" class="text-blue-600 underline hover:text-blue-800">Google Sheets</a>から自動的に取得されます。</p> <p class="text-gray-600">Docker初回起動時に最新データがインポートされます。</p></div></div>`;
});
export {
  Page as default
};
