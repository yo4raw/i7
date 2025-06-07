import { describe, it, expect, vi } from 'vitest';
import { load as homeLoad } from '../+page.server';
import { load as cardsLoad } from '../cards/+page.server';
import { load as cardDetailLoad } from '../card/[id]/+page.server';
import { load as searchLoad } from '../search/+page.server';
import { load as charactersLoad } from '../characters/+page.server';
import { load as rarityLoad } from '../rarity/+page.server';
import { error } from '@sveltejs/kit';

// Mock database functions
vi.mock('$lib/db', () => ({
  getCards: vi.fn(),
  getTotalCardCount: vi.fn(),
  getRarityStats: vi.fn(),
  getCharacterStats: vi.fn(),
  getCardById: vi.fn(),
  getSkillDetails: vi.fn(),
  searchCards: vi.fn(),
  getCardsByRarity: vi.fn(),
  getCardsByCharacter: vi.fn(),
  getCardsByAttribute: vi.fn()
}));

import * as db from '$lib/db';

describe('Page Server Load Functions', () => {
  describe('Home Page', () => {
    it('should load home page data', async () => {
      vi.mocked(db.getTotalCardCount).mockResolvedValue(1000);
      vi.mocked(db.getRarityStats).mockResolvedValue([
        { rarity: 'SSR', count: 100 }
      ]);
      vi.mocked(db.getCharacterStats).mockResolvedValue([
        { name: 'Yamato', count: 50 }
      ]);
      vi.mocked(db.getCards).mockResolvedValue([
        { id: 1, cardname: 'Recent Card' }
      ]);

      const result = await homeLoad();

      expect(result).toEqual({
        totalCards: 1000,
        rarityStats: [{ rarity: 'SSR', count: 100 }],
        characterStats: [{ name: 'Yamato', count: 50 }],
        recentCards: [{ id: 1, cardname: 'Recent Card' }]
      });
    });
  });

  describe('Cards Page', () => {
    it('should load cards with pagination', async () => {
      const mockCards = [
        { id: 1, cardname: 'Card 1' },
        { id: 2, cardname: 'Card 2' }
      ];
      vi.mocked(db.getCards).mockResolvedValue(mockCards);
      vi.mocked(db.getTotalCardCount).mockResolvedValue(100);

      const url = new URL('http://localhost/cards?page=2');
      const result = await cardsLoad({ url });

      expect(db.getCards).toHaveBeenCalledWith(50, 50);
      expect(result).toEqual({
        cards: mockCards,
        totalCards: 100,
        currentPage: 2
      });
    });

    it('should default to page 1', async () => {
      vi.mocked(db.getCards).mockResolvedValue([]);
      vi.mocked(db.getTotalCardCount).mockResolvedValue(0);

      const url = new URL('http://localhost/cards');
      const result = await cardsLoad({ url });

      expect(db.getCards).toHaveBeenCalledWith(50, 0);
      expect(result.currentPage).toBe(1);
    });
  });

  describe('Card Detail Page', () => {
    it('should load card details', async () => {
      const mockCard = {
        id: 1,
        cardname: 'Test Card',
        name: 'Test Character'
      };
      const mockSkillDetails = [
        { skill_level: 1, value: 100 }
      ];

      vi.mocked(db.getCardById).mockResolvedValue(mockCard);
      vi.mocked(db.getSkillDetails).mockResolvedValue(mockSkillDetails);

      const result = await cardDetailLoad({ params: { id: '1' } });

      expect(result).toEqual({
        card: mockCard,
        skillDetails: mockSkillDetails
      });
    });

    it('should throw 404 for invalid card ID', async () => {
      await expect(
        cardDetailLoad({ params: { id: 'invalid' } })
      ).rejects.toEqual(error(404, 'Invalid card ID'));
    });

    it('should throw 404 when card not found', async () => {
      vi.mocked(db.getCardById).mockResolvedValue(null);

      await expect(
        cardDetailLoad({ params: { id: '999' } })
      ).rejects.toEqual(error(404, 'Card not found'));
    });
  });

  describe('Search Page', () => {
    it('should load search page without results initially', async () => {
      vi.mocked(db.getRarityStats).mockResolvedValue([
        { rarity: 'SSR', count: 100 }
      ]);
      vi.mocked(db.getCharacterStats).mockResolvedValue([
        { name: 'Yamato', count: 50 }
      ]);

      const url = new URL('http://localhost/search');
      const result = await searchLoad({ url });

      expect(result).toEqual({
        results: null,
        rarities: [{ rarity: 'SSR', count: 100 }],
        characters: [{ name: 'Yamato', count: 50 }],
        query: '',
        selectedRarity: '',
        selectedCharacter: '',
        selectedAttribute: ''
      });
    });

    it('should search by query', async () => {
      const mockResults = [{ id: 1, cardname: 'Matching Card' }];
      vi.mocked(db.searchCards).mockResolvedValue(mockResults);
      vi.mocked(db.getRarityStats).mockResolvedValue([]);
      vi.mocked(db.getCharacterStats).mockResolvedValue([]);

      const url = new URL('http://localhost/search?q=Matching');
      const result = await searchLoad({ url });

      expect(db.searchCards).toHaveBeenCalledWith('Matching');
      expect(result.results).toEqual(mockResults);
      expect(result.query).toBe('Matching');
    });

    it('should filter by rarity', async () => {
      const mockResults = [{ id: 1, cardname: 'SSR Card', rarity: 'SSR' }];
      vi.mocked(db.getCardsByRarity).mockResolvedValue(mockResults);
      vi.mocked(db.getRarityStats).mockResolvedValue([]);
      vi.mocked(db.getCharacterStats).mockResolvedValue([]);

      const url = new URL('http://localhost/search?rarity=SSR');
      const result = await searchLoad({ url });

      expect(db.getCardsByRarity).toHaveBeenCalledWith('SSR');
      expect(result.results).toEqual(mockResults);
    });
  });

  describe('Characters Page', () => {
    it('should load character statistics', async () => {
      const mockCharacters = [
        { name: 'Yamato', count: 50 },
        { name: 'Nagi', count: 45 }
      ];
      vi.mocked(db.getCharacterStats).mockResolvedValue(mockCharacters);

      const result = await charactersLoad();

      expect(result).toEqual({
        characters: mockCharacters
      });
    });
  });

  describe('Rarity Page', () => {
    it('should load rarity statistics with total count', async () => {
      const mockRarities = [
        { rarity: 'SSR', count: 100 },
        { rarity: 'SR', count: 200 }
      ];
      vi.mocked(db.getRarityStats).mockResolvedValue(mockRarities);
      vi.mocked(db.getTotalCardCount).mockResolvedValue(1000);

      const result = await rarityLoad();

      expect(result).toEqual({
        rarities: mockRarities,
        totalCards: 1000
      });
    });
  });
});