export interface SharedBroach {
  id: number;
  name: string;
  shout: number;
  beat: number;
  melody: number;
}

export const SHARED_BROACHS: SharedBroach[] = [
  { id: 1, name: 'ALL750', shout: 750, beat: 750, melody: 750 },
  { id: 2, name: 'ALL700', shout: 700, beat: 700, melody: 700 },
  { id: 3, name: 'ALL500', shout: 500, beat: 500, melody: 500 },
  { id: 4, name: 'ALL300', shout: 300, beat: 300, melody: 300 },
  { id: 5, name: 'ALL200', shout: 200, beat: 200, melody: 200 },
  { id: 6, name: 'Shout1100', shout: 1100, beat: 0, melody: 0 },
  { id: 7, name: 'Shout1000', shout: 1000, beat: 0, melody: 0 },
  { id: 8, name: 'Shout900', shout: 900, beat: 0, melody: 0 },
  { id: 9, name: 'Shout700', shout: 700, beat: 0, melody: 0 },
  { id: 10, name: 'Shout400', shout: 400, beat: 0, melody: 0 },
  { id: 11, name: 'Beat1100', shout: 0, beat: 1100, melody: 0 },
  { id: 12, name: 'Beat1000', shout: 0, beat: 1000, melody: 0 },
  { id: 13, name: 'Beat900', shout: 0, beat: 900, melody: 0 },
  { id: 14, name: 'Beat700', shout: 0, beat: 700, melody: 0 },
  { id: 15, name: 'Beat500', shout: 0, beat: 500, melody: 0 },
  { id: 16, name: 'Beat400', shout: 0, beat: 400, melody: 0 },
  { id: 17, name: 'Melody1100', shout: 0, beat: 0, melody: 1100 },
  { id: 18, name: 'Melody1000', shout: 0, beat: 0, melody: 1000 },
  { id: 19, name: 'Melody900', shout: 0, beat: 0, melody: 900 },
  { id: 20, name: 'Melody700', shout: 0, beat: 0, melody: 700 },
  { id: 21, name: 'Melody400', shout: 0, beat: 0, melody: 400 },
];
