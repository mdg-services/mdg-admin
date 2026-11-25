import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api';
import type { KavachTaskDef } from '@dk/shared';

import {
  blankTaskFields,
  bodyFromFields,
  codeFromTitle,
  diffOverride,
  fieldErrorsFromApi,
  fieldsFromTask,
  validateTaskFields,
  withHidden,
  withOverride,
} from './kavachForm';

const SHARED: KavachTaskDef = {
  code: 'stock-board',
  srNo: 12,
  titleEn: 'Stock board',
  titleHi: 'स्टॉक बोर्ड',
  howToEn: 'Show the board',
  howToHi: 'बोर्ड दिखाएँ',
  points: 20,
  everyDays: 1,
  dueTime: '10:00',
  how: 'photo',
  uploader: 'manager',
  source: null,
  sheet: null,
  panels: ['stock'],
  group: 'daily',
  iocOnly: false,
  acceptsFile: false,
  active: true,
  sort: 12,
};

describe('validating a point before it is sent', () => {
  it('accepts a good point', () => {
    expect(validateTaskFields({ ...blankTaskFields(), titleEn: 'A', titleHi: 'क' })).toEqual({});
  });

  it('asks for both titles', () => {
    const e = validateTaskFields(blankTaskFields());
    expect(e.titleEn).toBeTruthy();
    expect(e.titleHi).toBeTruthy();
  });

  it('a data point needs a source and a sheet point needs a sheet', () => {
    const base = { ...blankTaskFields(), titleEn: 'A', titleHi: 'क' };
    expect(validateTaskFields({ ...base, how: 'data' }).source).toBe('Pick where the data comes from');
    expect(validateTaskFields({ ...base, how: 'sheet' }).sheet).toBe('Pick which sheet MDG makes');
    expect(validateTaskFields({ ...base, how: 'data', source: 'licence-dto' })).toEqual({});
  });

  it('a due time is only for daily points', () => {
    const base = { ...blankTaskFields(), titleEn: 'A', titleHi: 'क', dueTime: '10:00' };
    expect(validateTaskFields({ ...base, everyDays: 7 }).dueTime).toBe('A due time is only for daily points');
    expect(validateTaskFields({ ...base, everyDays: 1 })).toEqual({});
    expect(validateTaskFields({ ...base, dueTime: '25:00' }).dueTime).toBe('Use HH:MM, like 10:00');
  });

  it('checks points and days are whole numbers in range', () => {
    const base = { ...blankTaskFields(), titleEn: 'A', titleHi: 'क' };
    expect(validateTaskFields({ ...base, points: 5001 }).points).toBeTruthy();
    expect(validateTaskFields({ ...base, points: Number.NaN }).points).toBeTruthy();
    expect(validateTaskFields({ ...base, everyDays: 0 }).everyDays).toBeTruthy();
    expect(validateTaskFields({ ...base, everyDays: null })).toEqual({});
  });
});

describe('what is sent', () => {
  it('clears the fields that do not apply', () => {
    const body = bodyFromFields({
      ...blankTaskFields(),
      titleEn: '  Toilet  ',
      titleHi: 'शौचालय',
      how: 'photo',
      source: 'licence-dto',
      sheet: 'dsr-book',
      everyDays: 7,
      dueTime: '10:00',
    });
    expect(body).toMatchObject({ titleEn: 'Toilet', source: null, sheet: null, dueTime: null });
  });
});

describe('the server’s messages, shown under the field', () => {
  it('reads zod issues, with or without the task prefix', () => {
    const err = new ApiError(400, 'VALIDATION_ERROR', 'Invalid request payload', [
      { path: ['task', 'source'], message: 'Pick where the data comes from' },
      { path: ['titleEn'], message: 'Too long' },
      { path: ['titleEn'], message: 'second one ignored' },
    ]);
    expect(fieldErrorsFromApi(err)).toEqual({ source: 'Pick where the data comes from', titleEn: 'Too long' });
  });

  it('returns nothing for any other error', () => {
    expect(fieldErrorsFromApi(new Error('boom'))).toEqual({});
    expect(fieldErrorsFromApi(new ApiError(500, 'X', 'x'))).toEqual({});
  });

  it('makes a code from the title', () => {
    expect(codeFromTitle('Update DSR before 10 am!')).toBe('update-dsr-before-10-am');
    expect(codeFromTitle('क')).toBe('');
  });
});

describe('an outlet’s own version of a shared point', () => {
  it('keeps only what is different', () => {
    const edited = { ...fieldsFromTask(SHARED), points: 30, howToEn: 'Show the whole board' };
    expect(diffOverride(SHARED, edited)).toEqual({ code: 'stock-board', points: 30, howToEn: 'Show the whole board' });
  });

  it('is nothing when nothing changed', () => {
    expect(diffOverride(SHARED, fieldsFromTask(SHARED))).toBeNull();
  });

  it('notices a changed list of panels', () => {
    const edited = { ...fieldsFromTask(SHARED), panels: ['stock', 'dsr'] as KavachTaskDef['panels'] };
    expect(diffOverride(SHARED, edited)?.panels).toEqual(['stock', 'dsr']);
  });

  it('puts an override in a list, replacing the old one, or takes it out', () => {
    const list = [{ code: 'a', points: 1 }, { code: 'b', points: 2 }];
    expect(withOverride(list, 'a', { code: 'a', points: 9 })).toEqual([{ code: 'b', points: 2 }, { code: 'a', points: 9 }]);
    expect(withOverride(list, 'a', null)).toEqual([{ code: 'b', points: 2 }]);
  });

  it('hides and shows a point once', () => {
    expect(withHidden(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(withHidden(['a', 'b'], 'b', true)).toEqual(['a', 'b']);
    expect(withHidden(['a', 'b'], 'a', false)).toEqual(['b']);
  });
});
