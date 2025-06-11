import { c as create_ssr_component, v as validate_component, e as escape, j as add_attribute, k as each } from "../../../chunks/ssr.js";
import { C as Card, B as Button } from "../../../chunks/Button.js";
import { B as Badge } from "../../../chunks/Badge.js";
import "../../../chunks/client.js";
function getSkillActivationType(card) {
  if (card.sp_time && card.sp_time > 0) {
    return `${card.sp_time}秒毎`;
  }
  if (card.skill_details && card.skill_details[0]) {
    const detail = card.skill_details[0];
    if (detail.per === 1) {
      return `Perfect ${detail.count}回`;
    } else if (detail.count >= 30) {
      return `コンボ ${detail.count}回`;
    }
  }
  return "-";
}
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
      return "text-red-600";
    case 2:
      return "text-blue-600";
    case 3:
      return "text-yellow-600";
    default:
      return "text-gray-600";
  }
}
const Page = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let filteredCards;
  let sortedCards;
  let { data } = $$props;
  let sortBy = "score";
  let selectedSkillLevel = 5;
  let showFavoritesOnly = false;
  let favorites = /* @__PURE__ */ new Set();
  let nameFilter = data.searchParams.name || "";
  let rarityFilters = data.searchParams.rarity || [];
  let attributeFilters = data.searchParams.attribute || [];
  data.searchParams.year || "";
  data.searchParams.skillLevel || "";
  let characterFilters = data.searchParams.characterIds || [];
  let costumeFilter = data.searchParams.costumeName || "";
  let activationTypeFilter = data.searchParams.skillActivationType || "";
  let skillTypeFilters = data.searchParams.skillType || [];
  let eventBonusFilter = data.searchParams.eventBonus || false;
  function getScoreUpValue(card, level) {
    const targetLevel = level;
    if (!card.skill_details || card.skill_details.length === 0) return 0;
    const detail = card.skill_details.find((d) => d.skill_level === targetLevel);
    if (!detail) return 0;
    return Math.floor(detail.value * detail.rate / 100);
  }
  if ($$props.data === void 0 && $$bindings.data && data !== void 0) $$bindings.data(data);
  filteredCards = data.cards;
  sortedCards = [...filteredCards].sort((a, b) => {
    let compareValue = 0;
    switch (sortBy) {
      case "score":
        compareValue = getScoreUpValue(b, selectedSkillLevel) - getScoreUpValue(a, selectedSkillLevel);
        break;
      case "id":
        compareValue = b.id - a.id;
        break;
      case "date":
        const dateA = a.year ? new Date(a.year, (a.month || 1) - 1, a.day || 1).getTime() : 0;
        const dateB = b.year ? new Date(b.year, (b.month || 1) - 1, b.day || 1).getTime() : 0;
        compareValue = dateB - dateA;
        break;
    }
    return compareValue;
  });
  return `<div class="max-w-7xl mx-auto px-4 py-8"><div class="mb-8" data-svelte-h="svelte-fkfktf"><h1 class="text-3xl font-bold text-gray-900 mb-2">スコアアップ検索</h1> <p class="text-gray-600">スキルのスコアアップ値で検索・比較できます</p></div>  ${validate_component(Card, "Card").$$render($$result, { className: "mb-6" }, {}, {
    default: () => {
      return `<div class="p-6"><div class="flex items-center justify-between mb-4"><h2 class="text-xl font-semibold" data-svelte-h="svelte-y8u1ti">検索フィルター</h2> ${validate_component(Button, "Button").$$render($$result, { variant: "ghost", size: "sm" }, {}, {
        default: () => {
          return `${escape("非表示")}`;
        }
      })}</div> ${`<form class="space-y-4"> <div><div class="flex items-center justify-between mb-1"><label class="block text-sm font-medium text-gray-700" data-svelte-h="svelte-due2it">キャラクター</label> <button type="button" class="text-xs text-blue-600 hover:underline">${escape(characterFilters.length === data.characters.length ? "全解除" : "全選択")}</button></div> <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 p-3 border rounded-md max-h-40 overflow-y-auto">${each(data.characters, (character) => {
        return `<label class="flex items-center text-sm"><input type="checkbox"${add_attribute("value", character.id, 0)} class="mr-1"${~characterFilters.indexOf(character.id) ? add_attribute("checked", true, 1) : ""}> <span class="truncate">${escape(character.name)}</span> </label>`;
      })}</div></div>  <div class="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label class="block text-sm font-medium text-gray-700 mb-1" data-svelte-h="svelte-1xhr29t">キャラクター名・カード名</label> <input type="text" placeholder="検索..." class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"${add_attribute("value", nameFilter, 0)}></div> <div><label class="block text-sm font-medium text-gray-700 mb-1" data-svelte-h="svelte-o4k41s">衣装名</label> <input type="text" placeholder="衣装名で検索..." class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"${add_attribute("value", costumeFilter, 0)}></div></div>  <div class="grid grid-cols-1 md:grid-cols-2 gap-4"><div><div class="flex items-center justify-between mb-1"><label class="block text-sm font-medium text-gray-700" data-svelte-h="svelte-g151rz">レアリティ</label> <button type="button" class="text-xs text-blue-600 hover:underline">${escape(rarityFilters.length === 2 ? "全解除" : "全選択")}</button></div> <div class="flex gap-3">${each(["UR", "SSR"], (rarity) => {
        return `<label class="flex items-center"><input type="checkbox"${add_attribute("value", rarity, 0)} class="mr-2"${~rarityFilters.indexOf(rarity) ? add_attribute("checked", true, 1) : ""}> <span>${escape(rarity)}</span> </label>`;
      })}</div></div> <div><div class="flex items-center justify-between mb-1"><label class="block text-sm font-medium text-gray-700" data-svelte-h="svelte-1u7lpl9">属性</label> <button type="button" class="text-xs text-blue-600 hover:underline">${escape(attributeFilters.length === 3 ? "全解除" : "全選択")}</button></div> <div class="flex gap-3">${each(
        [
          [1, "Shout", "text-red-600"],
          [2, "Beat", "text-blue-600"],
          [3, "Melody", "text-yellow-600"]
        ],
        ([value, label, color]) => {
          return `<label class="flex items-center"><input type="checkbox"${add_attribute("value", value, 0)} class="mr-2"${~attributeFilters.indexOf(value) ? add_attribute("checked", true, 1) : ""}> <span${add_attribute("class", color, 0)}>${escape(label)}</span> </label>`;
        }
      )}</div></div></div>  <div class="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label class="block text-sm font-medium text-gray-700 mb-1" data-svelte-h="svelte-ghaeg6">登場年</label> <select class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"><option value="" data-svelte-h="svelte-1cffcfk">すべて</option>${each(data.years, (year) => {
        return `<option${add_attribute("value", year, 0)}>${escape(year)}年</option>`;
      })}</select></div> <div><label class="block text-sm font-medium text-gray-700 mb-1" data-svelte-h="svelte-172kh8h">スキルレベル（検索用）</label> <select class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"><option value="" data-svelte-h="svelte-1cffcfk">すべて</option>${each([1, 2, 3, 4, 5], (level) => {
        return `<option${add_attribute("value", level, 0)}>Lv${escape(level)}</option>`;
      })}</select></div></div>  <div><label class="block text-sm font-medium text-gray-700 mb-1" data-svelte-h="svelte-idrmy1">スキル発動</label> <div class="flex gap-3"><label class="flex items-center"><input type="radio" value="" class="mr-2"${"" === activationTypeFilter ? add_attribute("checked", true, 1) : ""}> <span data-svelte-h="svelte-3i2osu">すべて</span></label> <label class="flex items-center"><input type="radio" value="timer" class="mr-2"${"timer" === activationTypeFilter ? add_attribute("checked", true, 1) : ""}> <span data-svelte-h="svelte-11mel08">タイマー（秒毎）</span></label> <label class="flex items-center"><input type="radio" value="perfect" class="mr-2"${"perfect" === activationTypeFilter ? add_attribute("checked", true, 1) : ""}> <span data-svelte-h="svelte-1krm5gt">Perfect</span></label> <label class="flex items-center"><input type="radio" value="combo" class="mr-2"${"combo" === activationTypeFilter ? add_attribute("checked", true, 1) : ""}> <span data-svelte-h="svelte-rtessg">コンボ</span></label></div></div>  <div><div class="flex items-center justify-between mb-1"><label class="block text-sm font-medium text-gray-700" data-svelte-h="svelte-1p6ebyr">スキルタイプ</label> <button type="button" class="text-xs text-blue-600 hover:underline">${escape(skillTypeFilters.length === data.skillTypes.length ? "全解除" : "全選択")}</button></div> <div class="grid grid-cols-2 gap-2 p-3 border rounded-md max-h-32 overflow-y-auto">${each(data.skillTypes, (skillType) => {
        return `<label class="flex items-center text-sm"><input type="checkbox"${add_attribute("value", skillType, 0)} class="mr-1"${~skillTypeFilters.indexOf(skillType) ? add_attribute("checked", true, 1) : ""}> <span class="truncate">${escape(skillType)}</span> </label>`;
      })}</div></div>  <div><label class="flex items-center"><input type="checkbox" class="mr-2"${add_attribute("checked", eventBonusFilter, 1)}> <span class="text-sm font-medium text-gray-700" data-svelte-h="svelte-mfiglw">イベント特効カードのみ</span></label></div>  <div class="flex gap-2">${validate_component(Button, "Button").$$render($$result, { type: "submit" }, {}, {
        default: () => {
          return `検索`;
        }
      })} ${validate_component(Button, "Button").$$render($$result, { variant: "outline" }, {}, {
        default: () => {
          return `クリア`;
        }
      })}</div></form>`}</div>`;
    }
  })}  <div class="mb-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between"><div class="flex items-center gap-4"><span class="text-gray-600">${escape(filteredCards.length)}件の結果</span> <label class="flex items-center"><input type="checkbox" class="mr-2"${add_attribute("checked", showFavoritesOnly, 1)}> <span class="text-sm" data-svelte-h="svelte-102y79z">お気に入りのみ</span></label></div> <div class="flex flex-col sm:flex-row gap-3 items-start sm:items-center"> <div class="flex items-center gap-2"><label class="text-sm text-gray-600" data-svelte-h="svelte-1ru717h">表示レベル:</label> <select class="px-3 py-1 border border-gray-300 rounded-md text-sm">${each([1, 2, 3, 4, 5], (level) => {
    return `<option${add_attribute("value", level, 0)}>Lv${escape(level)}</option>`;
  })}</select></div>  <div class="flex items-center gap-2"><label class="text-sm text-gray-600" data-svelte-h="svelte-ud2mb3">並び替え:</label> <select class="px-3 py-1 border border-gray-300 rounded-md text-sm"><option value="score" data-svelte-h="svelte-w4px3a">スコア順</option><option value="id" data-svelte-h="svelte-t0b6xu">ID順</option><option value="date" data-svelte-h="svelte-1y4o0q3">実装日順</option></select> <button class="p-1 hover:bg-gray-100 rounded">${`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 8 4-4 4 4"></path><path d="M7 4v16"></path><path d="M15 8h6"></path><path d="M15 12h4"></path><path d="M15 16h2"></path></svg>`}</button></div></div></div>  <div class="overflow-x-auto"><table class="min-w-full bg-white border border-gray-200"><thead><tr class="bg-gray-50"><th class="px-2 py-3 text-center" data-svelte-h="svelte-1uprivz"><span class="text-yellow-500">★</span></th> <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" data-svelte-h="svelte-1315jnl">ID</th> <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" data-svelte-h="svelte-m8r5oq">カード</th> <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" data-svelte-h="svelte-1whbz9t">レアリティ</th> <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" data-svelte-h="svelte-15btb9b">属性</th> <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" data-svelte-h="svelte-sribp">スキル</th> <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" data-svelte-h="svelte-o7o29t">発動</th> ${each([1, 2, 3, 4, 5], (level) => {
    return `<th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Lv${escape(level)} </th>`;
  })} <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" data-svelte-h="svelte-1o3oqys">期待値</th></tr></thead> <tbody class="divide-y divide-gray-200">${each(sortedCards, (card) => {
    return `<tr class="hover:bg-gray-50"><td class="px-2 py-3 text-center"><button class="text-xl hover:scale-110 transition-transform">${escape(favorites.has(card.id) ? "⭐" : "☆")} </button></td> <td class="px-4 py-3 text-sm">#${escape(card.card_id)}</td> <td class="px-4 py-3"><a href="${"/card/" + escape(card.id, true)}" class="flex items-center gap-3 hover:underline"><img src="${"https://i7.step-on-dream.net/img/cards/th/" + escape(card.id, true) + ".png"}"${add_attribute("alt", card.cardname, 0)} class="w-12 h-16 object-cover rounded"> <div><div class="font-medium text-sm">${escape(card.cardname)}</div> <div class="text-xs text-gray-600">${escape(card.name)}</div></div> </a></td> <td class="px-4 py-3">${validate_component(Badge, "Badge").$$render(
      $$result,
      {
        className: card.rarity === "UR" ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white" : "bg-yellow-300 text-yellow-900"
      },
      {},
      {
        default: () => {
          return `${escape(card.rarity)} `;
        }
      }
    )}</td> <td class="px-4 py-3"><span${add_attribute("class", getAttributeColor(card.attribute), 0)}>${escape(getAttributeName(card.attribute))} </span></td> <td class="px-4 py-3"><div class="text-sm">${escape(card.ap_skill_name)}</div> <div class="text-xs text-gray-600">${escape(card.ap_skill_type)}</div></td> <td class="px-4 py-3 text-sm">${escape(getSkillActivationType(card))}</td> ${each([1, 2, 3, 4, 5], (level) => {
      let detail = card.skill_details?.find((d) => d.skill_level === level);
      return ` <td class="px-4 py-3 text-center text-sm">${detail ? `<div>${escape(detail.value.toLocaleString())}</div> <div class="text-xs text-gray-500">${escape(detail.rate)}%</div>` : `-`} </td>`;
    })} <td class="px-4 py-3 text-center"><div class="${"font-semibold text-lg " + escape("text-purple-600", true)}">${escape(getScoreUpValue(card, selectedSkillLevel).toLocaleString())} </div></td> </tr>`;
  })}</tbody></table></div> ${sortedCards.length === 0 ? `<div class="text-center py-12" data-svelte-h="svelte-ddgkc3"><p class="text-gray-500">検索条件に一致するカードが見つかりませんでした</p></div>` : ``}</div>`;
});
export {
  Page as default
};
