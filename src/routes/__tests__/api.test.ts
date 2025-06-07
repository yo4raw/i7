import { describe, it, expect, vi, beforeEach } from 'vitest';
import { json } from '@sveltejs/kit';

// Mock database functions
vi.mock('$lib/db', () => ({
  getCards: vi.fn(),
  searchCards: vi.fn(),
  getCardById: vi.fn(),
  getSkillDetails: vi.fn(),
  getTotalCardCount: vi.fn(),
  getRarityStats: vi.fn(),
  getCharacterStats: vi.fn()
}));

import { GET as getCards } from '../api/cards/+server';
import { GET as getCardById } from '../api/cards/[id]/+server';
import { GET as getStats } from '../api/stats/+server';
import * as db from '$lib/db';

describe('API Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('/api/cards', () => {
    it('should return cards with default pagination', async () => {
      const mockCards = [
        { id: 1, cardname: 'Card 1' },
        { id: 2, cardname: 'Card 2' }
      ];
      vi.mocked(db.getCards).mockResolvedValue(mockCards);

      const request = new Request('http://localhost/api/cards');
      const response = await getCards({ request, url: new URL(request.url) } as any);
      const data = await response.json();

      expect(db.getCards).toHaveBeenCalledWith(50, 0);
      expect(data).toEqual({
        success: true,
        data: mockCards,
        count: 2
      });
    });

    it('should return cards with custom pagination', async () => {
      const mockCards = [{ id: 3, cardname: 'Card 3' }];
      vi.mocked(db.getCards).mockResolvedValue(mockCards);

      const request = new Request('http://localhost/api/cards?limit=10&offset=20');
      const response = await getCards({ request, url: new URL(request.url) } as any);
      const data = await response.json();

      expect(db.getCards).toHaveBeenCalledWith(10, 20);
      expect(data.count).toBe(1);
    });

    it('should search cards when query is provided', async () => {
      const mockCards = [{ id: 1, cardname: 'Matching Card' }];
      vi.mocked(db.searchCards).mockResolvedValue(mockCards);

      const request = new Request('http://localhost/api/cards?q=Matching');
      const response = await getCards({ request, url: new URL(request.url) } as any);
      const data = await response.json();

      expect(db.searchCards).toHaveBeenCalledWith('Matching');
      expect(data.data).toEqual(mockCards);
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(db.getCards).mockRejectedValue(new Error('Database error'));

      const request = new Request('http://localhost/api/cards');
      const response = await getCards({ request, url: new URL(request.url) } as any);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({
        success: false,
        error: 'Failed to fetch cards'
      });
    });
  });

  describe('/api/cards/[id]', () => {
    it('should return card details with skill details', async () => {
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

      const response = await getCardById({ params: { id: '1' } } as any);
      const data = await response.json();

      expect(db.getCardById).toHaveBeenCalledWith(1);
      expect(db.getSkillDetails).toHaveBeenCalledWith(1);
      expect(data).toEqual({
        success: true,
        data: {
          ...mockCard,
          skillDetails: mockSkillDetails
        }
      });
    });

    it('should return 400 for invalid card ID', async () => {
      const response = await getCardById({ params: { id: 'invalid' } } as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({
        success: false,
        error: 'Invalid card ID'
      });
    });

    it('should return 404 when card not found', async () => {
      vi.mocked(db.getCardById).mockResolvedValue(null);

      const response = await getCardById({ params: { id: '999' } } as any);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({
        success: false,
        error: 'Card not found'
      });
    });
  });

  describe('/api/stats', () => {
    it('should return all statistics', async () => {
      const mockStats = {
        totalCards: 1234,
        rarityStats: [{ rarity: 'SSR', count: 100 }],
        characterStats: [{ name: 'Yamato', count: 50 }]
      };

      vi.mocked(db.getTotalCardCount).mockResolvedValue(1234);
      vi.mocked(db.getRarityStats).mockResolvedValue([{ rarity: 'SSR', count: 100 }]);
      vi.mocked(db.getCharacterStats).mockResolvedValue([{ name: 'Yamato', count: 50 }]);

      const request = new Request('http://localhost/api/stats');
      const response = await getStats({ request } as any);
      const data = await response.json();

      expect(data).toEqual({
        success: true,
        data: mockStats
      });
    });

    it('should handle stats errors', async () => {
      vi.mocked(db.getTotalCardCount).mockRejectedValue(new Error('Database error'));

      const request = new Request('http://localhost/api/stats');
      const response = await getStats({ request } as any);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({
        success: false,
        error: 'Failed to fetch statistics'
      });
    });
  });
});