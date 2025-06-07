import { describe, it, expect, vi, beforeEach } from 'vitest';
import { neon } from '@neondatabase/serverless';

// Mock the neon module
vi.mock('@neondatabase/serverless', () => ({
  neon: vi.fn()
}));

// Mock environment variable
vi.mock('$env/static/private', () => ({
  DATABASE_URL: 'postgresql://test:test@localhost/test?sslmode=require'
}));

// Import after mocks are set up
import {
  getCards,
  getCardById,
  getSkillDetails,
  searchCards,
  getCardsByRarity,
  getCardsByCharacter,
  getCardsByAttribute,
  getTotalCardCount,
  getRarityStats,
  getCharacterStats
} from '../db';

describe('Database Functions', () => {
  const mockSql = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
    (neon as any).mockReturnValue(mockSql);
  });

  describe('getCards', () => {
    it('should fetch cards with default limit and offset', async () => {
      const mockCards = [
        { id: 1, cardname: 'Card 1', name: 'Character 1' },
        { id: 2, cardname: 'Card 2', name: 'Character 2' }
      ];
      mockSql.mockResolvedValue(mockCards);

      const result = await getCards();

      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining(['SELECT * FROM i7card.cards']),
        50, 0
      );
      expect(result).toEqual(mockCards);
    });

    it('should fetch cards with custom limit and offset', async () => {
      const mockCards = [{ id: 3, cardname: 'Card 3', name: 'Character 3' }];
      mockSql.mockResolvedValue(mockCards);

      const result = await getCards(10, 20);

      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining(['SELECT * FROM i7card.cards']),
        10, 20
      );
      expect(result).toEqual(mockCards);
    });
  });

  describe('getCardById', () => {
    it('should fetch a single card by ID', async () => {
      const mockCard = {
        id: 1,
        cardname: 'Test Card',
        name: 'Test Character',
        attribute: 1,
        shout_max: 1000
      };
      mockSql.mockResolvedValue([mockCard]);

      const result = await getCardById(1);

      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining(['SELECT']),
        1
      );
      expect(result).toEqual(mockCard);
    });

    it('should return undefined when card not found', async () => {
      mockSql.mockResolvedValue([]);

      const result = await getCardById(999);

      expect(result).toBeUndefined();
    });
  });

  describe('getSkillDetails', () => {
    it('should fetch skill details for a card', async () => {
      const mockSkillDetails = [
        { id: 1, card_id: 1, skill_level: 1, value: 100 },
        { id: 2, card_id: 1, skill_level: 2, value: 200 }
      ];
      mockSql.mockResolvedValue(mockSkillDetails);

      const result = await getSkillDetails(1);

      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining(['SELECT * FROM i7card.skill_details']),
        1
      );
      expect(result).toEqual(mockSkillDetails);
    });
  });

  describe('searchCards', () => {
    it('should search cards by query', async () => {
      const mockSearchResults = [
        { id: 1, cardname: 'Matching Card', name: 'Character' }
      ];
      mockSql.mockResolvedValue(mockSearchResults);

      const result = await searchCards('Matching');

      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining(['SELECT * FROM i7card.cards']),
        '%Matching%'
      );
      expect(result).toEqual(mockSearchResults);
    });

    it('should handle empty search results', async () => {
      mockSql.mockResolvedValue([]);

      const result = await searchCards('NonExistent');

      expect(result).toEqual([]);
    });
  });

  describe('getCardsByRarity', () => {
    it('should fetch cards by rarity', async () => {
      const mockCards = [
        { id: 1, cardname: 'SSR Card', rarity: 'SSR' }
      ];
      mockSql.mockResolvedValue(mockCards);

      const result = await getCardsByRarity('SSR');

      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining(['WHERE rarity =']),
        'SSR'
      );
      expect(result).toEqual(mockCards);
    });
  });

  describe('getCardsByCharacter', () => {
    it('should fetch cards by character name', async () => {
      const mockCards = [
        { id: 1, cardname: 'Character Card', name: 'Yamato' }
      ];
      mockSql.mockResolvedValue(mockCards);

      const result = await getCardsByCharacter('Yamato');

      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining(['WHERE name =']),
        'Yamato'
      );
      expect(result).toEqual(mockCards);
    });
  });

  describe('getCardsByAttribute', () => {
    it('should fetch cards by attribute', async () => {
      const mockCards = [
        { id: 1, cardname: 'Shout Card', attribute: 1 }
      ];
      mockSql.mockResolvedValue(mockCards);

      const result = await getCardsByAttribute(1);

      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining(['WHERE cs.attribute =']),
        1
      );
      expect(result).toEqual(mockCards);
    });
  });

  describe('getTotalCardCount', () => {
    it('should return total card count', async () => {
      mockSql.mockResolvedValue([{ count: 1234 }]);

      const result = await getTotalCardCount();

      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining(['SELECT COUNT(*) as count FROM i7card.cards'])
      );
      expect(result).toBe(1234);
    });
  });

  describe('getRarityStats', () => {
    it('should return rarity statistics', async () => {
      const mockStats = [
        { rarity: 'SSR', count: 100 },
        { rarity: 'SR', count: 200 },
        { rarity: 'R', count: 300 }
      ];
      mockSql.mockResolvedValue(mockStats);

      const result = await getRarityStats();

      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining(['GROUP BY rarity'])
      );
      expect(result).toEqual(mockStats);
    });
  });

  describe('getCharacterStats', () => {
    it('should return character statistics', async () => {
      const mockStats = [
        { name: 'Yamato', count: 50 },
        { name: 'Nagi', count: 45 }
      ];
      mockSql.mockResolvedValue(mockStats);

      const result = await getCharacterStats();

      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining(['GROUP BY name'])
      );
      expect(result).toEqual(mockStats);
    });
  });
});