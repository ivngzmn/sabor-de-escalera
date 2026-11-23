import { expect, test } from 'vitest';
import { returningMemberTarget } from '../../src/features/accounts/permissions';

const origin = 'https://escalera.example';

test('returning members who signed in from the home page land on their profile', () => {
  expect(returningMemberTarget('/', origin)).toBe('/profile');
  expect(returningMemberTarget('/?lang=es', origin)).toBe('/profile?lang=es');
});

test('returning members keep a deeper return target such as a favorite intent', () => {
  expect(returningMemberTarget('/favorites?recipe=arroz&intent=favorite&lang=es', origin)).toBe('/favorites?recipe=arroz&intent=favorite&lang=es');
  expect(returningMemberTarget('/add-recipe', origin)).toBe('/add-recipe');
});
