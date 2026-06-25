export type KickbacksCardKind = 'terminal' | 'sponsor' | 'verified-events';

export interface KickbacksRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface KickbacksCard {
  id: string;
  kind: KickbacksCardKind;
  title: string;
  rect: KickbacksRect;
  zIndex: number;
}

export interface KickbacksDeck {
  id: 'kickbacks-home';
  name: 'Kickbacks';
  viewport: {
    panX: number;
    panY: number;
    scale: number;
  };
  cards: KickbacksCard[];
}

export type SettingsSectionId =
  | 'account'
  | 'address'
  | 'payout'
  | 'privacy'
  | 'terminal';

export interface SettingsSection {
  id: SettingsSectionId;
  label: string;
}

export const settingsSections: readonly SettingsSection[] = [
  { id: 'account', label: 'Account' },
  { id: 'address', label: 'Address' },
  { id: 'payout', label: 'Payout' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'terminal', label: 'Terminal' },
];

export function defaultKickbacksDeck(): KickbacksDeck {
  return {
    id: 'kickbacks-home',
    name: 'Kickbacks',
    viewport: {
      panX: 76,
      panY: 64,
      scale: 1,
    },
    cards: [
      {
        id: 'terminal-card',
        kind: 'terminal',
        title: 'Terminal',
        rect: { x: 0, y: 0, width: 820, height: 520 },
        zIndex: 1,
      },
      {
        id: 'sponsor-card',
        kind: 'sponsor',
        title: 'Sponsor',
        rect: { x: 860, y: 0, width: 320, height: 254 },
        zIndex: 2,
      },
      {
        id: 'verified-events-card',
        kind: 'verified-events',
        title: 'Verified events',
        rect: { x: 860, y: 286, width: 320, height: 234 },
        zIndex: 3,
      },
    ],
  };
}

export function workspaceCardKinds(
  deck: Pick<KickbacksDeck, 'cards'>,
): KickbacksCardKind[] {
  return deck.cards.map((card) => card.kind);
}
