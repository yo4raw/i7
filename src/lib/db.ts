// Re-export everything from the Drizzle queries
export * from './db/queries';

// Export types for backward compatibility
export interface SkillDetail {
  skill_level?: number;
  skillLevel?: number;
  count?: number | null;
  per?: number | null;
  value?: number | null;
  rate?: number | null;
}

// Map the interface to maintain backward compatibility
export interface Card {
  id: number;
  card_id?: number;
  cardId?: number;
  cardname: string;
  name: string;
  name_other?: string | null;
  nameOther?: string | null;
  groupname?: string | null;
  rarity: string;
  get_type?: string | null;
  getType?: string | null;
  story?: string | null;
  awakening_item?: number | null;
  awakeningItem?: number | null;
  // From card_stats
  attribute?: number | null;
  shout_min?: number | null;
  shoutMin?: number | null;
  shout_max?: number | null;
  shoutMax?: number | null;
  beat_min?: number | null;
  beatMin?: number | null;
  beat_max?: number | null;
  beatMax?: number | null;
  melody_min?: number | null;
  melodyMin?: number | null;
  melody_max?: number | null;
  melodyMax?: number | null;
  // From card_skills
  ap_skill_type?: string | null;
  apSkillType?: string | null;
  ap_skill_req?: number | null;
  apSkillReq?: number | null;
  ap_skill_name?: string | null;
  apSkillName?: string | null;
  ct_skill?: number | null;
  ctSkill?: number | null;
  sp_time?: number | null;
  spTime?: number | null;
  sp_value?: number | null;
  spValue?: number | null;
  comment?: string | null;
  // From release_info
  year?: number | null;
  month?: number | null;
  day?: number | null;
  event?: string | null;
  createtime?: Date | null;
  updatetime?: Date | null;
  // From broach_info
  broach_shout?: number | null;
  broachShout?: number | null;
  broach_beat?: number | null;
  broachBeat?: number | null;
  broach_melody?: number | null;
  broachMelody?: number | null;
  broach_req?: number | null;
  broachReq?: number | null;
  // Skill details
  skill_details?: SkillDetail[];
  skillDetails?: SkillDetail[];
}