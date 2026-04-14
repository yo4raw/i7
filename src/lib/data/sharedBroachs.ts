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
  { id: 6, name: 'Shout700', shout: 700, beat: 0, melody: 0 },
  { id: 7, name: 'Shout400', shout: 400, beat: 0, melody: 0 },
  { id: 8, name: 'Beat700', shout: 0, beat: 700, melody: 0 },
  { id: 9, name: 'Beat400', shout: 0, beat: 400, melody: 0 },
  { id: 10, name: 'Melody700', shout: 0, beat: 0, melody: 700 },
  { id: 11, name: 'Melody400', shout: 0, beat: 0, melody: 400 },
];
