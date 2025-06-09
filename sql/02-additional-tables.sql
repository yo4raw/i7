-- Additional tables for complete data import

-- Songs table (from GID=1083871743)
CREATE TABLE IF NOT EXISTS i7card.songs (
    id SERIAL PRIMARY KEY,
    song_id INTEGER UNIQUE,
    category VARCHAR(100),
    artist_name VARCHAR(200),
    song_name VARCHAR(200),
    song_type VARCHAR(50),
    difficulty VARCHAR(50),
    star_rating INTEGER,
    shout_percentage DECIMAL(5,2),
    beat_percentage DECIMAL(5,2),
    melody_percentage DECIMAL(5,2),
    notes_count INTEGER,
    duration_seconds INTEGER,
    update_date DATE,
    CONSTRAINT unique_song_id UNIQUE (song_id)
);

-- Group cards table (from GID=1087762308)
CREATE TABLE IF NOT EXISTS i7card.group_cards (
    id INTEGER PRIMARY KEY,
    card_id INTEGER,
    cardname VARCHAR(255),
    group_name VARCHAR(100),
    members TEXT,
    shout_value INTEGER,
    beat_value INTEGER,
    melody_value INTEGER,
    attribute INTEGER,
    idol_type VARCHAR(50),
    group_type VARCHAR(50),
    auto_score INTEGER,
    song_score INTEGER,
    score_limit INTEGER,
    broach_type VARCHAR(100),
    CONSTRAINT unique_group_card_id UNIQUE (id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_songs_artist ON i7card.songs(artist_name);
CREATE INDEX IF NOT EXISTS idx_songs_type ON i7card.songs(song_type);
CREATE INDEX IF NOT EXISTS idx_group_cards_group ON i7card.group_cards(group_name);
CREATE INDEX IF NOT EXISTS idx_group_cards_attribute ON i7card.group_cards(attribute);