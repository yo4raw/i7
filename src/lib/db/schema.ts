import { pgSchema, serial, integer, varchar, text, timestamp, boolean, decimal, date } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Define the schema
export const i7cardSchema = pgSchema('i7card');

// Cards table
export const cards = i7cardSchema.table('cards', {
  id: integer('id').primaryKey(),
  cardId: integer('card_id').notNull(),
  cardname: varchar('cardname', { length: 255 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  nameOther: varchar('name_other', { length: 100 }),
  groupname: varchar('groupname', { length: 100 }),
  rarity: varchar('rarity', { length: 10 }).notNull(),
  getType: varchar('get_type', { length: 50 }),
  story: text('story'),
  awakeningItem: integer('awakening_item').default(0),
});

// Card stats table
export const cardStats = i7cardSchema.table('card_stats', {
  id: integer('id').primaryKey().references(() => cards.id),
  attribute: integer('attribute'),
  shoutMin: integer('shout_min'),
  shoutMax: integer('shout_max'),
  beatMin: integer('beat_min'),
  beatMax: integer('beat_max'),
  melodyMin: integer('melody_min'),
  melodyMax: integer('melody_max'),
});

// Card skills table
export const cardSkills = i7cardSchema.table('card_skills', {
  id: integer('id').primaryKey().references(() => cards.id),
  apSkillType: varchar('ap_skill_type', { length: 100 }),
  apSkillReq: integer('ap_skill_req'),
  apSkillName: varchar('ap_skill_name', { length: 255 }),
  ctSkill: integer('ct_skill'),
  comment: text('comment'),
  spTime: integer('sp_time'),
  spValue: integer('sp_value'),
});

// Skill details table
export const skillDetails = i7cardSchema.table('skill_details', {
  id: serial('id').primaryKey(),
  cardId: integer('card_id').references(() => cards.id),
  skillLevel: integer('skill_level').notNull(),
  count: integer('count'),
  per: integer('per'),
  value: integer('value'),
  rate: integer('rate'),
});

// Release info table
export const releaseInfo = i7cardSchema.table('release_info', {
  id: integer('id').primaryKey().references(() => cards.id),
  year: integer('year'),
  month: integer('month'),
  day: integer('day'),
  event: varchar('event', { length: 255 }),
  createtime: timestamp('createtime'),
  updatetime: timestamp('updatetime'),
  listview: integer('listview').default(1),
});

// Broach info table
export const broachInfo = i7cardSchema.table('broach_info', {
  id: integer('id').primaryKey().references(() => cards.id),
  broachShout: integer('broach_shout'),
  broachBeat: integer('broach_beat'),
  broachMelody: integer('broach_melody'),
  broachReq: integer('broach_req'),
});

// Skill guess table
export const skillGuess = i7cardSchema.table('skill_guess', {
  id: integer('id').primaryKey().references(() => cards.id),
  apSkill1Guess: integer('ap_skill_1_guess'),
  apSkill2Guess: integer('ap_skill_2_guess'),
  apSkill3Guess: integer('ap_skill_3_guess'),
  apSkill4Guess: integer('ap_skill_4_guess'),
  apSkill5Guess: integer('ap_skill_5_guess'),
});

// Game mechanics table
export const gameMechanics = i7cardSchema.table('game_mechanics', {
  id: serial('id').primaryKey(),
  updateDate: date('update_date'),
  category: varchar('category', { length: 100 }),
  attribute: varchar('attribute', { length: 50 }),
  multiplier: decimal('multiplier', { precision: 5, scale: 2 }),
  value: integer('value'),
  notes: text('notes'),
});

// Songs table
export const songs = i7cardSchema.table('songs', {
  id: serial('id').primaryKey(),
  songType: varchar('song_type', { length: 50 }),
  songCategory: varchar('song_category', { length: 50 }),
  songName: varchar('song_name', { length: 200 }),
  artistName: varchar('artist_name', { length: 200 }),
  notesCount: integer('notes_count'),
  durationSeconds: integer('duration_seconds'),
  shoutPercentage: decimal('shout_percentage', { precision: 5, scale: 2 }),
  beatPercentage: decimal('beat_percentage', { precision: 5, scale: 2 }),
  melodyPercentage: decimal('melody_percentage', { precision: 5, scale: 2 }),
  lastUpdated: date('last_updated'),
});

// Team compositions table
export const teamCompositions = i7cardSchema.table('team_compositions', {
  id: serial('id').primaryKey(),
  compositionName: varchar('composition_name', { length: 200 }),
  songId: integer('song_id').references(() => songs.id),
  position1CardId: integer('position1_card_id'),
  position2CardId: integer('position2_card_id'),
  position3CardId: integer('position3_card_id'),
  position4CardId: integer('position4_card_id'),
  position5CardId: integer('position5_card_id'),
  position6CardId: integer('position6_card_id'),
  scoreupAssist: boolean('scoreup_assist'),
  scoreupBadge: boolean('scoreup_badge'),
  reductionCoverage: decimal('reduction_coverage', { precision: 5, scale: 2 }),
  attributeScore: integer('attribute_score'),
  scoreupSkillScore: integer('scoreup_skill_score'),
  reductionSkillScore: integer('reduction_skill_score'),
  liveEndScore: integer('live_end_score'),
  finalResultScore: integer('final_result_score'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Relations
export const cardsRelations = relations(cards, ({ one, many }) => ({
  stats: one(cardStats, {
    fields: [cards.id],
    references: [cardStats.id],
  }),
  skills: one(cardSkills, {
    fields: [cards.id],
    references: [cardSkills.id],
  }),
  skillDetails: many(skillDetails),
  releaseInfo: one(releaseInfo, {
    fields: [cards.id],
    references: [releaseInfo.id],
  }),
  broachInfo: one(broachInfo, {
    fields: [cards.id],
    references: [broachInfo.id],
  }),
  skillGuess: one(skillGuess, {
    fields: [cards.id],
    references: [skillGuess.id],
  }),
}));

export const skillDetailsRelations = relations(skillDetails, ({ one }) => ({
  card: one(cards, {
    fields: [skillDetails.cardId],
    references: [cards.id],
  }),
}));

export const songsRelations = relations(songs, ({ many }) => ({
  teamCompositions: many(teamCompositions),
}));

export const teamCompositionsRelations = relations(teamCompositions, ({ one }) => ({
  song: one(songs, {
    fields: [teamCompositions.songId],
    references: [songs.id],
  }),
}));

// Songs table (from sheet 2)
export const songData = i7cardSchema.table('songs', {
  id: serial('id').primaryKey(),
  songId: integer('song_id').unique(),
  category: varchar('category', { length: 100 }),
  artistName: varchar('artist_name', { length: 200 }),
  songName: varchar('song_name', { length: 200 }),
  songType: varchar('song_type', { length: 50 }),
  difficulty: varchar('difficulty', { length: 50 }),
  starRating: integer('star_rating'),
  shoutPercentage: decimal('shout_percentage', { precision: 5, scale: 2 }),
  beatPercentage: decimal('beat_percentage', { precision: 5, scale: 2 }),
  melodyPercentage: decimal('melody_percentage', { precision: 5, scale: 2 }),
  notesCount: integer('notes_count'),
  durationSeconds: integer('duration_seconds'),
  updateDate: date('update_date'),
});

// Group cards table (from sheet 3)
export const groupCards = i7cardSchema.table('group_cards', {
  id: integer('id').primaryKey(),
  cardId: integer('card_id'),
  cardname: varchar('cardname', { length: 255 }),
  groupName: varchar('group_name', { length: 100 }),
  members: text('members'),
  shoutValue: integer('shout_value'),
  beatValue: integer('beat_value'),
  melodyValue: integer('melody_value'),
  attribute: integer('attribute'),
  idolType: varchar('idol_type', { length: 50 }),
  groupType: varchar('group_type', { length: 50 }),
  autoScore: integer('auto_score'),
  songScore: integer('song_score'),
  scoreLimit: integer('score_limit'),
  broachType: varchar('broach_type', { length: 100 }),
});

// Type exports
export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
export type CardStats = typeof cardStats.$inferSelect;
export type CardSkills = typeof cardSkills.$inferSelect;
export type SkillDetail = typeof skillDetails.$inferSelect;
export type ReleaseInfo = typeof releaseInfo.$inferSelect;
export type BroachInfo = typeof broachInfo.$inferSelect;
export type Song = typeof songs.$inferSelect;
export type TeamComposition = typeof teamCompositions.$inferSelect;
export type SongData = typeof songData.$inferSelect;
export type GroupCard = typeof groupCards.$inferSelect;