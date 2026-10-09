export type HolePosition = 'left' | 'right' | 'top';
export type Mode = 'laser' | 'print3d';

export interface KeychainParams {
  text: string;
  fontId: string;
  fontSize: number;
  textWeight: number;
  letterSpacing: number;
  outlineWidth: number;
  iconEnabled: boolean;
  iconName: string;
  iconSize: number;
  iconGap: number;
  holeEnabled: boolean;
  holePosition: HolePosition;
  holeOffset: number;
  holeDiameter: number;
  holeMargin: number;
  mode: Mode;
  baseThickness: number;
  reliefHeight: number;
  pocketDepth: number;
  clearance: number;
  baseColor: string;
  lettersColor: string;
}

export const DEFAULT_PARAMS: KeychainParams = {
  text: 'Lexie',
  fontId: 'pacifico',
  fontSize: 30,
  textWeight: 0,
  letterSpacing: 0.3,
  outlineWidth: 3,
  iconEnabled: false,
  iconName: 'emotion-laugh-fill',
  iconSize: 20,
  iconGap: 2,
  holeEnabled: true,
  holePosition: 'left',
  holeOffset: 0,
  holeDiameter: 4,
  holeMargin: 2.5,
  mode: 'laser',
  baseThickness: 3,
  reliefHeight: 1.5,
  pocketDepth: 0.6,
  clearance: 0.15,
  baseColor: '#c8b496',
  lettersColor: '#ffffff',
};
