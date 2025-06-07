-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS i7card;

-- Set search path
SET search_path TO i7card;

-- Drop existing tables if they exist
DROP TABLE IF EXISTS skill_details CASCADE;
DROP TABLE IF EXISTS release_info CASCADE;
DROP TABLE IF EXISTS card_skills CASCADE;
DROP TABLE IF EXISTS card_stats CASCADE;
DROP TABLE IF EXISTS cards CASCADE;

-- Main cards table
CREATE TABLE cards (
    id INTEGER PRIMARY KEY,
    card_id INTEGER NOT NULL,
    cardname VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    name_other VARCHAR(100),
    groupname VARCHAR(100),
    rarity VARCHAR(10) NOT NULL,
    get_type VARCHAR(50),
    story TEXT,
    awakening_item INTEGER DEFAULT 0
);

-- Card statistics table
CREATE TABLE card_stats (
    id INTEGER PRIMARY KEY REFERENCES cards(id),
    attribute INTEGER,
    shout_min INTEGER,
    shout_max INTEGER,
    beat_min INTEGER,
    beat_max INTEGER,
    melody_min INTEGER,
    melody_max INTEGER
);

-- Card skills table
CREATE TABLE card_skills (
    id INTEGER PRIMARY KEY REFERENCES cards(id),
    ap_skill_type VARCHAR(100),
    ap_skill_req INTEGER,
    ap_skill_name VARCHAR(255),
    ct_skill INTEGER,
    comment TEXT,
    sp_time INTEGER,
    sp_value INTEGER
);

-- Skill details table
CREATE TABLE skill_details (
    id SERIAL PRIMARY KEY,
    card_id INTEGER REFERENCES cards(id),
    skill_level INTEGER NOT NULL,
    count INTEGER,
    per INTEGER,
    value INTEGER,
    rate INTEGER
);

-- Release information table
CREATE TABLE release_info (
    id INTEGER PRIMARY KEY REFERENCES cards(id),
    year INTEGER,
    month INTEGER,
    day INTEGER,
    event VARCHAR(255),
    createtime TIMESTAMP,
    updatetime TIMESTAMP,
    listview INTEGER DEFAULT 1
);

-- Broach information table
CREATE TABLE broach_info (
    id INTEGER PRIMARY KEY REFERENCES cards(id),
    broach_shout INTEGER,
    broach_beat INTEGER,
    broach_melody INTEGER,
    broach_req INTEGER
);

-- Skill guess information table
CREATE TABLE skill_guess (
    id INTEGER PRIMARY KEY REFERENCES cards(id),
    ap_skill_1_guess INTEGER,
    ap_skill_2_guess INTEGER,
    ap_skill_3_guess INTEGER,
    ap_skill_4_guess INTEGER,
    ap_skill_5_guess INTEGER
);

-- Create indexes
CREATE INDEX idx_cards_name ON cards(name);
CREATE INDEX idx_cards_rarity ON cards(rarity);
CREATE INDEX idx_cards_groupname ON cards(groupname);
CREATE INDEX idx_skill_details_card_id ON skill_details(card_id);