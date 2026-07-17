import { describe, test, expect } from 'vitest';
import { parseVTT, getActiveCueText } from './subtitleExtractor';

describe('Subtitle Extractor', () => {
  describe('parseVTT', () => {
    test('parses valid VTT content', () => {
      const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
Merhaba dünya

2
00:00:05.000 --> 00:00:08.000
Bu bir test altyazısı`;

      const cues = parseVTT(vtt);
      expect(cues).toHaveLength(2);
      expect(cues[0].text).toBe('Merhaba dünya');
      expect(cues[0].start).toBe(1);
      expect(cues[0].end).toBe(4);
      expect(cues[1].text).toBe('Bu bir test altyazısı');
    });

    test('returns empty array for null/undefined', () => {
      expect(parseVTT(null)).toEqual([]);
      expect(parseVTT(undefined)).toEqual([]);
      expect(parseVTT('')).toEqual([]);
    });

    test('handles multi-line text', () => {
      const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
Satır 1
Satır 2`;

      const cues = parseVTT(vtt);
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('Satır 1\nSatır 2');
    });

    test('strips HTML tags from text', () => {
      const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
<b>Kalın</b> ve <i>italik</i>`;

      const cues = parseVTT(vtt);
      expect(cues[0].text).toBe('Kalın ve italik');
    });

    test('handles different time formats', () => {
      const vtt = `WEBVTT

1
01:30:00.000 --> 02:00:00.000
Uzun süre`;

      const cues = parseVTT(vtt);
      expect(cues[0].start).toBe(5400); // 1.5 hours
      expect(cues[0].end).toBe(7200); // 2 hours
    });

    test('skips invalid cues (end before start)', () => {
      const vtt = `WEBVTT

1
00:00:05.000 --> 00:00:01.000
Geçersiz`;

      const cues = parseVTT(vtt);
      expect(cues).toHaveLength(0);
    });
  });

  describe('getActiveCueText', () => {
    const cues = [
      { id: '1', start: 1, end: 4, text: 'Birinci cue' },
      { id: '2', start: 5, end: 8, text: 'İkinci cue' },
      { id: '3', start: 10, end: 15, text: 'Üçüncü cue' },
    ];

    test('returns active cue text at given time', () => {
      expect(getActiveCueText(cues, 2)).toBe('Birinci cue');
      expect(getActiveCueText(cues, 6)).toBe('İkinci cue');
      expect(getActiveCueText(cues, 12)).toBe('Üçüncü cue');
    });

    test('returns empty string when no cue is active', () => {
      expect(getActiveCueText(cues, 0)).toBe('');
      expect(getActiveCueText(cues, 4.5)).toBe('');
      expect(getActiveCueText(cues, 20)).toBe('');
    });

    test('returns empty string for null/empty cues', () => {
      expect(getActiveCueText(null, 2)).toBe('');
      expect(getActiveCueText([], 2)).toBe('');
    });

    test('returns combined text for overlapping cues', () => {
      const overlappingCues = [
        { id: '1', start: 1, end: 5, text: 'Üstteki' },
        { id: '2', start: 2, end: 4, text: 'Alttaki' },
      ];
      const result = getActiveCueText(overlappingCues, 3);
      expect(result).toContain('Üstteki');
      expect(result).toContain('Alttaki');
    });
  });
});
