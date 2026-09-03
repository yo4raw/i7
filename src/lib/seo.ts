import { cardImageUrl } from './ui';
import { SITE_NAME } from './constants';

/**
 * ページ固有の meta description（手書き・キーワード入り）。
 * 既定文ではなくページ内容に即した固有文を設定して検索スニペットを最適化する。
 * キーは各ページの論理名。新規ページ追加時はここに追記し `.astro` から渡す。
 */
export const PAGE_DESCRIPTIONS: Record<string, string> = {
  home: 'アイドリッシュセブン (アイナナ) の衣装・楽曲・イベントを検索できる非公式データベース「i7マネ部屋」。スコア計算・所持衣装管理・特効衣装一覧・編成組合計算などの便利ツールをまとめて使えます。',
  cards: 'アイドリッシュセブン (アイナナ) の衣装をレアリティ・属性・キャラクターで絞り込み検索。各衣装のステータス・スキル・特効情報を一覧で確認できます。',
  songs: 'アイドリッシュセブン (アイナナ) の楽曲一覧。属性比率・ノーツ数・難易度などスコア計算に必要な楽曲データをまとめて確認できます。',
  events: 'アイドリッシュセブン (アイナナ) のイベント情報一覧。各イベントの開催期間と金特効・銀特効の対象衣装を確認できます。',
  cardCompare: 'アイドリッシュセブン (アイナナ) の衣装を比較。スコアアップ量や判定縮小カバー率を並べて、編成に強い衣装を見つけられます。',
  scoreCalc: 'アイドリッシュセブン (アイナナ) のライブスコアをモンテカルロシミュレーションで計算。編成・楽曲・特効を指定して期待値や分布を確認できます。',
  scoreCalcSpec: 'アイドリッシュセブン (アイナナ) のスコア計算ロジックの仕様解説。センタースキル・特効・判定縮小などの計算方法を図で説明します。',
  maxScoreFinder: 'アイドリッシュセブン (アイナナ) のハイスコアイベント向けに、算術期待値が最大となる6枚編成を総当たりで探索します。所持衣装縛りにも対応。',
  mycard: 'アイドリッシュセブン (アイナナ) の所持衣装を登録・管理。所持状況をもとにスコア計算や編成探索に活用できます。',
  decks: 'アイドリッシュセブン (アイナナ) のスコア計算で組んだ編成を保存・呼び出し。お気に入りのデッキを管理できます。',
  rabbitNote: 'アイドリッシュセブン (アイナナ) のラビットノート値をキャラクターごとに登録。スコア計算で各衣装の素点に加算されます。',
  sharedBroach: 'アイドリッシュセブン (アイナナ) の共通ブローチの所持数を登録。スコア計算時のブローチ自動割り当てに利用できます。',
  pointCalc: 'アイドリッシュセブン (アイナナ) のイベントポイントを狙った数字にぴったり合わせる「ポイント芸」の計算ツール。目標ptと現在ptから、必要なライブの組合せを自動で提示します。',
  about: '非公式ファンツール「i7マネ部屋」について。アイドリッシュセブン (アイナナ) の衣装・楽曲・イベントデータベースとスコア計算ツールの概要を紹介します。',
  releases: 'アイドリッシュセブン (アイナナ) ツール「i7マネ部屋」の更新履歴・リリースノート。新機能や改善の履歴を確認できます。',
};

/** 衣装詳細ページの最小カード型（JSON-LD 生成に必要なフィールドのみ） */
export interface CardForLd {
  ID: number;
  cardname: string | null;
  name: string | null;
  rarity: string | null;
  attribute: string | null;
}

/**
 * 衣装の CreativeWork JSON-LD を生成する。
 * 販売物ではないコレクタブルなイラスト作品のため CreativeWork を用いる。
 * @param card 衣装データ
 * @param siteUrl サイトのルート絶対URL（`Astro.site`）。末尾スラッシュ有無は問わない。
 */
export function cardCreativeWorkLd(card: CardForLd, siteUrl: string): Record<string, unknown> {
  const root = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
  const pageUrl = new URL(`cards/${card.ID}/`, root).toString();
  const imageUrl = new URL(cardImageUrl(card.ID), root).toString();

  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: card.cardname ?? `衣装 ${card.ID}`,
    image: imageUrl,
    url: pageUrl,
    inLanguage: 'ja',
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: root },
  };

  if (card.name) {
    ld.character = { '@type': 'Person', name: card.name };
  }

  const additionalProperty = [
    card.rarity ? { '@type': 'PropertyValue', name: 'レアリティ', value: card.rarity } : null,
    card.attribute ? { '@type': 'PropertyValue', name: '属性', value: card.attribute } : null,
  ].filter(Boolean);
  if (additionalProperty.length > 0) {
    ld.additionalProperty = additionalProperty;
  }

  return ld;
}

/**
 * 一覧ページの CollectionPage JSON-LD を生成する。
 * 全アイテムは列挙せず numberOfItems で件数のみ表現する（巨大化回避）。
 * @param opts.url ページの絶対URL
 */
export function collectionPageLd(opts: {
  name: string;
  url: string;
  description: string;
  numberOfItems: number;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: opts.name,
    url: opts.url,
    description: opts.description,
    inLanguage: 'ja',
    isPartOf: { '@type': 'WebSite', name: SITE_NAME },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: opts.numberOfItems,
    },
  };
}
