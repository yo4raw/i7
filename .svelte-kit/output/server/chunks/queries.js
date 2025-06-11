import { relations, eq, desc, count, or, ilike, inArray, sql, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { pgSchema, integer, text, varchar, serial, timestamp, decimal, date, boolean } from "drizzle-orm/pg-core";
const i7cardSchema = pgSchema("i7card");
const cards = i7cardSchema.table("cards", {
  id: integer("id").primaryKey(),
  cardId: integer("card_id").notNull(),
  cardname: varchar("cardname", { length: 255 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  nameOther: varchar("name_other", { length: 100 }),
  groupname: varchar("groupname", { length: 100 }),
  rarity: varchar("rarity", { length: 10 }).notNull(),
  getType: varchar("get_type", { length: 50 }),
  story: text("story"),
  awakeningItem: integer("awakening_item").default(0)
});
const cardStats = i7cardSchema.table("card_stats", {
  id: integer("id").primaryKey().references(() => cards.id),
  attribute: integer("attribute"),
  shoutMin: integer("shout_min"),
  shoutMax: integer("shout_max"),
  beatMin: integer("beat_min"),
  beatMax: integer("beat_max"),
  melodyMin: integer("melody_min"),
  melodyMax: integer("melody_max")
});
const cardSkills = i7cardSchema.table("card_skills", {
  id: integer("id").primaryKey().references(() => cards.id),
  apSkillType: varchar("ap_skill_type", { length: 100 }),
  apSkillReq: integer("ap_skill_req"),
  apSkillName: varchar("ap_skill_name", { length: 255 }),
  ctSkill: integer("ct_skill"),
  comment: text("comment"),
  spTime: integer("sp_time"),
  spValue: integer("sp_value")
});
const skillDetails = i7cardSchema.table("skill_details", {
  id: serial("id").primaryKey(),
  cardId: integer("card_id").references(() => cards.id),
  skillLevel: integer("skill_level").notNull(),
  count: integer("count"),
  per: integer("per"),
  value: integer("value"),
  rate: integer("rate")
});
const releaseInfo = i7cardSchema.table("release_info", {
  id: integer("id").primaryKey().references(() => cards.id),
  year: integer("year"),
  month: integer("month"),
  day: integer("day"),
  event: varchar("event", { length: 255 }),
  createtime: timestamp("createtime"),
  updatetime: timestamp("updatetime"),
  listview: integer("listview").default(1)
});
const broachInfo = i7cardSchema.table("broach_info", {
  id: integer("id").primaryKey().references(() => cards.id),
  broachShout: integer("broach_shout"),
  broachBeat: integer("broach_beat"),
  broachMelody: integer("broach_melody"),
  broachReq: integer("broach_req")
});
const skillGuess = i7cardSchema.table("skill_guess", {
  id: integer("id").primaryKey().references(() => cards.id),
  apSkill1Guess: integer("ap_skill_1_guess"),
  apSkill2Guess: integer("ap_skill_2_guess"),
  apSkill3Guess: integer("ap_skill_3_guess"),
  apSkill4Guess: integer("ap_skill_4_guess"),
  apSkill5Guess: integer("ap_skill_5_guess")
});
const gameMechanics = i7cardSchema.table("game_mechanics", {
  id: serial("id").primaryKey(),
  updateDate: date("update_date"),
  category: varchar("category", { length: 100 }),
  attribute: varchar("attribute", { length: 50 }),
  multiplier: decimal("multiplier", { precision: 5, scale: 2 }),
  value: integer("value"),
  notes: text("notes")
});
const songs = i7cardSchema.table("songs", {
  id: serial("id").primaryKey(),
  songType: varchar("song_type", { length: 50 }),
  songCategory: varchar("song_category", { length: 50 }),
  songName: varchar("song_name", { length: 200 }),
  artistName: varchar("artist_name", { length: 200 }),
  notesCount: integer("notes_count"),
  durationSeconds: integer("duration_seconds"),
  shoutPercentage: decimal("shout_percentage", { precision: 5, scale: 2 }),
  beatPercentage: decimal("beat_percentage", { precision: 5, scale: 2 }),
  melodyPercentage: decimal("melody_percentage", { precision: 5, scale: 2 }),
  lastUpdated: date("last_updated")
});
const teamCompositions = i7cardSchema.table("team_compositions", {
  id: serial("id").primaryKey(),
  compositionName: varchar("composition_name", { length: 200 }),
  songId: integer("song_id").references(() => songs.id),
  position1CardId: integer("position1_card_id"),
  position2CardId: integer("position2_card_id"),
  position3CardId: integer("position3_card_id"),
  position4CardId: integer("position4_card_id"),
  position5CardId: integer("position5_card_id"),
  position6CardId: integer("position6_card_id"),
  scoreupAssist: boolean("scoreup_assist"),
  scoreupBadge: boolean("scoreup_badge"),
  reductionCoverage: decimal("reduction_coverage", { precision: 5, scale: 2 }),
  attributeScore: integer("attribute_score"),
  scoreupSkillScore: integer("scoreup_skill_score"),
  reductionSkillScore: integer("reduction_skill_score"),
  liveEndScore: integer("live_end_score"),
  finalResultScore: integer("final_result_score"),
  createdAt: timestamp("created_at").defaultNow()
});
const cardsRelations = relations(cards, ({ one, many }) => ({
  stats: one(cardStats, {
    fields: [cards.id],
    references: [cardStats.id]
  }),
  skills: one(cardSkills, {
    fields: [cards.id],
    references: [cardSkills.id]
  }),
  skillDetails: many(skillDetails),
  releaseInfo: one(releaseInfo, {
    fields: [cards.id],
    references: [releaseInfo.id]
  }),
  broachInfo: one(broachInfo, {
    fields: [cards.id],
    references: [broachInfo.id]
  }),
  skillGuess: one(skillGuess, {
    fields: [cards.id],
    references: [skillGuess.id]
  })
}));
const skillDetailsRelations = relations(skillDetails, ({ one }) => ({
  card: one(cards, {
    fields: [skillDetails.cardId],
    references: [cards.id]
  })
}));
const songsRelations = relations(songs, ({ many }) => ({
  teamCompositions: many(teamCompositions)
}));
const teamCompositionsRelations = relations(teamCompositions, ({ one }) => ({
  song: one(songs, {
    fields: [teamCompositions.songId],
    references: [songs.id]
  })
}));
const songData = i7cardSchema.table("songs", {
  id: serial("id").primaryKey(),
  songId: integer("song_id").unique(),
  category: varchar("category", { length: 100 }),
  artistName: varchar("artist_name", { length: 200 }),
  songName: varchar("song_name", { length: 200 }),
  songType: varchar("song_type", { length: 50 }),
  difficulty: varchar("difficulty", { length: 50 }),
  starRating: integer("star_rating"),
  shoutPercentage: decimal("shout_percentage", { precision: 5, scale: 2 }),
  beatPercentage: decimal("beat_percentage", { precision: 5, scale: 2 }),
  melodyPercentage: decimal("melody_percentage", { precision: 5, scale: 2 }),
  notesCount: integer("notes_count"),
  durationSeconds: integer("duration_seconds"),
  updateDate: date("update_date")
});
const groupCards = i7cardSchema.table("group_cards", {
  id: integer("id").primaryKey(),
  cardId: integer("card_id"),
  cardname: varchar("cardname", { length: 255 }),
  groupName: varchar("group_name", { length: 100 }),
  members: text("members"),
  shoutValue: integer("shout_value"),
  beatValue: integer("beat_value"),
  melodyValue: integer("melody_value"),
  attribute: integer("attribute"),
  idolType: varchar("idol_type", { length: 50 }),
  groupType: varchar("group_type", { length: 50 }),
  autoScore: integer("auto_score"),
  songScore: integer("song_score"),
  scoreLimit: integer("score_limit"),
  broachType: varchar("broach_type", { length: 100 })
});
const schema = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  broachInfo,
  cardSkills,
  cardStats,
  cards,
  cardsRelations,
  gameMechanics,
  groupCards,
  i7cardSchema,
  releaseInfo,
  skillDetails,
  skillDetailsRelations,
  skillGuess,
  songData,
  songs,
  songsRelations,
  teamCompositions,
  teamCompositionsRelations
}, Symbol.toStringTag, { value: "Module" }));
let pool = null;
let db = null;
let isBuilding = false;
if (typeof process !== "undefined" && process.env.VITE_SVELTEKIT_BUILDING === "true") {
  isBuilding = true;
}
function getDb() {
  if (!db && !isBuilding) {
    const connectionString = process.env.DATABASE_URL || "postgresql://i7user:i7password@postgres:5432/i7card?sslmode=disable";
    console.log("Initializing Drizzle database connection...");
    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 3e4,
      connectionTimeoutMillis: 1e4,
      allowExitOnIdle: true
    });
    pool.on("error", (err) => {
      console.error("Unexpected error on idle client", err);
    });
    db = drizzle(pool, { schema });
  }
  return db;
}
async function getCards(limit = 50, offset = 0) {
  try {
    const db2 = getDb();
    const regularCards = await db2.select().from(cards).leftJoin(cardStats, eq(cards.id, cardStats.id)).leftJoin(cardSkills, eq(cards.id, cardSkills.id)).orderBy(desc(cards.id)).limit(limit).offset(offset);
    const groupCardLimit = limit > 1e3 ? 1e3 : Math.floor(limit / 5);
    const groupCardsResult = await db2.select().from(groupCards).orderBy(desc(groupCards.id)).limit(groupCardLimit).offset(0);
    const transformedRegularCards = regularCards.map((row) => ({
      ...row.cards,
      // Add snake_case versions for backward compatibility
      card_id: row.cards.cardId,
      name_other: row.cards.nameOther,
      get_type: row.cards.getType,
      awakening_item: row.cards.awakeningItem,
      // From stats
      attribute: row.card_stats?.attribute,
      shout_min: row.card_stats?.shoutMin,
      shout_max: row.card_stats?.shoutMax,
      beat_min: row.card_stats?.beatMin,
      beat_max: row.card_stats?.beatMax,
      melody_min: row.card_stats?.melodyMin,
      melody_max: row.card_stats?.melodyMax,
      // From skills
      ap_skill_type: row.card_skills?.apSkillType,
      ap_skill_req: row.card_skills?.apSkillReq,
      ap_skill_name: row.card_skills?.apSkillName,
      ct_skill: row.card_skills?.ctSkill,
      sp_time: row.card_skills?.spTime,
      sp_value: row.card_skills?.spValue,
      is_group_card: false
    }));
    const transformedGroupCards = groupCardsResult.map((gc) => ({
      id: gc.id,
      card_id: gc.cardId,
      cardId: gc.cardId,
      cardname: gc.cardname,
      name: gc.groupName,
      name_other: gc.members,
      nameOther: gc.members,
      groupname: gc.groupType,
      rarity: "GROUP",
      // Special rarity for group cards
      get_type: "グループ",
      getType: "グループ",
      attribute: gc.attribute,
      shout_max: gc.shoutValue,
      beat_max: gc.beatValue,
      melody_max: gc.melodyValue,
      is_group_card: true,
      broach_type: gc.broachType
    }));
    let allCards;
    if (limit > 100 && transformedGroupCards.length > 0) {
      const interleaveRatio = Math.floor(transformedRegularCards.length / transformedGroupCards.length);
      allCards = [];
      let groupIndex = 0;
      for (let i = 0; i < transformedRegularCards.length; i++) {
        allCards.push(transformedRegularCards[i]);
        if ((i + 1) % interleaveRatio === 0 && groupIndex < transformedGroupCards.length) {
          allCards.push(transformedGroupCards[groupIndex]);
          groupIndex++;
        }
      }
      while (groupIndex < transformedGroupCards.length) {
        allCards.push(transformedGroupCards[groupIndex]);
        groupIndex++;
      }
      allCards = allCards.slice(0, limit);
    } else {
      allCards = [...transformedRegularCards, ...transformedGroupCards].sort((a, b) => b.id - a.id).slice(0, limit);
    }
    return allCards;
  } catch (error) {
    console.error("Error fetching cards:", error);
    return [];
  }
}
async function getCardById(id) {
  try {
    const db2 = getDb();
    const cardResult = await db2.select().from(cards).leftJoin(cardStats, eq(cards.id, cardStats.id)).leftJoin(cardSkills, eq(cards.id, cardSkills.id)).leftJoin(releaseInfo, eq(cards.id, releaseInfo.id)).leftJoin(broachInfo, eq(cards.id, broachInfo.id)).where(eq(cards.id, id)).limit(1);
    if (!cardResult[0]) {
      return null;
    }
    const row = cardResult[0];
    const skillDetailsResult = await db2.select().from(skillDetails).where(eq(skillDetails.cardId, id)).orderBy(skillDetails.skillLevel);
    return {
      ...row.cards,
      // Add snake_case versions
      card_id: row.cards.cardId,
      name_other: row.cards.nameOther,
      get_type: row.cards.getType,
      awakening_item: row.cards.awakeningItem,
      // Add stats
      attribute: row.card_stats?.attribute,
      shout_min: row.card_stats?.shoutMin,
      shout_max: row.card_stats?.shoutMax,
      beat_min: row.card_stats?.beatMin,
      beat_max: row.card_stats?.beatMax,
      melody_min: row.card_stats?.melodyMin,
      melody_max: row.card_stats?.melodyMax,
      // Add skills
      ap_skill_type: row.card_skills?.apSkillType,
      ap_skill_req: row.card_skills?.apSkillReq,
      ap_skill_name: row.card_skills?.apSkillName,
      ct_skill: row.card_skills?.ctSkill,
      sp_time: row.card_skills?.spTime,
      sp_value: row.card_skills?.spValue,
      comment: row.card_skills?.comment,
      // Add release info
      year: row.release_info?.year,
      month: row.release_info?.month,
      day: row.release_info?.day,
      event: row.release_info?.event,
      createtime: row.release_info?.createtime,
      updatetime: row.release_info?.updatetime,
      // Add broach info
      broach_shout: row.broach_info?.broachShout,
      broach_beat: row.broach_info?.broachBeat,
      broach_melody: row.broach_info?.broachMelody,
      broach_req: row.broach_info?.broachReq,
      // Add skill details with snake_case
      skill_details: skillDetailsResult.map((sd) => ({
        skill_level: sd.skillLevel,
        count: sd.count,
        per: sd.per,
        value: sd.value,
        rate: sd.rate
      }))
    };
  } catch (error) {
    console.error("Error fetching card:", error);
    return null;
  }
}
async function getTotalCardCount() {
  try {
    const db2 = getDb();
    const regularResult = await db2.select({ count: count() }).from(cards);
    const groupResult = await db2.select({ count: count() }).from(groupCards);
    const regularCount = regularResult[0]?.count || 0;
    const groupCount = groupResult[0]?.count || 0;
    return regularCount + groupCount;
  } catch (error) {
    console.error("Error counting cards:", error);
    return 0;
  }
}
async function searchScoreUpCards(params) {
  try {
    const db2 = getDb();
    const conditions = [];
    if (params.name) {
      conditions.push(
        or(
          ilike(cards.name, `%${params.name}%`),
          ilike(cards.cardname, `%${params.name}%`)
        )
      );
    }
    if (params.characterIds && params.characterIds.length > 0) {
      const characterNames = params.characterIds.map((id) => {
        switch (id) {
          case 1:
            return "和泉一織";
          case 2:
            return "二階堂大和";
          case 3:
            return "和泉三月";
          case 4:
            return "四葉環";
          case 5:
            return "逢坂壮五";
          case 6:
            return "六弥ナギ";
          case 7:
            return "七瀬陸";
          case 8:
            return "八乙女楽";
          case 9:
            return "九条天";
          case 10:
            return "十龍之介";
          case 11:
            return "百";
          case 12:
            return "千";
          case 13:
            return "亥清悠";
          case 14:
            return "狗丸トウマ";
          case 15:
            return "棗巳波";
          case 16:
            return "御堂虎於";
          case 17:
            return "大神万理";
          default:
            return "";
        }
      }).filter((name) => name);
      if (characterNames.length > 0) {
        conditions.push(inArray(cards.name, characterNames));
      }
    }
    if (params.costumeName) {
      conditions.push(ilike(cards.cardname, `%${params.costumeName}%`));
    }
    if (params.rarity && params.rarity.length > 0) {
      conditions.push(inArray(cards.rarity, params.rarity));
    }
    const query = db2.select().from(cards).leftJoin(cardStats, eq(cards.id, cardStats.id)).leftJoin(cardSkills, eq(cards.id, cardSkills.id)).leftJoin(releaseInfo, eq(cards.id, releaseInfo.id)).leftJoin(skillDetails, eq(cards.id, skillDetails.cardId));
    if (params.attribute && params.attribute.length > 0) {
      conditions.push(inArray(cardStats.attribute, params.attribute));
    }
    if (params.year) {
      conditions.push(eq(releaseInfo.year, params.year));
    }
    if (params.skillType && params.skillType.length > 0) {
      conditions.push(inArray(cardSkills.apSkillType, params.skillType));
    }
    if (params.eventBonus) {
      conditions.push(sql`${releaseInfo.event} IS NOT NULL AND ${releaseInfo.event} != ''`);
    }
    const filteredQuery = conditions.length > 0 ? query.where(and(...conditions)) : query;
    const result = await filteredQuery.orderBy(desc(cards.id));
    const cardMap = /* @__PURE__ */ new Map();
    for (const row of result) {
      const cardId = row.cards.id;
      if (!cardMap.has(cardId)) {
        cardMap.set(cardId, {
          ...row.cards,
          stats: row.card_stats,
          skills: row.card_skills,
          releaseInfo: row.release_info,
          skillDetails: [],
          // Add snake_case versions for compatibility
          card_id: row.cards.cardId,
          name_other: row.cards.nameOther,
          get_type: row.cards.getType,
          awakening_item: row.cards.awakeningItem,
          // Add flattened fields for compatibility
          attribute: row.card_stats?.attribute,
          shout_min: row.card_stats?.shoutMin,
          shout_max: row.card_stats?.shoutMax,
          beat_min: row.card_stats?.beatMin,
          beat_max: row.card_stats?.beatMax,
          melody_min: row.card_stats?.melodyMin,
          melody_max: row.card_stats?.melodyMax,
          ap_skill_type: row.card_skills?.apSkillType,
          ap_skill_req: row.card_skills?.apSkillReq,
          ap_skill_name: row.card_skills?.apSkillName,
          ct_skill: row.card_skills?.ctSkill,
          sp_time: row.card_skills?.spTime,
          sp_value: row.card_skills?.spValue,
          comment: row.card_skills?.comment,
          year: row.release_info?.year,
          month: row.release_info?.month,
          day: row.release_info?.day,
          event: row.release_info?.event
        });
      }
      if (row.skill_details) {
        const card = cardMap.get(cardId);
        if (!card.skillDetails) {
          card.skillDetails = [];
        }
        card.skillDetails.push({
          id: row.skill_details.id,
          cardId: row.skill_details.cardId,
          skillLevel: row.skill_details.skillLevel,
          count: row.skill_details.count,
          per: row.skill_details.per,
          value: row.skill_details.value,
          rate: row.skill_details.rate
        });
      }
    }
    return Array.from(cardMap.values());
  } catch (error) {
    console.error("Error searching score up cards:", error);
    return [];
  }
}
async function getDistinctYears() {
  try {
    const db2 = getDb();
    const result = await db2.selectDistinct({
      year: releaseInfo.year
    }).from(releaseInfo).where(sql`${releaseInfo.year} IS NOT NULL`).orderBy(desc(releaseInfo.year));
    return result.map((row) => row.year).filter((year) => year !== null);
  } catch (error) {
    console.error("Error fetching distinct years:", error);
    return [];
  }
}
async function getDistinctSkillTypes() {
  try {
    const db2 = getDb();
    const result = await db2.selectDistinct({
      apSkillType: cardSkills.apSkillType
    }).from(cardSkills).where(sql`${cardSkills.apSkillType} IS NOT NULL`).orderBy(cardSkills.apSkillType);
    return result.map((row) => row.apSkillType).filter((type) => type !== null);
  } catch (error) {
    console.error("Error fetching skill types:", error);
    return [];
  }
}
async function getCharacters() {
  return [
    { id: 1, name: "和泉一織" },
    { id: 2, name: "二階堂大和" },
    { id: 3, name: "和泉三月" },
    { id: 4, name: "四葉環" },
    { id: 5, name: "逢坂壮五" },
    { id: 6, name: "六弥ナギ" },
    { id: 7, name: "七瀬陸" },
    { id: 8, name: "八乙女楽" },
    { id: 9, name: "九条天" },
    { id: 10, name: "十龍之介" },
    { id: 11, name: "百" },
    { id: 12, name: "千" },
    { id: 13, name: "亥清悠" },
    { id: 14, name: "狗丸トウマ" },
    { id: 15, name: "棗巳波" },
    { id: 16, name: "御堂虎於" },
    { id: 17, name: "大神万理" }
  ];
}
export {
  getCards as a,
  getTotalCardCount as b,
  getDistinctYears as c,
  getDistinctSkillTypes as d,
  getCharacters as e,
  getCardById as g,
  searchScoreUpCards as s
};
