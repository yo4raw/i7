import { getCards, getTotalCardCount, searchCards } from '$lib/db';
import type { PageServerLoad } from './$types';

const ITEMS_PER_PAGE = 100;

export const load: PageServerLoad = async ({ url }) => {
  // URLパラメータから検索条件を取得
  const name = url.searchParams.get('name') || '';
  const rarity = url.searchParams.get('rarity') || '';
  const attribute = url.searchParams.get('attribute') || '';
  const character = url.searchParams.get('character') || '';
  const skillType = url.searchParams.get('skillType') || '';
  
  // ページ番号を取得（デフォルトは1）
  const page = parseInt(url.searchParams.get('page') || '1');
  const currentPage = Math.max(1, page); // 最小値は1
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;
  
  // 検索条件があるか確認
  const hasSearchParams = name || rarity || attribute || character || skillType;
  
  // 検索条件がある場合は検索、ない場合は全件取得
  let cards: any[];
  let totalCount: number;
  
  if (hasSearchParams) {
    // 検索の場合は全件取得してからクライアント側でページング
    const searchResults = await searchCards({
      name,
      rarity,
      attribute: attribute ? parseInt(attribute) : undefined,
      character,
      skillType
    });
    
    totalCount = searchResults.length;
    cards = searchResults.slice(offset, offset + ITEMS_PER_PAGE);
  } else {
    // 通常の場合はサーバー側でページング
    [cards, totalCount] = await Promise.all([
      getCards(ITEMS_PER_PAGE, offset),
      getTotalCardCount()
    ]);
  }
  
  // ページ数を計算
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
  
  return {
    cards,
    totalCount,
    currentPage,
    totalPages,
    itemsPerPage: ITEMS_PER_PAGE
  };
};