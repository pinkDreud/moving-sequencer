import { describe, expect, it } from 'vitest';
import type { Sound } from '../core/model';
import { KIT, newRecordingSound, RECORDING_COLORS } from './sounds';

const rec = (id: string, name: string): Sound => ({ id, name, color: '#fff', source: 'recording' });

describe('newRecordingSound', () => {
  it('makes "Rec 1" with a rec- id and the first recording color when there are no recordings', () => {
    expect(newRecordingSound(KIT, 'ab12cd34')).toEqual({
      id: 'rec-ab12cd34',
      name: 'Rec 1',
      color: RECORDING_COLORS[0],
      source: 'recording',
    });
  });

  it('numbers after the highest existing recording, without reusing lower gaps', () => {
    const sounds = [...KIT, rec('rec-x', 'Rec 3'), rec('rec-y', 'Rec 1')];
    expect(newRecordingSound(sounds, 'z').name).toBe('Rec 4');
  });

  it('ignores kit sounds and recordings with other names when numbering', () => {
    const kitNamedRec: Sound = { id: 'kick', name: 'Rec 9', color: '#000', source: 'kit' };
    const sounds = [...KIT, kitNamedRec, rec('rec-x', 'Voice')];
    expect(newRecordingSound(sounds, 'z').name).toBe('Rec 1');
  });

  it('cycles through the recording colors', () => {
    const sounds = RECORDING_COLORS.map((_, i) => rec(`rec-${i}`, `Rec ${i + 1}`));
    expect(newRecordingSound(sounds, 'z').color).toBe(RECORDING_COLORS[0]);
    expect(newRecordingSound(sounds.slice(0, 1), 'z').color).toBe(RECORDING_COLORS[1]);
  });

  it('never collides with a kit id or color', () => {
    const kitIds = new Set(KIT.map((s) => s.id));
    expect(kitIds.has(newRecordingSound(KIT, 'kick').id)).toBe(false);
    expect([...kitIds].some((id) => id.startsWith('rec-'))).toBe(false);
    const kitColors = new Set(KIT.map((s) => s.color));
    expect(RECORDING_COLORS.some((c) => kitColors.has(c))).toBe(false);
    expect(new Set(RECORDING_COLORS).size).toBe(RECORDING_COLORS.length);
  });
});
