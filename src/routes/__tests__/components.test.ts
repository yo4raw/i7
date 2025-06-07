import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import HomePage from '../+page.svelte';
import CardsPage from '../cards/+page.svelte';
import CardDetailPage from '../card/[id]/+page.svelte';
import SearchPage from '../search/+page.svelte';

describe('Component Tests', () => {
  describe('Home Page Component', () => {
    it('should render home page with statistics', () => {
      const mockData = {
        totalCards: 1234,
        rarityStats: [
          { rarity: 'SSR', count: 100 },
          { rarity: 'SR', count: 200 }
        ],
        characterStats: [
          { name: 'Yamato', count: 50 }
        ],
        recentCards: [
          { id: 1, cardname: 'Recent Card 1', name: 'Character 1', rarity: 'SSR' }
        ]
      };

      render(HomePage, { props: { data: mockData } });

      expect(screen.getByText('アイドリッシュセブン 攻略ガイド')).toBeInTheDocument();
      expect(screen.getByText('1234')).toBeInTheDocument();
      expect(screen.getByText('Recent Card 1')).toBeInTheDocument();
    });
  });

  describe('Cards Page Component', () => {
    it('should render cards grid', () => {
      const mockData = {
        cards: [
          { id: 1, cardname: 'Card 1', name: 'Character 1', rarity: 'SSR' },
          { id: 2, cardname: 'Card 2', name: 'Character 2', rarity: 'SR' }
        ],
        totalCards: 100,
        currentPage: 1
      };

      render(CardsPage, { props: { data: mockData } });

      expect(screen.getByText('カード一覧')).toBeInTheDocument();
      expect(screen.getByText('全 100 枚')).toBeInTheDocument();
      expect(screen.getByText('Card 1')).toBeInTheDocument();
      expect(screen.getByText('Card 2')).toBeInTheDocument();
    });
  });

  describe('Card Detail Component', () => {
    it('should render card details', () => {
      const mockData = {
        card: {
          id: 1,
          cardname: 'Test Card',
          name: 'Test Character',
          name_other: 'Test Alias',
          groupname: 'Test Group',
          rarity: 'SSR',
          get_type: 'Gacha',
          attribute: 1,
          story: 'Test story content',
          shout_min: 100,
          shout_max: 1000,
          beat_min: 200,
          beat_max: 2000,
          melody_min: 300,
          melody_max: 3000,
          ap_skill_name: 'Test Skill',
          ap_skill_type: 'Score Up',
          ap_skill_req: 10,
          ct_skill: 5,
          sp_time: 30,
          sp_value: 100,
          year: 2024,
          month: 1,
          day: 1,
          event: 'Test Event'
        },
        skillDetails: [
          { skill_level: 1, count: 1, per: 50, value: 100, rate: 80 }
        ]
      };

      render(CardDetailPage, { props: { data: mockData } });

      expect(screen.getByText('Test Card')).toBeInTheDocument();
      expect(screen.getByText('Test Character')).toBeInTheDocument();
      expect(screen.getByText('SSR')).toBeInTheDocument();
      expect(screen.getByText('Test story content')).toBeInTheDocument();
      expect(screen.getByText('1000')).toBeInTheDocument(); // shout_max
    });
  });

  describe('Search Page Component', () => {
    it('should render search form', () => {
      const mockData = {
        results: null,
        rarities: [
          { rarity: 'SSR', count: 100 },
          { rarity: 'SR', count: 200 }
        ],
        characters: [
          { name: 'Yamato', count: 50 },
          { name: 'Nagi', count: 45 }
        ],
        query: '',
        selectedRarity: '',
        selectedCharacter: '',
        selectedAttribute: ''
      };

      render(SearchPage, { props: { data: mockData } });

      expect(screen.getByText('カード検索')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('カード名、キャラクター名で検索')).toBeInTheDocument();
      expect(screen.getByText('検索')).toBeInTheDocument();
    });

    it('should render search results', () => {
      const mockData = {
        results: [
          { id: 1, cardname: 'Result Card 1', name: 'Character 1', rarity: 'SSR' },
          { id: 2, cardname: 'Result Card 2', name: 'Character 2', rarity: 'SR' }
        ],
        rarities: [],
        characters: [],
        query: 'Result',
        selectedRarity: '',
        selectedCharacter: '',
        selectedAttribute: ''
      };

      render(SearchPage, { props: { data: mockData } });

      expect(screen.getByText('検索結果 (2件)')).toBeInTheDocument();
      expect(screen.getByText('Result Card 1')).toBeInTheDocument();
      expect(screen.getByText('Result Card 2')).toBeInTheDocument();
    });
  });
});