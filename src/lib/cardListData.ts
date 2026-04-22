export interface CardListItem {
  ID: number;
  cardID: number;
  cardname: string;
  name: string;
  rarity: string;
  attribute: string;
  shout_max: number;
  beat_max: number;
  melody_max: number;
  ap_skill_type: string | null;
  [key: string]: any;
}
