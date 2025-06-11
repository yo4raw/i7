import { c as create_ssr_component, v as validate_component, j as add_attribute, e as escape, k as each } from "../../../../chunks/ssr.js";
import { B as Button, C as Card } from "../../../../chunks/Button.js";
import "clsx";
import { B as Badge } from "../../../../chunks/Badge.js";
function getAttributeName(attribute) {
  switch (attribute) {
    case 1:
      return "Shout";
    case 2:
      return "Beat";
    case 3:
      return "Melody";
    default:
      return "-";
  }
}
function getAttributeColor(attribute) {
  switch (attribute) {
    case 1:
      return "bg-red-500";
    case 2:
      return "bg-blue-500";
    case 3:
      return "bg-yellow-500";
    default:
      return "bg-gray-400";
  }
}
const Page = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let { data } = $$props;
  const card = data.card;
  const totalStats = (card.shout_max || 0) + (card.beat_max || 0) + (card.melody_max || 0);
  if ($$props.data === void 0 && $$bindings.data && data !== void 0) $$bindings.data(data);
  return `<div class="max-w-6xl mx-auto px-4 py-8"><div class="mb-6">${validate_component(Button, "Button").$$render(
    $$result,
    {
      href: "/cards",
      variant: "ghost",
      size: "sm",
      className: "gap-2"
    },
    {},
    {
      default: () => {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"></path><path d="M19 12H5"></path></svg>
      カード一覧に戻る`;
      }
    }
  )}</div> ${validate_component(Card, "Card").$$render($$result, { className: "shadow-lg" }, {}, {
    default: () => {
      return `<div class="lg:grid lg:grid-cols-2 lg:gap-8"> <div class="p-8 bg-gray-50"><div class="aspect-[3/4] bg-white rounded-lg shadow-md overflow-hidden"><img src="${"https://i7.step-on-dream.net/img/cards/" + escape(card.id, true) + ".png"}"${add_attribute("alt", card.cardname, 0)} class="w-full h-full object-contain"></div></div>  <div class="p-8"> <div class="mb-6"><h1 class="text-3xl font-bold text-gray-900 mb-2">${escape(card.cardname)}</h1> <div class="flex items-center gap-4"><span class="text-gray-600">ID: #${escape(card.card_id)}</span> ${card.rarity === "UR" ? `${validate_component(Badge, "Badge").$$render(
        $$result,
        {
          className: "bg-gradient-to-r from-purple-600 to-pink-600 text-white px-3 py-1"
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
          className: "bg-yellow-300 text-yellow-900 px-3 py-1"
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
          className: "bg-purple-300 text-purple-900 px-3 py-1"
        },
        {},
        {
          default: () => {
            return `${escape(card.rarity)}`;
          }
        }
      )}` : `${card.rarity === "R" ? `${validate_component(Badge, "Badge").$$render(
        $$result,
        {
          className: "bg-blue-300 text-blue-900 px-3 py-1"
        },
        {},
        {
          default: () => {
            return `${escape(card.rarity)}`;
          }
        }
      )}` : `${validate_component(Badge, "Badge").$$render($$result, { className: "px-3 py-1" }, {}, {
        default: () => {
          return `${escape(card.rarity)}`;
        }
      })}`}`}`}`}</div></div>  <div class="mb-6 border-t pt-6"><h2 class="text-xl font-semibold mb-4" data-svelte-h="svelte-krs9mg">基本情報</h2> <dl class="grid grid-cols-2 gap-4"><div><dt class="text-sm text-gray-600" data-svelte-h="svelte-pku9fe">キャラクター</dt> <dd class="font-medium">${escape(card.name)}</dd> </div>${card.name_other ? `<div><dt class="text-sm text-gray-600" data-svelte-h="svelte-4b87yn">別名</dt> <dd class="font-medium">${escape(card.name_other)}</dd></div>` : ``}<div><dt class="text-sm text-gray-600" data-svelte-h="svelte-dsm4uh">グループ</dt> <dd class="font-medium">${escape(card.groupname || "-")}</dd> </div><div><dt class="text-sm text-gray-600" data-svelte-h="svelte-1oiiu13">入手方法</dt> <dd class="font-medium">${escape(card.get_type || "-")}</dd> </div><div><dt class="text-sm text-gray-600" data-svelte-h="svelte-1kl8diu">ストーリー</dt> <dd class="font-medium">${escape(card.story || "-")}</dd> </div>${card.awakening_item ? `<div><dt class="text-sm text-gray-600" data-svelte-h="svelte-1n7q3pp">覚醒アイテム</dt> <dd class="font-medium">${escape(card.awakening_item)}</dd></div>` : ``}</dl></div>  ${card.attribute ? `<div class="mb-6 border-t pt-6"><h2 class="text-xl font-semibold mb-4" data-svelte-h="svelte-c9mtmt">ステータス</h2> <div class="mb-4"><span class="text-sm text-gray-600" data-svelte-h="svelte-1wzgf24">属性:</span> <span class="${"inline-block ml-2 px-3 py-1 rounded-full text-white text-sm font-bold " + escape(getAttributeColor(card.attribute), true)}">${escape(getAttributeName(card.attribute))}</span></div> <div class="space-y-3"><div><div class="flex justify-between mb-1"><span class="text-sm font-medium" data-svelte-h="svelte-wz1qaz">Shout</span> <span class="text-sm text-gray-600">${escape(card.shout_min || 0)} → ${escape(card.shout_max || 0)}</span></div> <div class="w-full bg-gray-200 rounded-full h-2"><div class="bg-red-500 h-2 rounded-full" style="${"width: " + escape((card.shout_max || 0) / 8e3 * 100, true) + "%"}"></div></div></div> <div><div class="flex justify-between mb-1"><span class="text-sm font-medium" data-svelte-h="svelte-211gzg">Beat</span> <span class="text-sm text-gray-600">${escape(card.beat_min || 0)} → ${escape(card.beat_max || 0)}</span></div> <div class="w-full bg-gray-200 rounded-full h-2"><div class="bg-blue-500 h-2 rounded-full" style="${"width: " + escape((card.beat_max || 0) / 8e3 * 100, true) + "%"}"></div></div></div> <div><div class="flex justify-between mb-1"><span class="text-sm font-medium" data-svelte-h="svelte-1j3y45w">Melody</span> <span class="text-sm text-gray-600">${escape(card.melody_min || 0)} → ${escape(card.melody_max || 0)}</span></div> <div class="w-full bg-gray-200 rounded-full h-2"><div class="bg-yellow-500 h-2 rounded-full" style="${"width: " + escape((card.melody_max || 0) / 8e3 * 100, true) + "%"}"></div></div></div> <div class="pt-3 border-t"><div class="flex justify-between"><span class="font-medium" data-svelte-h="svelte-18sqkw2">合計</span> <span class="font-bold text-lg">${escape(totalStats)}</span></div></div></div></div>` : ``}  ${card.ap_skill_name || card.sp_time ? `<div class="mb-6 border-t pt-6"><h2 class="text-xl font-semibold mb-4" data-svelte-h="svelte-1uie9b9">スキル情報</h2> <dl class="space-y-3">${card.ap_skill_name ? `<div><dt class="text-sm text-gray-600" data-svelte-h="svelte-v69imx">APスキル</dt> <dd class="font-medium">${escape(card.ap_skill_name)}</dd> ${card.ap_skill_type ? `<dd class="text-sm text-gray-600 mt-1">タイプ: ${escape(card.ap_skill_type)}</dd>` : ``} ${card.ap_skill_req ? `<dd class="text-sm text-gray-600">必要AP: ${escape(card.ap_skill_req)}</dd>` : ``} ${card.comment ? `<dd class="text-sm text-gray-600 mt-2">${escape(card.comment)}</dd>` : ``}</div>` : ``}${card.ct_skill ? `<div><dt class="text-sm text-gray-600" data-svelte-h="svelte-1r5szz3">CTスキル</dt> <dd class="font-medium">${escape(card.ct_skill)}</dd></div>` : ``}${card.sp_time ? `<div><dt class="text-sm text-gray-600" data-svelte-h="svelte-1f5dgc5">SP時間</dt> <dd class="font-medium">${escape(card.sp_time)}秒</dd> ${card.sp_value ? `<dd class="text-sm text-gray-600">SP値: ${escape(card.sp_value)}</dd>` : ``}</div>` : ``}</dl></div>` : ``}  ${card.skill_details && card.skill_details.length > 0 ? `<div class="mb-6 border-t pt-6"><h2 class="text-xl font-semibold mb-4" data-svelte-h="svelte-1f6nqx2">スキルレベル詳細</h2> <div class="overflow-x-auto"><table class="min-w-full text-sm"><thead data-svelte-h="svelte-mk8lgx"><tr class="border-b"><th class="text-left py-2 px-3">レベル</th> <th class="text-left py-2 px-3">発動条件</th> <th class="text-left py-2 px-3">確率</th> <th class="text-left py-2 px-3">効果</th></tr></thead> <tbody>${each(card.skill_details, (detail) => {
        return `<tr class="border-b hover:bg-gray-50"><td class="py-2 px-3 font-medium">Lv${escape(detail.skill_level)}</td> <td class="py-2 px-3">${detail.count ? `${escape(detail.per === 1 ? "Perfect" : detail.per === 2 ? "Great" : "Good")} ${escape(detail.count)}回` : `-`}</td> <td class="py-2 px-3">${escape(detail.rate ? `${detail.rate}%` : "-")}</td> <td class="py-2 px-3">${detail.value ? `スコア ${escape(detail.value.toLocaleString())} UP` : `-`}</td> </tr>`;
      })}</tbody></table></div></div>` : ``}  ${card.broach_shout || card.broach_beat || card.broach_melody ? `<div class="mb-6 border-t pt-6"><h2 class="text-xl font-semibold mb-4" data-svelte-h="svelte-kyir40">ブローチ情報</h2> <dl class="space-y-2"><div class="grid grid-cols-3 gap-4">${card.broach_shout ? `<div><dt class="text-sm text-gray-600" data-svelte-h="svelte-udcyp6">Shout</dt> <dd class="font-medium text-red-600">+${escape(card.broach_shout)}</dd></div>` : ``} ${card.broach_beat ? `<div><dt class="text-sm text-gray-600" data-svelte-h="svelte-1oolqhd">Beat</dt> <dd class="font-medium text-blue-600">+${escape(card.broach_beat)}</dd></div>` : ``} ${card.broach_melody ? `<div><dt class="text-sm text-gray-600" data-svelte-h="svelte-13aw7o1">Melody</dt> <dd class="font-medium text-yellow-600">+${escape(card.broach_melody)}</dd></div>` : ``} </div>${card.broach_req ? `<div><dt class="text-sm text-gray-600" data-svelte-h="svelte-1caeebt">必要ブローチ数</dt> <dd class="font-medium">${escape(card.broach_req)}個</dd></div>` : ``}</dl></div>` : ``}  ${card.year || card.event ? `<div class="mb-6 border-t pt-6"><h2 class="text-xl font-semibold mb-4" data-svelte-h="svelte-17sn58j">リリース情報</h2> <dl class="space-y-2">${card.year && card.month && card.day ? `<div><dt class="text-sm text-gray-600" data-svelte-h="svelte-9hcppg">実装日</dt> <dd class="font-medium">${escape(card.year)}年${escape(card.month)}月${escape(card.day)}日</dd></div>` : ``}${card.event ? `<div><dt class="text-sm text-gray-600" data-svelte-h="svelte-1p8w7c9">イベント</dt> <dd class="font-medium">${escape(card.event)}</dd></div>` : ``}${card.updatetime ? `<div><dt class="text-sm text-gray-600" data-svelte-h="svelte-1olo5kr">最終更新</dt> <dd class="font-medium">${escape(new Date(card.updatetime).toLocaleString("ja-JP"))}</dd></div>` : ``}</dl></div>` : ``}</div></div>`;
    }
  })}</div>`;
});
export {
  Page as default
};
