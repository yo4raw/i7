import { c as create_ssr_component, e as escape, k as each, j as add_attribute, v as validate_component } from "../../../chunks/ssr.js";
import { B as Badge } from "../../../chunks/Badge.js";
const css = {
  code: ".image-placeholder.svelte-zwohay{display:none}",
  map: `{"version":3,"file":"+page.svelte","sources":["+page.svelte"],"sourcesContent":["<script lang=\\"ts\\">import Badge from \\"$lib/components/Badge.svelte\\";\\nexport let data;\\nfunction handleImageError(event) {\\n  const img = event.target;\\n  img.style.display = \\"none\\";\\n  const placeholder = img.parentElement?.querySelector(\\".table-image-placeholder\\");\\n  if (placeholder) {\\n    placeholder.style.display = \\"flex\\";\\n  }\\n}\\n<\/script>\\r\\n\\r\\n<div class=\\"mx-auto px-4 max-w-full\\">\\r\\n  <h1 class=\\"text-2xl font-bold text-gray-800 mb-4\\">カード一覧 ✨</h1>\\r\\n  \\r\\n  <div class=\\"mb-4 bg-blue-50 p-4 rounded-lg\\">\\r\\n    <p class=\\"text-sm text-gray-600\\">総カード数: <span class=\\"font-bold text-blue-600\\">{data.totalCount}枚</span></p>j\\r\\n  </div>\\r\\n  \\r\\n  <div class=\\"overflow-x-auto\\">\\r\\n    <table class=\\"w-full text-xs border-collapse bg-white\\">\\r\\n      <thead>\\r\\n        <tr class=\\"bg-gray-100 border-b-2 border-gray-300\\">\\r\\n          <th class=\\"p-1 border border-gray-300 text-center font-normal\\">画像</th>\\r\\n          <th class=\\"p-1 border border-gray-300 text-center font-normal w-16\\">カードID</th>\\r\\n          <th class=\\"p-1 border border-gray-300 text-center font-normal w-20\\">レア</th>\\r\\n          <th class=\\"p-1 border border-gray-300 text-center font-normal w-16\\">属性</th>\\r\\n          <th class=\\"p-1 border border-gray-300 text-center font-normal w-16\\">SP<br/>時間</th>\\r\\n          <th class=\\"p-1 border border-gray-300 text-center font-normal\\">入手方法</th>\\r\\n          <th class=\\"p-1 border border-gray-300 text-center font-normal\\">ストーリー</th>\\r\\n          <th class=\\"p-1 border border-gray-300 text-center font-normal w-16\\">Shout<br/>最大</th>\\r\\n          <th class=\\"p-1 border border-gray-300 text-center font-normal w-16\\">Beat<br/>最大</th>\\r\\n          <th class=\\"p-1 border border-gray-300 text-center font-normal w-16\\">Melody<br/>最大</th>\\r\\n          <th class=\\"p-1 border border-gray-300 text-center font-normal w-16\\">合計<br/>最大</th>\\r\\n          <th class=\\"p-1 border border-gray-300 text-center font-normal\\">APスキル</th>\\r\\n        </tr>\\r\\n      </thead>\\r\\n      <tbody>\\r\\n        {#each data.cards as card}\\r\\n          <tr class=\\"hover:bg-yellow-50 border-b border-gray-200\\">\\r\\n            <td class=\\"p-1 border border-gray-300 text-center\\">\\r\\n              <div class=\\"relative w-12 h-12 mx-auto overflow-hidden bg-gray-100\\">\\r\\n                <img \\r\\n                  src=\\"static/assets/{card.id}.png\\" \\r\\n                  alt={card.cardname}\\r\\n                  class=\\"w-full h-full object-cover\\"\\r\\n                  loading=\\"lazy\\"\\r\\n                  on:error={handleImageError}\\r\\n                />\\r\\n                <div class=\\"absolute inset-0 hidden items-center justify-center bg-gray-400 text-white text-xs font-bold image-placeholder\\">\\r\\n                  {card.card_id}\\r\\n                </div>\\r\\n              </div>\\r\\n            </td>\\r\\n            <td class=\\"p-1 border border-gray-300 text-center font-mono\\">\\r\\n              <a href=\\"/card/{card.id}\\" class=\\"text-blue-600 hover:underline\\">{card.card_id}</a>\\r\\n            </td>\\r\\n            <td class=\\"p-1 border border-gray-300 text-center\\">\\r\\n              {#if card.rarity === 'GROUP'}\\r\\n                <Badge className=\\"bg-gradient-to-r from-green-600 to-teal-600 text-white\\">グループ</Badge>\\r\\n              {:else if card.rarity === 'UR'}\\r\\n                <Badge className=\\"bg-gradient-to-r from-purple-600 to-pink-600 text-white\\">{card.rarity}</Badge>\\r\\n              {:else if card.rarity === 'SSR'}\\r\\n                <Badge className=\\"bg-yellow-300 text-yellow-900\\">{card.rarity}</Badge>\\r\\n              {:else if card.rarity === 'SR'}\\r\\n                <Badge className=\\"bg-purple-300 text-purple-900\\">{card.rarity}</Badge>\\r\\n              {:else if card.rarity === 'R'}\\r\\n                <Badge className=\\"bg-blue-300 text-blue-900\\">{card.rarity}</Badge>\\r\\n              {:else}\\r\\n                <Badge>{card.rarity}</Badge>\\r\\n              {/if}\\r\\n            </td>\\r\\n            <td class=\\"p-1 border border-gray-300 text-center\\">\\r\\n              {#if card.attribute}\\r\\n                <span class=\\"inline-block w-8 h-8 rounded-full text-white font-bold flex items-center justify-center\\r\\n                  {card.attribute === 1 ? 'bg-red-500' : ''}\\r\\n                  {card.attribute === 2 ? 'bg-blue-500' : ''}\\r\\n                  {card.attribute === 3 ? 'bg-yellow-500' : ''}\\">\\r\\n                  {card.attribute === 1 ? 'S' : ''}\\r\\n                  {card.attribute === 2 ? 'B' : ''}\\r\\n                  {card.attribute === 3 ? 'M' : ''}\\r\\n                </span>\\r\\n              {:else}\\r\\n                -\\r\\n              {/if}\\r\\n            </td>\\r\\n            <td class=\\"p-1 border border-gray-300 text-center\\">{card.sp_time || '-'}</td>\\r\\n            <td class=\\"p-1 border border-gray-300 text-center text-xs\\">{card.get_type || '-'}</td>\\r\\n            <td class=\\"p-1 border border-gray-300 text-center text-xs\\">{card.story || '-'}</td>\\r\\n            <td class=\\"p-1 border border-gray-300 text-center font-mono text-xs\\">{card.shout_max || '-'}</td>\\r\\n            <td class=\\"p-1 border border-gray-300 text-center font-mono text-xs\\">{card.beat_max || '-'}</td>\\r\\n            <td class=\\"p-1 border border-gray-300 text-center font-mono text-xs\\">{card.melody_max || '-'}</td>\\r\\n            <td class=\\"p-1 border border-gray-300 text-center font-mono text-xs font-bold\\">\\r\\n              {card.shout_max && card.beat_max && card.melody_max ? card.shout_max + card.beat_max + card.melody_max : '-'}\\r\\n            </td>\\r\\n            <td class=\\"p-1 border border-gray-300 text-xs\\">\\r\\n              <div class=\\"text-center\\">\\r\\n                {card.ap_skill_name || '-'}\\r\\n              </div>\\r\\n            </td>\\r\\n          </tr>\\r\\n        {/each}\\r\\n      </tbody>\\r\\n    </table>\\r\\n  </div>\\r\\n  \\r\\n</div>\\r\\n\\r\\n<style>\\r\\n  /* 画像プレースホルダーの表示制御のみカスタムCSSで実装 */\\r\\n  .image-placeholder {\\r\\n    display: none;\\r\\n  }\\r\\n  \\r\\n  img[style*=\\"display: none\\"] + .image-placeholder {\\r\\n    display: flex !important;\\r\\n  }\\r\\n</style>"],"names":[],"mappings":"AA8GE,gCAAmB,CACjB,OAAO,CAAE,IACX"}`
};
const Page = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let { data } = $$props;
  if ($$props.data === void 0 && $$bindings.data && data !== void 0) $$bindings.data(data);
  $$result.css.add(css);
  return `<div class="mx-auto px-4 max-w-full"><h1 class="text-2xl font-bold text-gray-800 mb-4" data-svelte-h="svelte-1ta657r">カード一覧 ✨</h1> <div class="mb-4 bg-blue-50 p-4 rounded-lg"><p class="text-sm text-gray-600">総カード数: <span class="font-bold text-blue-600">${escape(data.totalCount)}枚</span></p>j</div> <div class="overflow-x-auto"><table class="w-full text-xs border-collapse bg-white"><thead data-svelte-h="svelte-wyt4if"><tr class="bg-gray-100 border-b-2 border-gray-300"><th class="p-1 border border-gray-300 text-center font-normal">画像</th> <th class="p-1 border border-gray-300 text-center font-normal w-16">カードID</th> <th class="p-1 border border-gray-300 text-center font-normal w-20">レア</th> <th class="p-1 border border-gray-300 text-center font-normal w-16">属性</th> <th class="p-1 border border-gray-300 text-center font-normal w-16">SP<br>時間</th> <th class="p-1 border border-gray-300 text-center font-normal">入手方法</th> <th class="p-1 border border-gray-300 text-center font-normal">ストーリー</th> <th class="p-1 border border-gray-300 text-center font-normal w-16">Shout<br>最大</th> <th class="p-1 border border-gray-300 text-center font-normal w-16">Beat<br>最大</th> <th class="p-1 border border-gray-300 text-center font-normal w-16">Melody<br>最大</th> <th class="p-1 border border-gray-300 text-center font-normal w-16">合計<br>最大</th> <th class="p-1 border border-gray-300 text-center font-normal">APスキル</th></tr></thead> <tbody>${each(data.cards, (card) => {
    return `<tr class="hover:bg-yellow-50 border-b border-gray-200"><td class="p-1 border border-gray-300 text-center"><div class="relative w-12 h-12 mx-auto overflow-hidden bg-gray-100"><img src="${"static/assets/" + escape(card.id, true) + ".png"}"${add_attribute("alt", card.cardname, 0)} class="w-full h-full object-cover" loading="lazy"> <div class="absolute inset-0 hidden items-center justify-center bg-gray-400 text-white text-xs font-bold image-placeholder svelte-zwohay">${escape(card.card_id)}</div> </div></td> <td class="p-1 border border-gray-300 text-center font-mono"><a href="${"/card/" + escape(card.id, true)}" class="text-blue-600 hover:underline">${escape(card.card_id)}</a></td> <td class="p-1 border border-gray-300 text-center">${card.rarity === "GROUP" ? `${validate_component(Badge, "Badge").$$render(
      $$result,
      {
        className: "bg-gradient-to-r from-green-600 to-teal-600 text-white"
      },
      {},
      {
        default: () => {
          return `グループ`;
        }
      }
    )}` : `${card.rarity === "UR" ? `${validate_component(Badge, "Badge").$$render(
      $$result,
      {
        className: "bg-gradient-to-r from-purple-600 to-pink-600 text-white"
      },
      {},
      {
        default: () => {
          return `${escape(card.rarity)}`;
        }
      }
    )}` : `${card.rarity === "SSR" ? `${validate_component(Badge, "Badge").$$render(
      $$result,
      {
        className: "bg-yellow-300 text-yellow-900"
      },
      {},
      {
        default: () => {
          return `${escape(card.rarity)}`;
        }
      }
    )}` : `${card.rarity === "SR" ? `${validate_component(Badge, "Badge").$$render(
      $$result,
      {
        className: "bg-purple-300 text-purple-900"
      },
      {},
      {
        default: () => {
          return `${escape(card.rarity)}`;
        }
      }
    )}` : `${card.rarity === "R" ? `${validate_component(Badge, "Badge").$$render($$result, { className: "bg-blue-300 text-blue-900" }, {}, {
      default: () => {
        return `${escape(card.rarity)}`;
      }
    })}` : `${validate_component(Badge, "Badge").$$render($$result, {}, {}, {
      default: () => {
        return `${escape(card.rarity)}`;
      }
    })}`}`}`}`}`}</td> <td class="p-1 border border-gray-300 text-center">${card.attribute ? `<span class="${"inline-block w-8 h-8 rounded-full text-white font-bold flex items-center justify-center " + escape(card.attribute === 1 ? "bg-red-500" : "", true) + " " + escape(card.attribute === 2 ? "bg-blue-500" : "", true) + " " + escape(card.attribute === 3 ? "bg-yellow-500" : "", true)}">${escape(card.attribute === 1 ? "S" : "")} ${escape(card.attribute === 2 ? "B" : "")} ${escape(card.attribute === 3 ? "M" : "")} </span>` : `-`}</td> <td class="p-1 border border-gray-300 text-center">${escape(card.sp_time || "-")}</td> <td class="p-1 border border-gray-300 text-center text-xs">${escape(card.get_type || "-")}</td> <td class="p-1 border border-gray-300 text-center text-xs">${escape(card.story || "-")}</td> <td class="p-1 border border-gray-300 text-center font-mono text-xs">${escape(card.shout_max || "-")}</td> <td class="p-1 border border-gray-300 text-center font-mono text-xs">${escape(card.beat_max || "-")}</td> <td class="p-1 border border-gray-300 text-center font-mono text-xs">${escape(card.melody_max || "-")}</td> <td class="p-1 border border-gray-300 text-center font-mono text-xs font-bold">${escape(card.shout_max && card.beat_max && card.melody_max ? card.shout_max + card.beat_max + card.melody_max : "-")}</td> <td class="p-1 border border-gray-300 text-xs"><div class="text-center">${escape(card.ap_skill_name || "-")} </div></td> </tr>`;
  })}</tbody></table></div> </div>`;
});
export {
  Page as default
};
