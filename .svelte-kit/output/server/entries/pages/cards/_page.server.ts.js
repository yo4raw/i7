import { a as getCards, b as getTotalCardCount } from "../../../chunks/queries.js";
const load = async () => {
  const [cards, totalCount] = await Promise.all([
    getCards(1e4, 0),
    // 大きな数値を設定してすべてのカードを取得
    getTotalCardCount()
  ]);
  return {
    cards,
    totalCount
  };
};
export {
  load
};
