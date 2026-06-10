/**
 * 衣装名(cardname)・キャラ名(name) の部分一致検索。
 * query は呼び出し元で小文字化済みのものを渡す。空文字なら常に true。
 */
export function cardTextMatches(
  card: { cardname: string | null; name: string | null },
  lowerQuery: string,
): boolean {
  if (!lowerQuery) return true;
  return (card.cardname || '').toLowerCase().includes(lowerQuery)
    || (card.name || '').toLowerCase().includes(lowerQuery);
}
