import { expect, test } from 'vitest';

import { pinSslMode } from '../../src/server/db';

test('aliased SSL modes are pinned to verify-full', () => {
  for (const mode of ['prefer', 'require', 'verify-ca']) {
    expect(pinSslMode(`postgresql://user@db.example/app?sslmode=${mode}&channel_binding=require`)).toBe('postgresql://user@db.example/app?sslmode=verify-full&channel_binding=require');
  }
});

test('other database URLs are left unchanged', () => {
  for (const url of ['postgresql://user@localhost/app', 'postgresql://user@db.example/app?sslmode=disable', 'postgresql://user@db.example/app?sslmode=verify-full']) {
    expect(pinSslMode(url)).toBe(url);
  }
});
